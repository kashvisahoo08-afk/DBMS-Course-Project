"""routes/invoices.py — Invoice listing and detail"""
from flask import Blueprint, jsonify, request
import db

bp = Blueprint("invoices", __name__)


@bp.get("/api/invoices")
def list_invoices():
    q         = request.args.get("q",         "").strip()
    date_from = request.args.get("date_from", "").strip()
    date_to   = request.args.get("date_to",   "").strip()
    raw_pp    = request.args.get("per_page",  "")
    flat_mode = (raw_pp.lower() == "all") if raw_pp else False
    page      = max(1, int(request.args.get("page", 1)))
    per_page  = 500 if flat_mode else 20

    cond, params = [], []
    if q:
        cond.append("i.invoice_code LIKE %s"); params.append(f"%{q}%")
    if date_from:
        cond.append("i.invoice_date >= %s"); params.append(date_from)
    if date_to:
        cond.append("i.invoice_date <= %s"); params.append(date_to)
    where = ("WHERE " + " AND ".join(cond)) if cond else ""

    total  = (db.fetchone(f"SELECT COUNT(*) AS n FROM invoice i {where}", tuple(params)) or {}).get("n", 0)
    offset = (page - 1) * per_page
    rows   = db.fetchall(
        f"""SELECT i.invoice_id, i.invoice_code, i.invoice_date,
                   i.sale_id, s.total_amount,
                   COALESCE(c.customer_name,'Walk-in') AS customer_name,
                   COALESCE(SUM(pay.amount),0) AS paid_amount
            FROM invoice i
            JOIN  sale     s   ON s.sale_id      = i.sale_id
            LEFT JOIN customer c  ON c.customer_id  = s.customer_id
            LEFT JOIN payment  pay ON pay.invoice_id = i.invoice_id
            {where}
            GROUP BY i.invoice_id, i.invoice_code, i.invoice_date,
                     i.sale_id, s.total_amount, c.customer_name
            ORDER BY i.invoice_date DESC, i.invoice_id DESC
            LIMIT %s OFFSET %s""",
        tuple(params) + (per_page, offset)
    )
    for r in rows:
        r["total_amount"] = float(r["total_amount"])
        r["paid_amount"]  = float(r["paid_amount"])
        r["balance"]      = round(r["total_amount"] - r["paid_amount"], 2)
        r["invoice_date"] = str(r["invoice_date"])
        r["payment_status"] = (
            "Paid"    if r["balance"] <= 0.005
            else "Partial" if r["paid_amount"] > 0
            else "Unpaid"
        )

    if flat_mode:
        return jsonify(rows)
    return jsonify({"items": rows, "total": total, "page": page, "per_page": per_page})


@bp.get("/api/invoices/<int:inv_id>")
def get_invoice(inv_id):
    inv = db.fetchone(
        """SELECT i.invoice_id, i.invoice_code, i.invoice_date, i.sale_id,
                  s.total_amount, s.sale_date,
                  COALESCE(c.customer_name,'Walk-in') AS customer_name,
                  c.phone AS customer_phone, c.email AS customer_email
           FROM invoice i
           JOIN  sale     s ON s.sale_id     = i.sale_id
           LEFT JOIN customer c ON c.customer_id = s.customer_id
           WHERE i.invoice_id = %s""", (inv_id,)
    )
    if not inv:
        return jsonify({"error": "Invoice not found."}), 404
    inv["total_amount"] = float(inv["total_amount"])
    inv["invoice_date"] = str(inv["invoice_date"])
    inv["sale_date"]    = str(inv["sale_date"])

    items = db.fetchall(
        """SELECT si.product_id, p.product_name, si.quantity, si.unit_price,
                  (si.quantity * si.unit_price) AS line_total
           FROM sale_item si
           JOIN product p ON p.product_id = si.product_id
           WHERE si.sale_id = %s""", (inv["sale_id"],)
    )
    for i in items:
        i["unit_price"] = float(i["unit_price"])
        i["line_total"] = float(i["line_total"])

    payments = db.fetchall(
        "SELECT * FROM payment WHERE invoice_id = %s ORDER BY payment_date", (inv_id,)
    )
    for p in payments:
        p["amount"]       = float(p["amount"])
        p["payment_date"] = str(p["payment_date"])

    inv["items"]       = items
    inv["payments"]    = payments
    inv["paid_amount"] = round(sum(p["amount"] for p in payments), 2)
    inv["balance"]     = round(inv["total_amount"] - inv["paid_amount"], 2)
    return jsonify(inv)
