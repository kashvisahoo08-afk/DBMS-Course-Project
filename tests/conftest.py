"""
conftest.py — Shared pytest fixtures.
All DB calls are mocked so tests NEVER touch retail_db.
"""
import sys, os
import pytest

# Ensure project root is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Set dummy env vars before any import tries to read them
os.environ.setdefault("MYSQL_HOST",     "localhost")
os.environ.setdefault("MYSQL_PORT",     "3306")
os.environ.setdefault("MYSQL_USER",     "root")
os.environ.setdefault("MYSQL_PASSWORD", "test")
os.environ.setdefault("MYSQL_DB",       "retail_db")
os.environ.setdefault("SECRET_KEY",     "test-secret-key")
os.environ.setdefault("LOW_STOCK_THRESHOLD", "10")


@pytest.fixture(scope="session")
def app():
    from unittest.mock import patch, MagicMock
    with patch("db.init_pool"), patch("db.get_connection"):
        from app import create_app
        application = create_app()
        application.config["TESTING"]        = True
        application.config["WTF_CSRF_ENABLED"] = False
        yield application


@pytest.fixture
def client(app):
    with app.test_client() as c:
        yield c
