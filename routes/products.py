"""routes/products.py — Product CRUD API"""
from flask import Blueprint, jsonify, request
import db
from mysql.connector import IntegrityError
from config import Config

bp = Blueprint("products", __name__)

_SELECT = """
    SELECT p.product_id, p.product_name, p.unit_price, p.stock_qty,
           p.category_id, c.category_name,
           p.brand_id, b.brand_name,
           (p.stock_qty * p.unit_price) AS inventory_value
    FROM product p
    JOIN category c ON c.category_id = p.category_id
    JOIN brand    b ON b.brand_id    = p.brand_id
"""
_ALLOWED_SORTS = {"product_name", "unit_price", "stock_qty", "inventory_value"}


@bp.get("/api/products")
def list_products():
    q         = request.args.get("q",           "").strip()
    cat       = request.args.get("category_id", "").strip()
    brand     = request.args.get("brand_id",    "").strip()
    low       = request.args.get("low_stock",   "").strip()
    sort      = request.args.get("sort", "product_name")
    order     = "DESC" if request.args.get("order", "asc").lower() == "desc" else "ASC"
    raw_pp    = request.args.get("per_page", "")
    flat_mode = (raw_pp.lower() == "all") if raw_pp else False
    page      = max(1, int(request.args.get("page", 1)))
    per_page  = 500 if flat_mode else 20

    if sort not in _ALLOWED_SORTS:
        sort = "product_name"

    conditions, params = [], []
    if q:
        conditions.append("(p.product_name LIKE %s OR CAST(p.product_id AS CHAR) LIKE %s)")
        params += [f"%{q}%", f"%{q}%"]
    if cat:
        conditions.append("p.category_id = %s"); params.append(int(cat))
    if brand:
        conditions.append("p.brand_id = %s");    params.append(int(brand))
    if low == "1":
        conditions.append("p.stock_qty < %s");   params.append(Config.LOW_STOCK_THRESHOLD)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    total = (db.fetchone(
        f"SELECT COUNT(*) AS n FROM product p {where}", tuple(params)
    ) or {}).get("n", 0)

    offset = (page - 1) * per_page
    rows   = db.fetchall(
        f"{_SELECT} {where} ORDER BY {sort} {order} LIMIT %s OFFSET %s",
        tuple(params) + (per_page, offset)
    )

    threshold = Config.LOW_STOCK_THRESHOLD
    result = []
    for r in rows:
        row = dict(r)
        row["unit_price"]      = float(row["unit_price"])
        row["inventory_value"] = float(row["inventory_value"])
        row["stock_status"] = (
            "Out of Stock" if row["stock_qty"] == 0
            else "Low Stock"  if row["stock_qty"] < threshold
            else "In Stock"
        )
        result.append(row)

    if flat_mode:
        return jsonify(result)
    return jsonify({"items": result, "total": total, "page": page, "per_page": per_page})


@bp.get("/api/products/<int:pid>")
def get_product(pid):
    row = db.fetchone(f"{_SELECT} WHERE p.product_id = %s", (pid,))
    if not row:
        return jsonify({"error": "Product not found."}), 404
    row["unit_price"]      = float(row["unit_price"])
    row["inventory_value"] = float(row["inventory_value"])
    return jsonify(row)


@bp.post("/api/products")
def create_product():
    data   = request.get_json(force=True) or {}
    errors = _validate(data)
    if errors:
        return jsonify({"error": "; ".join(errors)}), 400
    try:
        new_id = db.execute(
            "INSERT INTO product (product_name, unit_price, stock_qty, category_id, brand_id) "
            "VALUES (%s, %s, %s, %s, %s)",
            (data["product_name"].strip(), float(data["unit_price"]),
             int(data["stock_qty"]), int(data["category_id"]), int(data["brand_id"]))
        )
        return jsonify({"product_id": new_id}), 201
    except IntegrityError:
        return jsonify({"error": "Foreign-key error — ensure category and brand exist."}), 409
    except Exception:
        return jsonify({"error": "Database error. Please try again."}), 500


@bp.put("/api/products/<int:pid>")
def update_product(pid):
    existing = db.fetchone("SELECT * FROM product WHERE product_id = %s", (pid,))
    if not existing:
        return jsonify({"error": "Product not found."}), 404
    data   = request.get_json(force=True) or {}
    errors = _validate(data)
    if errors:
        return jsonify({"error": "; ".join(errors)}), 400
    try:
        db.execute(
            "UPDATE product SET product_name=%s, unit_price=%s, stock_qty=%s, "
            "category_id=%s, brand_id=%s WHERE product_id=%s",
            (data["product_name"].strip(), float(data["unit_price"]),
             int(data["stock_qty"]), int(data["category_id"]),
             int(data["brand_id"]), pid)
        )
        return jsonify({"product_id": pid})
    except IntegrityError:
        return jsonify({"error": "Foreign-key error — ensure category and brand exist."}), 409
    except Exception:
        return jsonify({"error": "Database error. Please try again."}), 500


@bp.delete("/api/products/<int:pid>")
def delete_product(pid):
    existing = db.fetchone("SELECT * FROM product WHERE product_id = %s", (pid,))
    if not existing:
        return jsonify({"error": "Product not found."}), 404
    for tbl, col in [
        ("sale_item",      "product_id"),
        ("purchase_item",  "product_id"),
        ("stock_movement", "product_id"),
        ("return_item",    "product_id"),
    ]:
        used = db.fetchone(f"SELECT COUNT(*) AS n FROM {tbl} WHERE {col} = %s", (pid,))
        if used and used["n"] > 0:
            return jsonify({
                "error": f"Cannot delete — this product is referenced by {used['n']} record(s) in {tbl}."
            }), 409
    try:
        db.execute("DELETE FROM product WHERE product_id = %s", (pid,))
        return jsonify({"message": "Product deleted."})
    except Exception:
        return jsonify({"error": "Database error. Please try again."}), 500


def _validate(data):
    errors = []
    if not (data.get("product_name") or "").strip():
        errors.append("Product name is required.")
    try:
        price = float(data.get("unit_price", 0))
        if price <= 0:
            errors.append("Unit price must be greater than zero.")
    except (TypeError, ValueError):
        errors.append("Unit price must be a valid number.")
    try:
        qty = int(data.get("stock_qty", -1))
        if qty < 0:
            errors.append("Stock quantity cannot be negative.")
    except (TypeError, ValueError):
        errors.append("Stock quantity must be a valid integer.")
    if not data.get("category_id"):
        errors.append("Category is required.")
    if not data.get("brand_id"):
        errors.append("Brand is required.")
    return errors
