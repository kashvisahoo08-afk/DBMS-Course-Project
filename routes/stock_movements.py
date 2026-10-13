"""routes/stock_movements.py — Stock movement history (read-only)"""
from flask import Blueprint, jsonify, request
import db

bp = Blueprint("stock_movements", __name__)


@bp.get("/api/stock-movements")
def list_movements():
    q_product     = request.args.get("product_id",    "").strip()
    q_type        = request.args.get("movement_type", "").strip()
    date_from     = request.args.get("date_from",     "").strip()
    date_to       = request.args.get("date_to",       "").strip()
    page          = max(1, int(request.args.get("page", 1)))
    per_page      = 30

    cond, params = [], []
    if q_product:
        cond.append("sm.product_id = %s"); params.append(int(q_product))
    if q_type:
        cond.append("sm.movement_type = %s"); params.append(q_type.upper())
    if date_from:
        cond.append("sm.movement_date >= %s"); params.append(date_from)
    if date_to:
        cond.append("sm.movement_date <= %s"); params.append(date_to)
    where = ("WHERE " + " AND ".join(cond)) if cond else ""

    total  = (db.fetchone(
        f"SELECT COUNT(*) AS n FROM stock_movement sm {where}", tuple(params)
    ) or {}).get("n", 0)
    offset = (page - 1) * per_page
    rows   = db.fetchall(
        f"""SELECT sm.movement_id, sm.product_id, p.product_name,
                   sm.movement_type, sm.quantity,
                   sm.movement_date
            FROM stock_movement sm
            JOIN product p ON p.product_id = sm.product_id
            {where}
            ORDER BY sm.movement_date DESC, sm.movement_id DESC
            LIMIT %s OFFSET %s""",
        tuple(params) + (per_page, offset)
    )
    for r in rows:
        r["movement_date"] = str(r["movement_date"])
    return jsonify({"items": rows, "total": total, "page": page, "per_page": per_page})
