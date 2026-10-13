"""routes/categories.py — Category CRUD API"""
from flask import Blueprint, jsonify, request
import db
from mysql.connector import IntegrityError

bp = Blueprint("categories", __name__)


@bp.get("/api/categories")
def list_categories():
    search = request.args.get("q", "").strip()
    if search:
        rows = db.fetchall(
            "SELECT * FROM category WHERE category_name LIKE %s ORDER BY category_name",
            (f"%{search}%",)
        )
    else:
        rows = db.fetchall("SELECT * FROM category ORDER BY category_name")
    return jsonify(rows)


@bp.get("/api/categories/<int:cid>")
def get_category(cid):
    row = db.fetchone("SELECT * FROM category WHERE category_id = %s", (cid,))
    if not row:
        return jsonify({"error": "Category not found."}), 404
    return jsonify(row)


@bp.post("/api/categories")
def create_category():
    data = request.get_json(force=True) or {}
    name = (data.get("category_name") or "").strip()
    if not name:
        return jsonify({"error": "Category name is required."}), 400
    try:
        new_id = db.execute("INSERT INTO category (category_name) VALUES (%s)", (name,))
        return jsonify({"category_id": new_id, "category_name": name}), 201
    except IntegrityError:
        return jsonify({"error": "This category is already registered."}), 409
    except Exception:
        return jsonify({"error": "Database error. Please try again."}), 500


@bp.put("/api/categories/<int:cid>")
def update_category(cid):
    data = request.get_json(force=True) or {}
    name = (data.get("category_name") or "").strip()
    if not name:
        return jsonify({"error": "Category name is required."}), 400
    existing = db.fetchone("SELECT * FROM category WHERE category_id = %s", (cid,))
    if not existing:
        return jsonify({"error": "Category not found."}), 404
    try:
        db.execute("UPDATE category SET category_name = %s WHERE category_id = %s", (name, cid))
        return jsonify({"category_id": cid, "category_name": name})
    except IntegrityError:
        return jsonify({"error": "This category name is already registered."}), 409
    except Exception:
        return jsonify({"error": "Database error. Please try again."}), 500


@bp.delete("/api/categories/<int:cid>")
def delete_category(cid):
    existing = db.fetchone("SELECT * FROM category WHERE category_id = %s", (cid,))
    if not existing:
        return jsonify({"error": "Category not found."}), 404
    used = db.fetchone("SELECT COUNT(*) AS n FROM product WHERE category_id = %s", (cid,))
    if used and used["n"] > 0:
        return jsonify({
            "error": f"Cannot delete — {used['n']} product(s) are assigned to this category. Reassign those products first."
        }), 409
    try:
        db.execute("DELETE FROM category WHERE category_id = %s", (cid,))
        return jsonify({"message": "Category deleted."})
    except Exception:
        return jsonify({"error": "Database error. Please try again."}), 500
