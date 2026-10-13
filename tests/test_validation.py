"""
tests/test_validation.py
Validation and route behaviour tests.
All DB calls are intercepted — retail_db is NEVER modified.
"""
import pytest
from unittest.mock import patch, MagicMock


# ─────────────────────────────────────────────────────────────────
# Category
# ─────────────────────────────────────────────────────────────────

def test_create_category_missing_name(client):
    r = client.post("/api/categories", json={})
    assert r.status_code == 400
    assert b"required" in r.data.lower()


def test_create_category_blank_name(client):
    r = client.post("/api/categories", json={"category_name": "   "})
    assert r.status_code == 400


def test_create_category_ok(client):
    with patch("db.execute", return_value=5):
        r = client.post("/api/categories", json={"category_name": "Electronics"})
    assert r.status_code == 201
    data = r.get_json()
    assert data["category_id"] == 5


def test_create_category_duplicate(client):
    from mysql.connector import IntegrityError
    with patch("db.execute", side_effect=IntegrityError("Duplicate entry")):
        r = client.post("/api/categories", json={"category_name": "Electronics"})
    assert r.status_code == 409
    assert b"already" in r.data.lower()


# ─────────────────────────────────────────────────────────────────
# Brand
# ─────────────────────────────────────────────────────────────────

def test_create_brand_missing_name(client):
    r = client.post("/api/brands", json={})
    assert r.status_code == 400


def test_create_brand_ok(client):
    with patch("db.execute", return_value=3):
        r = client.post("/api/brands", json={"brand_name": "Samsung"})
    assert r.status_code == 201


def test_create_brand_duplicate(client):
    from mysql.connector import IntegrityError
    with patch("db.execute", side_effect=IntegrityError("Duplicate")):
        r = client.post("/api/brands", json={"brand_name": "Samsung"})
    assert r.status_code == 409


# ─────────────────────────────────────────────────────────────────
# Product validation
# ─────────────────────────────────────────────────────────────────

def test_create_product_empty_body(client):
    r = client.post("/api/products", json={})
    assert r.status_code == 400
    data = r.get_json()
    assert "error" in data


def test_create_product_negative_price(client):
    r = client.post("/api/products", json={
        "product_name": "TV", "unit_price": -100, "stock_qty": 5,
        "category_id": 1, "brand_id": 1
    })
    assert r.status_code == 400
    assert b"price" in r.data.lower()


def test_create_product_zero_price(client):
    r = client.post("/api/products", json={
        "product_name": "TV", "unit_price": 0, "stock_qty": 5,
        "category_id": 1, "brand_id": 1
    })
    assert r.status_code == 400


def test_create_product_negative_stock(client):
    r = client.post("/api/products", json={
        "product_name": "TV", "unit_price": 1000, "stock_qty": -1,
        "category_id": 1, "brand_id": 1
    })
    assert r.status_code == 400
    assert b"negative" in r.data.lower()


def test_create_product_missing_category(client):
    r = client.post("/api/products", json={
        "product_name": "TV", "unit_price": 1000, "stock_qty": 5,
        "brand_id": 1
    })
    assert r.status_code == 400
    assert b"category" in r.data.lower()


def test_create_product_ok(client):
    with patch("db.execute", return_value=10):
        r = client.post("/api/products", json={
            "product_name": "Smart TV", "unit_price": 45000, "stock_qty": 10,
            "category_id": 1, "brand_id": 1
        })
    assert r.status_code == 201


# ─────────────────────────────────────────────────────────────────
# Customer validation
# ─────────────────────────────────────────────────────────────────

def test_create_customer_missing_name(client):
    r = client.post("/api/customers", json={})
    assert r.status_code == 400


def test_create_customer_bad_email(client):
    r = client.post("/api/customers", json={"customer_name": "Ravi", "email": "not-an-email"})
    assert r.status_code == 400
    assert b"email" in r.data.lower()


def test_create_customer_no_email_ok(client):
    """Email is optional — omitting it should succeed."""
    with patch("db.execute", return_value=7):
        r = client.post("/api/customers", json={"customer_name": "Priya"})
    assert r.status_code == 201


def test_create_customer_valid_email_ok(client):
    with patch("db.execute", return_value=8):
        r = client.post("/api/customers", json={
            "customer_name": "Arjun", "email": "arjun@example.com"
        })
    assert r.status_code == 201


# ─────────────────────────────────────────────────────────────────
# Supplier validation
# ─────────────────────────────────────────────────────────────────

def test_create_supplier_missing_name(client):
    r = client.post("/api/suppliers", json={})
    assert r.status_code == 400


def test_create_supplier_bad_email(client):
    r = client.post("/api/suppliers", json={"supplier_name": "ACME", "email": "bad@"})
    assert r.status_code == 400


def test_create_supplier_ok(client):
    with patch("db.execute", return_value=2):
        r = client.post("/api/suppliers", json={"supplier_name": "TechMart"})
    assert r.status_code == 201


# ─────────────────────────────────────────────────────────────────
# Purchase validation
# ─────────────────────────────────────────────────────────────────

def test_purchase_no_supplier(client):
    r = client.post("/api/purchases", json={
        "items": [{"product_id": 1, "quantity": 5, "unit_cost": 100}]
    })
    assert r.status_code == 400
    assert b"supplier" in r.data.lower()


