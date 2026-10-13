"""routes/settings.py — Database status endpoint"""
from flask import Blueprint, jsonify
import db

bp = Blueprint("settings", __name__)


@bp.get("/api/settings/db-status")
def db_status():
    return jsonify(db.test_connection())
