"""routes/suppliers.py — Supplier CRUD API"""
import re
from flask import Blueprint, jsonify, request
import db
from mysql.connector import IntegrityError

bp = Blueprint("suppliers", __name__)
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@bp.get("/api/suppliers")
def list_suppliers():
    q         = request.args.get("q", "").strip()
    raw_pp    = request.args.get("per_page", "")
    flat_mode = (raw_pp.lower() == "all") if raw_pp else False
    page      = max(1, int(request.args.get("page", 1)))
    per_page  = 500 if flat_mode else 20

    cond, params = [], []
    if q:
        cond.append("(s.supplier_name LIKE %s OR s.phone LIKE %s OR s.email LIKE %s)")
        params += [f"%{q}%", f"%{q}%", f"%{q}%"]
    where = ("WHERE " + " AND ".join(cond)) if cond else ""

    total  = (db.fetchone(f"SELECT COUNT(*) AS n FROM supplier s {where}", tuple(params)) or {}).get("n", 0)
    offset = (page - 1) * per_page
    rows   = db.fetchall(
        f"""SELECT s.supplier_id, s.supplier_name, s.phone, s.email,
                   COUNT(DISTINCT p.purchase_id)    AS purchase_count,
                   COALESCE(SUM(p.total_amount), 0) AS total_expenditure
            FROM supplier s
            LEFT JOIN purchase p ON p.supplier_id = s.supplier_id
            {where}
            GROUP BY s.supplier_id, s.supplier_name, s.phone, s.email
            ORDER BY s.supplier_name
            LIMIT %s OFFSET %s""",
        tuple(params) + (per_page, offset)
    )
    for r in rows:
        r["total_expenditure"] = float(r["total_expenditure"])

    if flat_mode:
        return jsonify(rows)
    return jsonify({"items": rows, "total": total, "page": page, "per_page": per_page})


@bp.get("/api/suppliers/<int:sid>")
def get_supplier(sid):
    row = db.fetchone("SELECT * FROM supplier WHERE supplier_id = %s", (sid,))
    if not row:
        return jsonify({"error": "Supplier not found."}), 404
    return jsonify(row)


@bp.post("/api/suppliers")
def create_supplier():
    data   = request.get_json(force=True) or {}
    errors = _validate(data)
    if errors:
        return jsonify({"error": "; ".join(errors)}), 400
    try:
        new_id = db.execute(
            "INSERT INTO supplier (supplier_name, phone, email) VALUES (%s, %s, %s)",
            (data["supplier_name"].strip(),
             data.get("phone", "").strip() or None,
             data.get("email", "").strip() or None)
        )
        return jsonify({"supplier_id": new_id}), 201
    except Exception:
        return jsonify({"error": "Database error. Please try again."}), 500


@bp.put("/api/suppliers/<int:sid>")
def update_supplier(sid):
    existing = db.fetchone("SELECT * FROM supplier WHERE supplier_id = %s", (sid,))
    if not existing:
        return jsonify({"error": "Supplier not found."}), 404
    data   = request.get_json(force=True) or {}
    errors = _validate(data)
    if errors:
        return jsonify({"error": "; ".join(errors)}), 400
    try:
        db.execute(
            "UPDATE supplier SET supplier_name=%s, phone=%s, email=%s WHERE supplier_id=%s",
            (data["supplier_name"].strip(),
             data.get("phone", "").strip() or None,
             data.get("email", "").strip() or None, sid)
        )
        return jsonify({"supplier_id": sid})
    except Exception:
        return jsonify({"error": "Database error. Please try again."}), 500


@bp.delete("/api/suppliers/<int:sid>")
def delete_supplier(sid):
    existing = db.fetchone("SELECT * FROM supplier WHERE supplier_id = %s", (sid,))
    if not existing:
        return jsonify({"error": "Supplier not found."}), 404
    used = db.fetchone("SELECT COUNT(*) AS n FROM purchase WHERE supplier_id = %s", (sid,))
    if used and used["n"] > 0:
        return jsonify({
            "error": f"Cannot delete — this supplier has {used['n']} purchase record(s). Preserve for historical reporting."
        }), 409
    try:
        db.execute("DELETE FROM supplier WHERE supplier_id = %s", (sid,))
        return jsonify({"message": "Supplier deleted."})
    except Exception:
        return jsonify({"error": "Database error. Please try again."}), 500


def _validate(data):
    errors = []
    if not (data.get("supplier_name") or "").strip():
        errors.append("Supplier name is required.")
    email = (data.get("email") or "").strip()
    if email and not EMAIL_RE.match(email):
        errors.append("Invalid email format.")
    return errors
