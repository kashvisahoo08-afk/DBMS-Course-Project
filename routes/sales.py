"""routes/sales.py — Sales & Billing with full transactional workflow"""
import uuid
from flask import Blueprint, jsonify, request
from datetime import date
import db
from services.inventory_service import adjust_stock, MOVEMENT_OUT

bp = Blueprint("sales", __name__)


@bp.get("/api/sales")
def list_sales():
    q_date_from = request.args.get("date_from",   "").strip()
    q_date_to   = request.args.get("date_to",     "").strip()
    q_customer  = request.args.get("customer_id", "").strip()
    page        = max(1, int(request.args.get("page", 1)))
    per_page    = 20

    cond, params = [], []
    if q_date_from:
        cond.append("s.sale_date >= %s"); params.append(q_date_from)
    if q_date_to:
        cond.append("s.sale_date <= %s"); params.append(q_date_to)
    if q_customer:
        cond.append("s.customer_id = %s"); params.append(int(q_customer))
    where = ("WHERE " + " AND ".join(cond)) if cond else ""

    total  = (db.fetchone(f"SELECT COUNT(*) AS n FROM sale s {where}", tuple(params)) or {}).get("n", 0)
    offset = (page - 1) * per_page
    rows   = db.fetchall(
        f"""SELECT s.sale_id, DATE(s.sale_date) AS sale_date, s.total_amount,
                   COALESCE(c.customer_name,'Walk-in') AS customer_name,
                   s.customer_id, i.invoice_code
            FROM sale s
            LEFT JOIN customer c ON c.customer_id = s.customer_id
            LEFT JOIN invoice  i ON i.sale_id     = s.sale_id
            {where}
            ORDER BY s.sale_date DESC, s.sale_id DESC
            LIMIT %s OFFSET %s""",
        tuple(params) + (per_page, offset)
    )
    for r in rows:
        r["total_amount"] = float(r["total_amount"])
        r["sale_date"]    = str(r["sale_date"])
    return jsonify({"items": rows, "total": total, "page": page, "per_page": per_page})


@bp.get("/api/sales/<int:sid>")
def get_sale(sid):
    header = db.fetchone(
        """SELECT s.sale_id, DATE(s.sale_date) AS sale_date, s.total_amount,
                  s.customer_id,
                  COALESCE(c.customer_name,'Walk-in') AS customer_name
           FROM sale s
           LEFT JOIN customer c ON c.customer_id = s.customer_id
           WHERE s.sale_id = %s""", (sid,)
    )
    if not header:
        return jsonify({"error": "Sale not found."}), 404
    header["total_amount"] = float(header["total_amount"])
    header["sale_date"]    = str(header["sale_date"])

    items = db.fetchall(
        """SELECT si.sale_item_id, si.product_id, p.product_name,
                  si.quantity, si.unit_price,
                  (si.quantity * si.unit_price) AS line_total
           FROM sale_item si
           JOIN product p ON p.product_id = si.product_id
           WHERE si.sale_id = %s ORDER BY si.sale_item_id""", (sid,)
    )
    for i in items:
        i["unit_price"] = float(i["unit_price"])
        i["line_total"] = float(i["line_total"])
    header["items"] = items

    inv = db.fetchone(
        "SELECT invoice_id, invoice_code, invoice_date FROM invoice WHERE sale_id = %s", (sid,)
    )
    if inv:
        inv["invoice_date"] = str(inv["invoice_date"])
    header["invoice"] = inv
    return jsonify(header)


@bp.post("/api/sales")
def create_sale():
    data   = request.get_json(force=True) or {}
    errors = _validate(data)
    if errors:
        return jsonify({"error": "; ".join(errors)}), 400

    customer_id    = int(data["customer_id"]) if data.get("customer_id") else None
    sale_date      = data.get("sale_date") or date.today().isoformat()
    items          = data["items"]
    payment_method = (data.get("payment_method") or "").strip() or None
    payment_amount = float(data["payment_amount"]) if data.get("payment_amount") else None

    conn = db.get_connection()
    try:
        cur = conn.cursor(dictionary=True)

        server_total    = 0.0
        validated_items = []
        for item in items:
            product_id = int(item["product_id"])
            qty        = int(item["quantity"])
            cur.execute(
                "SELECT product_id, product_name, unit_price, stock_qty "
                "FROM product WHERE product_id = %s FOR UPDATE", (product_id,)
            )
            prod = cur.fetchone()
            if not prod:
                raise ValueError(f"Product ID {product_id} not found.")
            if qty > prod["stock_qty"]:
                raise ValueError(
                    f"Insufficient stock for '{prod['product_name']}'. "
                    f"Available: {prod['stock_qty']}, requested: {qty}."
                )
            unit_price    = float(prod["unit_price"])
            server_total += qty * unit_price
            validated_items.append({"product_id": product_id, "qty": qty, "unit_price": unit_price})

        cur.execute(
            "INSERT INTO sale (customer_id, sale_date, total_amount) VALUES (%s, %s, %s)",
            (customer_id, sale_date, server_total)
        )
        sale_id = cur.lastrowid

        for vi in validated_items:
            cur.execute(
                "INSERT INTO sale_item (sale_id, product_id, quantity, unit_price) VALUES (%s,%s,%s,%s)",
                (sale_id, vi["product_id"], vi["qty"], vi["unit_price"])
            )
            adjust_stock(cur, vi["product_id"], -vi["qty"], MOVEMENT_OUT)

        # invoice_code is varchar(20) — use compact format
        invoice_code = f"INV-{uuid.uuid4().hex[:10].upper()}"
        cur.execute(
            "INSERT INTO invoice (sale_id, invoice_code, invoice_date) VALUES (%s, %s, CURDATE())",
            (sale_id, invoice_code)
        )
        invoice_id = cur.lastrowid

        if payment_method and payment_amount and payment_amount > 0:
            if payment_amount > server_total + 0.005:
                raise ValueError("Payment amount cannot exceed the invoice total.")
            cur.execute(
                "INSERT INTO payment (invoice_id, payment_date, amount, payment_method) "
                "VALUES (%s, CURDATE(), %s, %s)",
                (invoice_id, round(payment_amount, 2), payment_method)
            )

        conn.commit()
        return jsonify({
            "sale_id":      sale_id,
            "invoice_id":   invoice_id,
            "invoice_code": invoice_code,
            "total_amount": round(server_total, 2),
        }), 201
    except ValueError as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 400
    except Exception:
        conn.rollback()
        return jsonify({"error": "Database error. Transaction rolled back."}), 500
    finally:
        conn.close()


def _validate(data):
    errors = []
    items = data.get("items") or []
    if not items:
        errors.append("At least one product is required.")
    for i, item in enumerate(items, 1):
        try:
            qty = int(item.get("quantity", 0))
            if qty <= 0:
                errors.append(f"Item {i}: quantity must be positive.")
        except (TypeError, ValueError):
            errors.append(f"Item {i}: invalid quantity.")
        if not item.get("product_id"):
            errors.append(f"Item {i}: product is required.")
    return errors
