"""
config.py
Application configuration loaded from environment variables via .env
"""
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # Flask
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")
    FLASK_ENV = os.environ.get("FLASK_ENV", "development")

    # MySQL connection
    MYSQL_HOST = os.environ.get("MYSQL_HOST", "localhost")
    MYSQL_PORT = int(os.environ.get("MYSQL_PORT", 3306))
    MYSQL_USER = os.environ.get("MYSQL_USER", "root")
    MYSQL_PASSWORD = os.environ.get("MYSQL_PASSWORD", "")
    MYSQL_DB = os.environ.get("MYSQL_DB", "retail_db")

    # Application-level low-stock threshold (not a DB column)
    LOW_STOCK_THRESHOLD = int(os.environ.get("LOW_STOCK_THRESHOLD", 10))

    # WTF CSRF (not used in this API-only app; remove if not needed)
    # WTF_CSRF_ENABLED = True
