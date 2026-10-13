"""routes/purchases.py — Purchase CRUD with transactional stock updates"""
from flask import Blueprint, jsonify, request
from datetime import date
import db
from services.inventory_service import adjust_stock, MOVEMENT_IN

bp = Blueprint("purchases", __name__)


@bp.get("/api/purchases")
def list_purchases():
    q_supplier  = request.args.get("supplier_id", "").strip()
    q_date_from = request.args.get("date_from",   "").strip()
    q_date_to   = request.args.get("date_to",     "").strip()
    page        = max(1, int(request.args.get("page", 1)))
    per_page    = 20

    cond, params = [], []
    if q_supplier:
        cond.append("p.supplier_id = %s"); params.append(int(q_supplier))
    if q_date_from:
        cond.append("p.purchase_date >= %s"); params.append(q_date_from)
    if q_date_to:
        cond.append("p.purchase_date <= %s"); params.append(q_date_to)
    where = ("WHERE " + " AND ".join(cond)) if cond else ""

    total  = (db.fetchone(f"SELECT COUNT(*) AS n FROM purchase p {where}", tuple(params)) or {}).get("n", 0)
    offset = (page - 1) * per_page
    rows   = db.fetchall(
        f"""SELECT p.purchase_id, p.purchase_date, p.total_amount,
                   s.supplier_name
            FROM purchase p
            JOIN supplier s ON s.supplier_id = p.supplier_id
            {where}
            ORDER BY p.purchase_date DESC, p.purchase_id DESC
            LIMIT %s OFFSET %s""",
        tuple(params) + (per_page, offset)
    )
    for r in rows:
        r["total_amount"]  = float(r["total_amount"])
        r["purchase_date"] = str(r["purchase_date"])
    return jsonify({"items": rows, "total": total, "page": page, "per_page": per_page})


@bp.get("/api/purchases/<int:pid>")
def get_purchase(pid):
    header = db.fetchone(
        """SELECT p.purchase_id, p.purchase_date, p.total_amount, p.supplier_id,
                  s.supplier_name
           FROM purchase p
           JOIN supplier s ON s.supplier_id = p.supplier_id
           WHERE p.purchase_id = %s""", (pid,)
    )
    if not header:
        return jsonify({"error": "Purchase not found."}), 404
    header["total_amount"]  = float(header["total_amount"])
    header["purchase_date"] = str(header["purchase_date"])
    items = db.fetchall(
        """SELECT pi.purchase_item_id, pi.product_id, pr.product_name,
                  pi.quantity, pi.unit_cost,
                  (pi.quantity * pi.unit_cost) AS subtotal
           FROM purchase_item pi
           JOIN product pr ON pr.product_id = pi.product_id
           WHERE pi.purchase_id = %s ORDER BY pi.purchase_item_id""", (pid,)
    )
    for i in items:
        i["unit_cost"] = float(i["unit_cost"])
        i["subtotal"]  = float(i["subtotal"])
    header["items"] = items
    return jsonify(header)


@bp.post("/api/purchases")
def create_purchase():
    data   = request.get_json(force=True) or {}
    errors = _validate(data)
    if errors:
        return jsonify({"error": "; ".join(errors)}), 400

    supplier_id   = int(data["supplier_id"])
    purchase_date = data.get("purchase_date") or date.today().isoformat()
    items         = data["items"]
    server_total  = sum(int(i["quantity"]) * float(i["unit_cost"]) for i in items)

    conn = db.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT supplier_id FROM supplier WHERE supplier_id = %s", (supplier_id,))
        if not cur.fetchone():
            conn.rollback()
            return jsonify({"error": "Supplier not found."}), 404

        cur.execute(
            "INSERT INTO purchase (supplier_id, purchase_date, total_amount) VALUES (%s, %s, %s)",
            (supplier_id, purchase_date, server_total)
        )
        purchase_id = cur.lastrowid

        for item in items:
            product_id = int(item["product_id"])
            qty        = int(item["quantity"])
            unit_cost  = float(item["unit_cost"])
            cur.execute("SELECT product_id FROM product WHERE product_id = %s", (product_id,))
            if not cur.fetchone():
                raise ValueError(f"Product ID {product_id} not found.")
            cur.execute(
                "INSERT INTO purchase_item (purchase_id, product_id, quantity, unit_cost) "
                "VALUES (%s, %s, %s, %s)",
                (purchase_id, product_id, qty, unit_cost)
            )
            adjust_stock(cur, product_id, qty, MOVEMENT_IN)

        conn.commit()
        return jsonify({"purchase_id": purchase_id, "total_amount": server_total}), 201
    except ValueError as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 400
    except Exception:
        conn.rollback()
        return jsonify({"error": "Database error. Transaction rolled back."}), 500
    finally:
        conn.close()


@bp.delete("/api/purchases/<int:pid>")
def delete_purchase(pid):
    existing = db.fetchone("SELECT * FROM purchase WHERE purchase_id = %s", (pid,))
    if not existing:
        return jsonify({"error": "Purchase not found."}), 404
    return jsonify({
        "error": "Purchase records cannot be deleted — they are part of stock and financial history."
    }), 409


def _validate(data):
    errors = []
    if not data.get("supplier_id"):
        errors.append("Supplier is required.")
    items = data.get("items") or []
    if not items:
        errors.append("At least one purchase item is required.")
    for i, item in enumerate(items, 1):
        try:
            qty = int(item.get("quantity", 0))
            if qty <= 0:
                errors.append(f"Item {i}: quantity must be positive.")
        except (TypeError, ValueError):
            errors.append(f"Item {i}: invalid quantity.")
        try:
            cost = float(item.get("unit_cost", 0))
            if cost <= 0:
                errors.append(f"Item {i}: unit cost must be positive.")
        except (TypeError, ValueError):
            errors.append(f"Item {i}: invalid unit cost.")
        if not item.get("product_id"):
            errors.append(f"Item {i}: product is required.")
    return errors
