"""routes/dashboard.py — Dashboard metrics and chart data"""
from flask import Blueprint, jsonify
from datetime import date
import db
from config import Config

bp = Blueprint("dashboard", __name__)


@bp.get("/api/dashboard/metrics")
def metrics():
    threshold = Config.LOW_STOCK_THRESHOLD
    today     = date.today().isoformat()
    try:
        r = {}
        r["total_products"]   = (db.fetchone("SELECT COUNT(*) AS n FROM product")  or {}).get("n", 0)
        r["total_categories"] = (db.fetchone("SELECT COUNT(*) AS n FROM category") or {}).get("n", 0)
        r["total_brands"]     = (db.fetchone("SELECT COUNT(*) AS n FROM brand")    or {}).get("n", 0)
        r["total_suppliers"]  = (db.fetchone("SELECT COUNT(*) AS n FROM supplier") or {}).get("n", 0)
        r["total_customers"]  = (db.fetchone("SELECT COUNT(*) AS n FROM customer") or {}).get("n", 0)

        todays = db.fetchone(
            "SELECT COALESCE(SUM(total_amount),0) AS rev, COUNT(*) AS cnt "
            "FROM sale WHERE sale_date = %s", (today,)
        ) or {}
        r["today_sales_amount"] = float(todays.get("rev", 0))
        r["today_sales_count"]  = int(todays.get("cnt", 0))

        total_rev = db.fetchone("SELECT COALESCE(SUM(total_amount),0) AS rev FROM sale") or {}
        r["total_sales_revenue"] = float(total_rev.get("rev", 0))

        low = db.fetchone(
            "SELECT COUNT(*) AS n FROM product WHERE stock_qty < %s", (threshold,)
        ) or {}
        r["low_stock_count"] = int(low.get("n", 0))

        total_purch = db.fetchone("SELECT COALESCE(SUM(total_amount),0) AS amt FROM purchase") or {}
        r["total_purchase_expenditure"] = float(total_purch.get("amt", 0))

        inv_val = db.fetchone(
            "SELECT COALESCE(SUM(stock_qty * unit_price),0) AS val FROM product"
        ) or {}
        r["inventory_value"] = float(inv_val.get("val", 0))

        return jsonify(r)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.get("/api/dashboard/sales-trend")
def sales_trend():
    rows = db.fetchall(
        """SELECT DATE(sale_date) AS day,
                  COALESCE(SUM(total_amount),0) AS revenue
           FROM sale
           WHERE sale_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
           GROUP BY DATE(sale_date)
           ORDER BY day"""
    )
    return jsonify([{"day": str(r["day"]), "revenue": float(r["revenue"])} for r in rows])


@bp.get("/api/dashboard/monthly-sales")
def monthly_sales():
    rows = db.fetchall(
        """SELECT YEAR(sale_date) AS yr, MONTH(sale_date) AS mo,
                  COALESCE(SUM(total_amount),0) AS revenue
           FROM sale
           GROUP BY yr, mo
           ORDER BY yr, mo
           LIMIT 12"""
    )
    import calendar
    result = []
    for r in rows:
        label = f"{calendar.month_abbr[r['mo']]} {r['yr']}"
        result.append({"label": label, "revenue": float(r["revenue"])})
    return jsonify(result)


@bp.get("/api/dashboard/top-products")
def top_products():
    rows = db.fetchall(
        """SELECT p.product_name,
                  COALESCE(SUM(si.quantity),0) AS total_sold
           FROM sale_item si
           JOIN product p ON p.product_id = si.product_id
           GROUP BY si.product_id, p.product_name
           ORDER BY total_sold DESC
           LIMIT 8"""
    )
    return jsonify([{"name": r["product_name"], "sold": int(r["total_sold"])} for r in rows])


@bp.get("/api/dashboard/inventory-by-category")
def inventory_by_category():
    rows = db.fetchall(
        """SELECT c.category_name,
                  COALESCE(SUM(p.stock_qty * p.unit_price),0) AS value
           FROM product p
           JOIN category c ON c.category_id = p.category_id
           GROUP BY c.category_id, c.category_name
           ORDER BY value DESC"""
    )
    return jsonify([{"category": r["category_name"], "value": float(r["value"])} for r in rows])


@bp.get("/api/dashboard/low-stock")
def low_stock():
    threshold = Config.LOW_STOCK_THRESHOLD
    rows = db.fetchall(
        """SELECT p.product_id, p.product_name, p.stock_qty,
                  c.category_name, b.brand_name
           FROM product p
           JOIN category c ON c.category_id = p.category_id
           JOIN brand    b ON b.brand_id    = p.brand_id
           WHERE p.stock_qty < %s
           ORDER BY p.stock_qty ASC
           LIMIT 20""",
        (threshold,)
    )
    return jsonify(rows)


@bp.get("/api/dashboard/recent-sales")
def recent_sales():
    rows = db.fetchall(
        """SELECT s.sale_id,
                  DATE(s.sale_date) AS sale_date,
                  COALESCE(c.customer_name,'Walk-in') AS customer_name,
                  s.total_amount
           FROM sale s
           LEFT JOIN customer c ON c.customer_id = s.customer_id
           ORDER BY s.sale_date DESC, s.sale_id DESC
           LIMIT 10"""
    )
    return jsonify([
        {**r, "sale_date": str(r["sale_date"]), "total_amount": float(r["total_amount"])}
        for r in rows
    ])
