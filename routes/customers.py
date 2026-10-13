"""routes/customers.py — Customer CRUD API"""
import re
from flask import Blueprint, jsonify, request
import db

bp = Blueprint("customers", __name__)
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@bp.get("/api/customers")
def list_customers():
    q         = request.args.get("q", "").strip()
    raw_pp    = request.args.get("per_page", "")
    flat_mode = (raw_pp.lower() == "all") if raw_pp else False
    page      = max(1, int(request.args.get("page", 1)))
    per_page  = 500 if flat_mode else 20

    cond, params = [], []
    if q:
        cond.append("(c.customer_name LIKE %s OR c.phone LIKE %s OR c.email LIKE %s)")
        params += [f"%{q}%", f"%{q}%", f"%{q}%"]
    where = ("WHERE " + " AND ".join(cond)) if cond else ""

    total  = (db.fetchone(f"SELECT COUNT(*) AS n FROM customer c {where}", tuple(params)) or {}).get("n", 0)
    offset = (page - 1) * per_page
    rows   = db.fetchall(
        f"""SELECT c.customer_id, c.customer_name, c.phone, c.email,
                   COUNT(DISTINCT s.sale_id)        AS sale_count,
                   COALESCE(SUM(s.total_amount), 0) AS total_value
            FROM customer c
            LEFT JOIN sale s ON s.customer_id = c.customer_id
            {where}
            GROUP BY c.customer_id, c.customer_name, c.phone, c.email
            ORDER BY c.customer_name
            LIMIT %s OFFSET %s""",
        tuple(params) + (per_page, offset)
    )
    for r in rows:
        r["total_value"] = float(r["total_value"])

    if flat_mode:
        return jsonify(rows)
    return jsonify({"items": rows, "total": total, "page": page, "per_page": per_page})


@bp.get("/api/customers/<int:cid>")
def get_customer(cid):
    row = db.fetchone("SELECT * FROM customer WHERE customer_id = %s", (cid,))
    if not row:
        return jsonify({"error": "Customer not found."}), 404
    return jsonify(row)


@bp.post("/api/customers")
def create_customer():
    data   = request.get_json(force=True) or {}
    errors = _validate(data)
    if errors:
        return jsonify({"error": "; ".join(errors)}), 400
    try:
        new_id = db.execute(
            "INSERT INTO customer (customer_name, phone, email) VALUES (%s, %s, %s)",
            (data["customer_name"].strip(),
             data.get("phone", "").strip() or None,
             data.get("email", "").strip() or None)
        )
        return jsonify({"customer_id": new_id}), 201
    except Exception:
        return jsonify({"error": "Database error. Please try again."}), 500


@bp.put("/api/customers/<int:cid>")
def update_customer(cid):
    existing = db.fetchone("SELECT * FROM customer WHERE customer_id = %s", (cid,))
    if not existing:
        return jsonify({"error": "Customer not found."}), 404
    data   = request.get_json(force=True) or {}
    errors = _validate(data)
    if errors:
        return jsonify({"error": "; ".join(errors)}), 400
    try:
        db.execute(
            "UPDATE customer SET customer_name=%s, phone=%s, email=%s WHERE customer_id=%s",
            (data["customer_name"].strip(),
             data.get("phone", "").strip() or None,
             data.get("email", "").strip() or None, cid)
        )
        return jsonify({"customer_id": cid})
    except Exception:
        return jsonify({"error": "Database error. Please try again."}), 500


@bp.delete("/api/customers/<int:cid>")
def delete_customer(cid):
    existing = db.fetchone("SELECT * FROM customer WHERE customer_id = %s", (cid,))
    if not existing:
        return jsonify({"error": "Customer not found."}), 404
    used = db.fetchone("SELECT COUNT(*) AS n FROM sale WHERE customer_id = %s", (cid,))
    if used and used["n"] > 0:
        return jsonify({
            "error": f"Cannot delete — this customer has {used['n']} sale record(s). Preserve for historical reporting."
        }), 409
    try:
        db.execute("DELETE FROM customer WHERE customer_id = %s", (cid,))
        return jsonify({"message": "Customer deleted."})
    except Exception:
        return jsonify({"error": "Database error. Please try again."}), 500


def _validate(data):
    errors = []
    if not (data.get("customer_name") or "").strip():
        errors.append("Customer name is required.")
    email = (data.get("email") or "").strip()
    if email and not EMAIL_RE.match(email):
        errors.append("Invalid email format.")
    return errors
