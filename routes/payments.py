"""routes/payments.py — Payment CRUD with balance enforcement"""
from flask import Blueprint, jsonify, request
from datetime import date
import db

bp = Blueprint("payments", __name__)

PAYMENT_METHODS = ["Cash", "Card", "UPI", "Net Banking", "Cheque", "Other"]


@bp.get("/api/payments/methods")
def payment_methods():
    return jsonify(PAYMENT_METHODS)


@bp.get("/api/payments")
def list_payments():
    q        = request.args.get("q", "").strip()
    page     = max(1, int(request.args.get("page", 1)))
    per_page = 20

    cond, params = [], []
    if q:
        cond.append("i.invoice_code LIKE %s"); params.append(f"%{q}%")
    where = ("WHERE " + " AND ".join(cond)) if cond else ""

    total  = (db.fetchone(
        f"SELECT COUNT(*) AS n FROM payment pay JOIN invoice i ON i.invoice_id = pay.invoice_id {where}",
        tuple(params)
    ) or {}).get("n", 0)
    offset = (page - 1) * per_page
    rows   = db.fetchall(
        f"""SELECT pay.payment_id, pay.invoice_id, i.invoice_code,
                   i.sale_id, pay.payment_date, pay.amount, pay.payment_method,
                   COALESCE(c.customer_name,'Walk-in') AS customer_name
            FROM payment pay
            JOIN  invoice  i ON i.invoice_id    = pay.invoice_id
            JOIN  sale     s ON s.sale_id         = i.sale_id
            LEFT JOIN customer c ON c.customer_id = s.customer_id
            {where}
            ORDER BY pay.payment_date DESC, pay.payment_id DESC
            LIMIT %s OFFSET %s""",
        tuple(params) + (per_page, offset)
    )
    for r in rows:
        r["amount"]       = float(r["amount"])
        r["payment_date"] = str(r["payment_date"])
    return jsonify({"items": rows, "total": total, "page": page, "per_page": per_page})


@bp.post("/api/payments")
def create_payment():
    data   = request.get_json(force=True) or {}
    errors = _validate(data)
    if errors:
        return jsonify({"error": "; ".join(errors)}), 400

    invoice_id   = int(data["invoice_id"])
    payment_date = data.get("payment_date") or date.today().isoformat()
    amount       = round(float(data["amount"]), 2)
    method       = data["payment_method"].strip()

    conn = db.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT i.invoice_id, s.total_amount FROM invoice i "
            "JOIN sale s ON s.sale_id = i.sale_id WHERE i.invoice_id = %s FOR UPDATE",
            (invoice_id,)
        )
        inv = cur.fetchone()
        if not inv:
            conn.rollback()
            return jsonify({"error": "Invoice not found."}), 404

        cur.execute(
            "SELECT COALESCE(SUM(amount),0) AS paid FROM payment WHERE invoice_id = %s",
            (invoice_id,)
        )
        paid_row     = cur.fetchone()
        already_paid = round(float(paid_row["paid"]) if paid_row else 0, 2)
        total        = round(float(inv["total_amount"]), 2)
        remaining    = round(total - already_paid, 2)

        if amount > remaining + 0.005:
            conn.rollback()
            return jsonify({
                "error": (
                    f"Payment of ₹{amount:,.2f} exceeds the outstanding balance of ₹{remaining:,.2f}. "
                    f"Invoice total: ₹{total:,.2f}, already paid: ₹{already_paid:,.2f}."
                )
            }), 400

        cur.execute(
            "INSERT INTO payment (invoice_id, payment_date, amount, payment_method) VALUES (%s,%s,%s,%s)",
            (invoice_id, payment_date, amount, method)
        )
        conn.commit()
        return jsonify({"payment_id": cur.lastrowid}), 201
    except Exception:
        conn.rollback()
        return jsonify({"error": "Database error. Transaction rolled back."}), 500
    finally:
        conn.close()


@bp.delete("/api/payments/<int:pid>")
def delete_payment(pid):
    existing = db.fetchone("SELECT * FROM payment WHERE payment_id = %s", (pid,))
    if not existing:
        return jsonify({"error": "Payment not found."}), 404
    try:
        db.execute("DELETE FROM payment WHERE payment_id = %s", (pid,))
        return jsonify({"message": "Payment deleted."})
    except Exception:
        return jsonify({"error": "Database error. Please try again."}), 500


def _validate(data):
    errors = []
    if not data.get("invoice_id"):
        errors.append("Invoice is required.")
    try:
        amt = float(data.get("amount", 0))
        if amt <= 0:
            errors.append("Amount must be greater than zero.")
    except (TypeError, ValueError):
        errors.append("Amount must be a valid number.")
    if not (data.get("payment_method") or "").strip():
        errors.append("Payment method is required.")
    return errors
