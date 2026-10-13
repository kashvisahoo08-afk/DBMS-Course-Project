"""routes/reports.py — 12 SQL reports with CSV export (lowercase table names)"""
import csv
import io
from flask import Blueprint, jsonify, request, Response
from datetime import date
import db
from config import Config

bp = Blueprint("reports", __name__)


def _csv(rows, filename):
    if not rows:
        return Response("", mimetype="text/csv",
                        headers={"Content-Disposition": f"attachment; filename={filename}"})
    out = io.StringIO()
    w   = csv.DictWriter(out, fieldnames=rows[0].keys())
    w.writeheader(); w.writerows(rows)
    return Response(out.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": f"attachment; filename={filename}"})


@bp.get("/api/reports/low-stock")
def low_stock():
    threshold = Config.LOW_STOCK_THRESHOLD
    rows = db.fetchall(
        """SELECT p.product_id, p.product_name, c.category_name, b.brand_name,
                  p.stock_qty, p.unit_price,
                  (p.stock_qty * p.unit_price) AS inventory_value
           FROM product p
           JOIN category c ON c.category_id = p.category_id
           JOIN brand    b ON b.brand_id    = p.brand_id
           WHERE p.stock_qty < %s ORDER BY p.stock_qty ASC""", (threshold,)
    )
    for r in rows:
        r["unit_price"]      = float(r["unit_price"])
        r["inventory_value"] = float(r["inventory_value"])
    if request.args.get("export") == "csv":
        return _csv(rows, "low_stock.csv")
    return jsonify({"threshold": threshold, "items": rows})


@bp.get("/api/reports/inventory-valuation")
def inventory_valuation():
    try:
        # View uses 'stock_value' column name
        rows = db.fetchall("SELECT * FROM product_stock_report ORDER BY stock_value DESC")
        for r in rows:
            r["unit_price"]      = float(r.get("unit_price", 0))
            # normalise to inventory_value for frontend consistency
            r["inventory_value"] = float(r.get("stock_value", 0))
    except Exception:
        rows = db.fetchall(
            """SELECT p.product_id, p.product_name, c.category_name, b.brand_name,
                      p.stock_qty, p.unit_price,
                      (p.stock_qty * p.unit_price) AS inventory_value
               FROM product p
               JOIN category c ON c.category_id = p.category_id
               JOIN brand    b ON b.brand_id    = p.brand_id
               ORDER BY inventory_value DESC"""
        )
        for r in rows:
            r["unit_price"]      = float(r.get("unit_price", 0))
            r["inventory_value"] = float(r.get("inventory_value", 0))
    total = round(sum(r["inventory_value"] for r in rows), 2)
    if request.args.get("export") == "csv":
        return _csv(rows, "inventory_valuation.csv")
    return jsonify({"items": rows, "total_value": total})


@bp.get("/api/reports/supplier-purchases")
def supplier_purchases():
    rows = db.fetchall(
        """SELECT s.supplier_id, s.supplier_name,
                  COUNT(DISTINCT p.purchase_id)    AS purchase_count,
                  COALESCE(SUM(p.total_amount), 0) AS total_expenditure
           FROM supplier s
           LEFT JOIN purchase p ON p.supplier_id = s.supplier_id
           GROUP BY s.supplier_id, s.supplier_name
           ORDER BY total_expenditure DESC"""
    )
    for r in rows:
        r["total_expenditure"] = float(r["total_expenditure"])
    if request.args.get("export") == "csv":
        return _csv(rows, "supplier_purchases.csv")
    return jsonify(rows)


@bp.get("/api/reports/daily-sales")
def daily_sales():
    date_from = request.args.get("date_from") or "2000-01-01"
    date_to   = request.args.get("date_to")   or date.today().isoformat()
    rows = db.fetchall(
        """SELECT DATE(sale_date) AS sale_day,
                  COUNT(*)                       AS sale_count,
                  COALESCE(SUM(total_amount), 0) AS revenue
           FROM sale
           WHERE DATE(sale_date) BETWEEN %s AND %s
           GROUP BY sale_day ORDER BY sale_day DESC""",
        (date_from, date_to)
    )
    for r in rows:
        r["sale_day"] = str(r["sale_day"])
        r["revenue"]  = float(r["revenue"])
    if request.args.get("export") == "csv":
        return _csv(rows, "daily_sales.csv")
    return jsonify(rows)


@bp.get("/api/reports/monthly-sales")
def monthly_sales():
    rows = db.fetchall(
        """SELECT YEAR(sale_date) AS yr, MONTH(sale_date) AS mo,
                  COUNT(*)                       AS sale_count,
                  COALESCE(SUM(total_amount), 0) AS revenue
           FROM sale
           GROUP BY yr, mo ORDER BY yr DESC, mo DESC"""
    )
    import calendar
    for r in rows:
        r["period"]  = f"{calendar.month_abbr[r['mo']]} {r['yr']}"
        r["revenue"] = float(r["revenue"])
    if request.args.get("export") == "csv":
        return _csv(rows, "monthly_sales.csv")
    return jsonify(rows)


@bp.get("/api/reports/returns")
def returns_report():
    date_from = request.args.get("date_from") or "2000-01-01"
    date_to   = request.args.get("date_to")   or date.today().isoformat()
    rows = db.fetchall(
        """SELECT r.return_id, r.return_date, r.sale_id,
                  p.product_name, r.quantity,
                  COALESCE(c.customer_name,'Walk-in') AS customer_name
           FROM return_item r
           JOIN product  p ON p.product_id  = r.product_id
           JOIN sale     s ON s.sale_id      = r.sale_id
           LEFT JOIN customer c ON c.customer_id = s.customer_id
           WHERE r.return_date BETWEEN %s AND %s
           ORDER BY r.return_date DESC""",
        (date_from, date_to)
    )
    for r in rows:
        r["return_date"] = str(r["return_date"])
    if request.args.get("export") == "csv":
        return _csv(rows, "returns.csv")
    return jsonify(rows)


@bp.get("/api/reports/fast-moving")
def fast_moving():
    rows = db.fetchall(
        """SELECT p.product_id, p.product_name, c.category_name, b.brand_name,
                  COALESCE(SUM(si.quantity), 0) AS total_sold
           FROM product p
           JOIN category c ON c.category_id = p.category_id
           JOIN brand    b ON b.brand_id    = p.brand_id
           LEFT JOIN sale_item si ON si.product_id = p.product_id
           GROUP BY p.product_id, p.product_name, c.category_name, b.brand_name
           ORDER BY total_sold DESC LIMIT 20"""
    )
    if request.args.get("export") == "csv":
        return _csv(rows, "fast_moving.csv")
    return jsonify(rows)


@bp.get("/api/reports/above-average-price")
def above_average_price():
    avg_row   = db.fetchone("SELECT COALESCE(AVG(unit_price),0) AS avg_price FROM product") or {}
    avg_price = float(avg_row.get("avg_price", 0))
    rows = db.fetchall(
        """SELECT p.product_id, p.product_name, c.category_name, b.brand_name, p.unit_price
           FROM product p
           JOIN category c ON c.category_id = p.category_id
           JOIN brand    b ON b.brand_id    = p.brand_id
           WHERE p.unit_price > (SELECT AVG(unit_price) FROM product)
           ORDER BY p.unit_price DESC"""
    )
    for r in rows:
        r["unit_price"] = float(r["unit_price"])
    if request.args.get("export") == "csv":
        return _csv(rows, "above_avg_price.csv")
    return jsonify({"avg_price": round(avg_price, 2), "items": rows})


@bp.get("/api/reports/product-catalog")
def product_catalog():
    rows = db.fetchall(
        """SELECT p.product_id, p.product_name, c.category_name, b.brand_name,
                  p.unit_price, p.stock_qty,
                  (p.stock_qty * p.unit_price) AS inventory_value
           FROM product p
           JOIN category c ON c.category_id = p.category_id
           JOIN brand    b ON b.brand_id    = p.brand_id
           ORDER BY c.category_name, p.product_name"""
    )
    for r in rows:
        r["unit_price"]      = float(r["unit_price"])
        r["inventory_value"] = float(r["inventory_value"])
    if request.args.get("export") == "csv":
        return _csv(rows, "product_catalog.csv")
    return jsonify(rows)


@bp.get("/api/reports/customer-history")
def customer_history():
    cid = request.args.get("customer_id")
    if cid:
        rows = db.fetchall(
            """SELECT s.sale_id, DATE(s.sale_date) AS sale_date, s.total_amount,
                      i.invoice_code,
                      COALESCE(SUM(pay.amount),0) AS paid_amount
               FROM sale s
               LEFT JOIN invoice i   ON i.sale_id      = s.sale_id
               LEFT JOIN payment pay ON pay.invoice_id  = i.invoice_id
               WHERE s.customer_id = %s
               GROUP BY s.sale_id, s.sale_date, s.total_amount, i.invoice_code
               ORDER BY s.sale_date DESC""",
            (int(cid),)
        )
    else:
        rows = db.fetchall(
            """SELECT COALESCE(c.customer_name,'Walk-in') AS customer_name,
                      COUNT(DISTINCT s.sale_id)            AS sale_count,
                      COALESCE(SUM(s.total_amount), 0)     AS total_revenue
               FROM sale s
               LEFT JOIN customer c ON c.customer_id = s.customer_id
               GROUP BY s.customer_id, c.customer_name
               ORDER BY total_revenue DESC"""
        )
    for r in rows:
        for k in ("total_amount", "paid_amount", "total_revenue"):
            if k in r:
                r[k] = float(r[k])
        if "sale_date" in r and r["sale_date"]:
            r["sale_date"] = str(r["sale_date"])
    if request.args.get("export") == "csv":
        return _csv(rows, "customer_history.csv")
    return jsonify(rows)


@bp.get("/api/reports/invoice-payment-summary")
def invoice_payment_summary():
    rows = db.fetchall(
        """SELECT i.invoice_id, i.invoice_code, i.invoice_date,
                  s.total_amount                        AS invoice_total,
                  COALESCE(SUM(pay.amount), 0)           AS paid_amount,
                  (s.total_amount - COALESCE(SUM(pay.amount),0)) AS balance,
                  COALESCE(c.customer_name,'Walk-in')   AS customer_name
           FROM invoice i
           JOIN  sale     s   ON s.sale_id      = i.sale_id
           LEFT JOIN customer c  ON c.customer_id  = s.customer_id
           LEFT JOIN payment  pay ON pay.invoice_id = i.invoice_id
           GROUP BY i.invoice_id, i.invoice_code, i.invoice_date,
                    s.total_amount, c.customer_name
           ORDER BY i.invoice_date DESC"""
    )
    for r in rows:
        r["invoice_total"] = float(r["invoice_total"])
        r["paid_amount"]   = float(r["paid_amount"])
        r["balance"]       = float(r["balance"])
        r["invoice_date"]  = str(r["invoice_date"])
        r["status"] = "Paid" if r["balance"] <= 0.005 else ("Partial" if r["paid_amount"] > 0 else "Unpaid")
    if request.args.get("export") == "csv":
        return _csv(rows, "invoice_payment_summary.csv")
    return jsonify(rows)


@bp.get("/api/reports/stock-movement-history")
def stock_movement_history():
    date_from = request.args.get("date_from") or "2000-01-01"
    date_to   = request.args.get("date_to")   or date.today().isoformat()
    rows = db.fetchall(
        """SELECT sm.movement_id, sm.movement_date,
                  p.product_name, sm.movement_type, sm.quantity
           FROM stock_movement sm
           JOIN product p ON p.product_id = sm.product_id
           WHERE sm.movement_date BETWEEN %s AND %s
           ORDER BY sm.movement_date DESC, sm.movement_id DESC""",
        (date_from, date_to)
    )
    for r in rows:
        r["movement_date"] = str(r["movement_date"])
    if request.args.get("export") == "csv":
        return _csv(rows, "stock_movement_history.csv")
    return jsonify(rows)