def test_purchase_no_items(client):
    r = client.post("/api/purchases", json={"supplier_id": 1})
    assert r.status_code == 400
    assert b"item" in r.data.lower()


def test_purchase_negative_qty(client):
    r = client.post("/api/purchases", json={
        "supplier_id": 1,
        "items": [{"product_id": 1, "quantity": -1, "unit_cost": 50}]
    })
    assert r.status_code == 400


def test_purchase_zero_cost(client):
    r = client.post("/api/purchases", json={
        "supplier_id": 1,
        "items": [{"product_id": 1, "quantity": 5, "unit_cost": 0}]
    })
    assert r.status_code == 400


# ─────────────────────────────────────────────────────────────────
# Sale validation
# ─────────────────────────────────────────────────────────────────

def test_sale_no_items(client):
    r = client.post("/api/sales", json={"customer_id": 1})
    assert r.status_code == 400
    assert b"item" in r.data.lower()


def test_sale_negative_qty(client):
    r = client.post("/api/sales", json={
        "items": [{"product_id": 1, "quantity": -2}]
    })
    assert r.status_code == 400


def test_sale_zero_qty(client):
    r = client.post("/api/sales", json={
        "items": [{"product_id": 1, "quantity": 0}]
    })
    assert r.status_code == 400


# ─────────────────────────────────────────────────────────────────
# Payment validation
# ─────────────────────────────────────────────────────────────────

def test_payment_missing_invoice(client):
    r = client.post("/api/payments", json={"amount": 500, "payment_method": "Cash"})
    assert r.status_code == 400
    assert b"invoice" in r.data.lower()


def test_payment_zero_amount(client):
    r = client.post("/api/payments", json={"invoice_id": 1, "amount": 0, "payment_method": "Cash"})
    assert r.status_code == 400


def test_payment_negative_amount(client):
    r = client.post("/api/payments", json={"invoice_id": 1, "amount": -100, "payment_method": "UPI"})
    assert r.status_code == 400


def test_payment_missing_method(client):
    r = client.post("/api/payments", json={"invoice_id": 1, "amount": 500})
    assert r.status_code == 400
    assert b"method" in r.data.lower()


# ─────────────────────────────────────────────────────────────────
# Return validation
# ─────────────────────────────────────────────────────────────────

def test_return_missing_sale(client):
    r = client.post("/api/returns", json={"product_id": 1, "quantity": 1})
    assert r.status_code == 400
    assert b"sale" in r.data.lower()


def test_return_zero_qty(client):
    r = client.post("/api/returns", json={"sale_id": 1, "product_id": 1, "quantity": 0})
    assert r.status_code == 400


def test_return_negative_qty(client):
    r = client.post("/api/returns", json={"sale_id": 1, "product_id": 1, "quantity": -5})
    assert r.status_code == 400


# ─────────────────────────────────────────────────────────────────
# Inventory service unit tests (no Flask, no DB)
# ─────────────────────────────────────────────────────────────────

def test_adjust_stock_negative_raises():
    from services.inventory_service import adjust_stock
    cur = MagicMock()
    cur.fetchone.return_value = {"stock_qty": 3}
    with pytest.raises(ValueError, match="Insufficient stock"):
        adjust_stock(cur, 1, -10, "OUT")


def test_adjust_stock_to_zero_ok():
    """Reducing stock exactly to zero is allowed."""
    from services.inventory_service import adjust_stock
    cur = MagicMock()
    cur.fetchone.return_value = {"stock_qty": 5}
    adjust_stock(cur, 1, -5, "OUT")           # Should not raise
    assert cur.execute.call_count == 3         # SELECT, UPDATE, INSERT


def test_adjust_stock_add_ok():
    from services.inventory_service import adjust_stock
    cur = MagicMock()
    cur.fetchone.return_value = {"stock_qty": 10}
    adjust_stock(cur, 1, 20, "IN")
    # UPDATE called with 30
    update_call = cur.execute.call_args_list[1]
    assert 30 in update_call[0][1]


def test_adjust_stock_product_not_found():
    from services.inventory_service import adjust_stock
    cur = MagicMock()
    cur.fetchone.return_value = None
    with pytest.raises(ValueError, match="not found"):
        adjust_stock(cur, 99, 5, "IN")


# ─────────────────────────────────────────────────────────────────
# Settings / DB status endpoint
# ─────────────────────────────────────────────────────────────────

def test_db_status_ok(client):
    with patch("db.fetchone", return_value={
        "version": "8.0.36", "server_time": "2026-10-12 10:00:00", "db_name": "retail_db"
    }):
        r = client.get("/api/settings/db-status")
    assert r.status_code == 200
    data = r.get_json()
    assert data["status"] == "ok"
    assert data["db"] == "retail_db"


def test_db_status_error(client):
    with patch("db.fetchone", side_effect=Exception("connection refused")):
        r = client.get("/api/settings/db-status")
    assert r.status_code == 200
    data = r.get_json()
    assert data["status"] == "error"
    assert "connection" in data["message"].lower()


# ─────────────────────────────────────────────────────────────────
# SPA shell route
# ─────────────────────────────────────────────────────────────────

def test_index_returns_html(client):
    r = client.get("/")
    assert r.status_code == 200
    assert b"Retail Inventory" in r.data


def test_api_404_returns_json(client):
    r = client.get("/api/nonexistent-endpoint-xyz")
    assert r.status_code == 404
    data = r.get_json()
    assert "error" in data
