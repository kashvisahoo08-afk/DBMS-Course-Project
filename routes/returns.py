"""routes/returns.py — Return_Item API with server-side eligibility"""
from flask import Blueprint, jsonify, request
from datetime import date
import db
from services.inventory_service import adjust_stock, MOVEMENT_RETURN

bp = Blueprint("returns", __name__)


@bp.get("/api/returns")
def list_returns():
    date_from = request.args.get("date_from", "").strip()
    date_to   = request.args.get("date_to",   "").strip()
    page      = max(1, int(request.args.get("page", 1)))
    per_page  = 20

    cond, params = [], []
    if date_from:
        cond.append("r.return_date >= %s"); params.append(date_from)
    if date_to:
        cond.append("r.return_date <= %s"); params.append(date_to)
    where = ("WHERE " + " AND ".join(cond)) if cond else ""

    total  = (db.fetchone(f"SELECT COUNT(*) AS n FROM return_item r {where}", tuple(params)) or {}).get("n", 0)
    offset = (page - 1) * per_page
    rows   = db.fetchall(
        f"""SELECT r.return_id, r.sale_id, r.product_id, p.product_name,
                   r.quantity, r.return_date,
                   COALESCE(c.customer_name,'Walk-in') AS customer_name
            FROM return_item r
            JOIN product  p ON p.product_id  = r.product_id
            JOIN sale     s ON s.sale_id      = r.sale_id
            LEFT JOIN customer c ON c.customer_id = s.customer_id
            {where}
            ORDER BY r.return_date DESC, r.return_id DESC
            LIMIT %s OFFSET %s""",
        tuple(params) + (per_page, offset)
    )
    for r in rows:
        r["return_date"] = str(r["return_date"])
    return jsonify({"items": rows, "total": total, "page": page, "per_page": per_page})


@bp.get("/api/returns/sale/<int:sale_id>/eligible")
def eligible_returns(sale_id):
    sale = db.fetchone("SELECT sale_id FROM sale WHERE sale_id = %s", (sale_id,))
    if not sale:
        return jsonify({"error": "Sale not found."}), 404
    rows = db.fetchall(
        """SELECT si.product_id, p.product_name,
                  si.quantity AS sold_qty,
                  COALESCE(SUM(ri.quantity),0) AS returned_qty
           FROM sale_item si
           JOIN product p ON p.product_id = si.product_id
           LEFT JOIN return_item ri
                  ON ri.sale_id = si.sale_id AND ri.product_id = si.product_id
           WHERE si.sale_id = %s
           GROUP BY si.product_id, p.product_name, si.quantity""",
        (sale_id,)
    )
    for r in rows:
        r["eligible_qty"] = r["sold_qty"] - r["returned_qty"]
    return jsonify(rows)


@bp.post("/api/returns")
def create_return():
    data   = request.get_json(force=True) or {}
    errors = _validate(data)
    if errors:
        return jsonify({"error": "; ".join(errors)}), 400

    sale_id     = int(data["sale_id"])
    product_id  = int(data["product_id"])
    quantity    = int(data["quantity"])
    return_date = data.get("return_date") or date.today().isoformat()

    conn = db.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT sale_id FROM sale WHERE sale_id = %s FOR UPDATE", (sale_id,))
        if not cur.fetchone():
            conn.rollback()
            return jsonify({"error": "Sale not found."}), 404

        cur.execute(
            """SELECT si.quantity AS sold_qty,
                      COALESCE(SUM(ri.quantity),0) AS returned_qty
               FROM sale_item si
               LEFT JOIN return_item ri
                      ON ri.sale_id    = si.sale_id
                     AND ri.product_id = si.product_id
               WHERE si.sale_id    = %s
                 AND si.product_id = %s
               GROUP BY si.quantity""",
            (sale_id, product_id)
        )
        eligibility = cur.fetchone()
        if not eligibility:
            conn.rollback()
            return jsonify({"error": "This product was not part of the specified sale."}), 400

        eligible = eligibility["sold_qty"] - eligibility["returned_qty"]
        if quantity > eligible:
            conn.rollback()
            return jsonify({
                "error": f"Return quantity ({quantity}) exceeds eligible quantity ({eligible})."
            }), 400

        cur.execute(
            "INSERT INTO return_item (sale_id, product_id, quantity, return_date) VALUES (%s,%s,%s,%s)",
            (sale_id, product_id, quantity, return_date)
        )
        adjust_stock(cur, product_id, quantity, MOVEMENT_RETURN)
        conn.commit()
        return jsonify({"return_id": cur.lastrowid}), 201
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
    if not data.get("sale_id"):
        errors.append("Sale ID is required.")
    if not data.get("product_id"):
        errors.append("Product is required.")
    try:
        qty = int(data.get("quantity", 0))
        if qty <= 0:
            errors.append("Return quantity must be positive.")
    except (TypeError, ValueError):
        errors.append("Return quantity must be a valid integer.")
    return errors
