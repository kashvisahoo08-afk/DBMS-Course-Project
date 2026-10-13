"""routes/brands.py — Brand CRUD API"""
from flask import Blueprint, jsonify, request
import db
from mysql.connector import IntegrityError

bp = Blueprint("brands", __name__)


@bp.get("/api/brands")
def list_brands():
    search = request.args.get("q", "").strip()
    if search:
        rows = db.fetchall(
            "SELECT * FROM brand WHERE brand_name LIKE %s ORDER BY brand_name",
            (f"%{search}%",)
        )
    else:
        rows = db.fetchall("SELECT * FROM brand ORDER BY brand_name")
    return jsonify(rows)


@bp.get("/api/brands/<int:bid>")
def get_brand(bid):
    row = db.fetchone("SELECT * FROM brand WHERE brand_id = %s", (bid,))
    if not row:
        return jsonify({"error": "Brand not found."}), 404
    return jsonify(row)


@bp.post("/api/brands")
def create_brand():
    data = request.get_json(force=True) or {}
    name = (data.get("brand_name") or "").strip()
    if not name:
        return jsonify({"error": "Brand name is required."}), 400
    try:
        new_id = db.execute("INSERT INTO brand (brand_name) VALUES (%s)", (name,))
        return jsonify({"brand_id": new_id, "brand_name": name}), 201
    except IntegrityError:
        return jsonify({"error": "This brand is already registered."}), 409
    except Exception:
        return jsonify({"error": "Database error. Please try again."}), 500


@bp.put("/api/brands/<int:bid>")
def update_brand(bid):
    data = request.get_json(force=True) or {}
    name = (data.get("brand_name") or "").strip()
    if not name:
        return jsonify({"error": "Brand name is required."}), 400
    existing = db.fetchone("SELECT * FROM brand WHERE brand_id = %s", (bid,))
    if not existing:
        return jsonify({"error": "Brand not found."}), 404
    try:
        db.execute("UPDATE brand SET brand_name = %s WHERE brand_id = %s", (name, bid))
        return jsonify({"brand_id": bid, "brand_name": name})
    except IntegrityError:
        return jsonify({"error": "This brand name is already registered."}), 409
    except Exception:
        return jsonify({"error": "Database error. Please try again."}), 500


@bp.delete("/api/brands/<int:bid>")
def delete_brand(bid):
    existing = db.fetchone("SELECT * FROM brand WHERE brand_id = %s", (bid,))
    if not existing:
        return jsonify({"error": "Brand not found."}), 404
    used = db.fetchone("SELECT COUNT(*) AS n FROM product WHERE brand_id = %s", (bid,))
    if used and used["n"] > 0:
        return jsonify({
            "error": f"Cannot delete — {used['n']} product(s) use this brand. Reassign those products first."
        }), 409
    try:
        db.execute("DELETE FROM brand WHERE brand_id = %s", (bid,))
        return jsonify({"message": "Brand deleted."})
    except Exception:
        return jsonify({"error": "Database error. Please try again."}), 500
