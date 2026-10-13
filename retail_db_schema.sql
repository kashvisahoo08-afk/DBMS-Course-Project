-- =============================================================
-- retail_db_schema.sql
-- Complete schema for the Retail Inventory & Sales Management System
-- Run this ONLY when setting up a fresh database.
-- WARNING: This drops and recreates retail_db.
-- Do NOT run against a database that already has your data.
-- =============================================================

DROP DATABASE IF EXISTS retail_db;
CREATE DATABASE retail_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE retail_db;

-- 1. Category
CREATE TABLE Category (
    category_id   INT AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE
);

-- 2. Brand
CREATE TABLE Brand (
    brand_id   INT AUTO_INCREMENT PRIMARY KEY,
    brand_name VARCHAR(100) NOT NULL UNIQUE
);

-- 3. Product
CREATE TABLE Product (
    product_id   INT AUTO_INCREMENT PRIMARY KEY,
    product_name VARCHAR(200) NOT NULL,
    unit_price   DECIMAL(12,2) NOT NULL CHECK (unit_price > 0),
    stock_qty    INT NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
    category_id  INT NOT NULL,
    brand_id     INT NOT NULL,
    FOREIGN KEY (category_id) REFERENCES Category(category_id),
    FOREIGN KEY (brand_id)    REFERENCES Brand(brand_id)
);

-- 4. Supplier
CREATE TABLE Supplier (
    supplier_id   INT AUTO_INCREMENT PRIMARY KEY,
    supplier_name VARCHAR(200) NOT NULL,
    phone         VARCHAR(20),
    email         VARCHAR(150)
);

-- 5. Purchase
CREATE TABLE Purchase (
    purchase_id   INT AUTO_INCREMENT PRIMARY KEY,
    supplier_id   INT NOT NULL,
    purchase_date DATE NOT NULL,
    total_amount  DECIMAL(14,2) NOT NULL,
    FOREIGN KEY (supplier_id) REFERENCES Supplier(supplier_id)
);

-- 6. Purchase_Item
CREATE TABLE Purchase_Item (
    purchase_item_id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_id      INT NOT NULL,
    product_id       INT NOT NULL,
    quantity         INT NOT NULL CHECK (quantity > 0),
    unit_cost        DECIMAL(12,2) NOT NULL CHECK (unit_cost > 0),
    FOREIGN KEY (purchase_id) REFERENCES Purchase(purchase_id),
    FOREIGN KEY (product_id)  REFERENCES Product(product_id)
);

-- 7. Customer
CREATE TABLE Customer (
    customer_id   INT AUTO_INCREMENT PRIMARY KEY,
    customer_name VARCHAR(200) NOT NULL,
    phone         VARCHAR(20),
    email         VARCHAR(150)
);

-- 8. Sale
CREATE TABLE Sale (
    sale_id      INT AUTO_INCREMENT PRIMARY KEY,
    customer_id  INT,
    sale_date    DATE NOT NULL,
    total_amount DECIMAL(14,2) NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES Customer(customer_id)
);

-- 9. Sale_Item
CREATE TABLE Sale_Item (
    sale_item_id INT AUTO_INCREMENT PRIMARY KEY,
    sale_id      INT NOT NULL,
    product_id   INT NOT NULL,
    quantity     INT NOT NULL CHECK (quantity > 0),
    unit_price   DECIMAL(12,2) NOT NULL CHECK (unit_price > 0),
    FOREIGN KEY (sale_id)    REFERENCES Sale(sale_id),
    FOREIGN KEY (product_id) REFERENCES Product(product_id)
);

-- 10. Invoice
CREATE TABLE Invoice (
    invoice_id   INT AUTO_INCREMENT PRIMARY KEY,
    sale_id      INT NOT NULL UNIQUE,
    invoice_code VARCHAR(50) NOT NULL UNIQUE,
    invoice_date DATE NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES Sale(sale_id)
);

-- 11. Payment
CREATE TABLE Payment (
    payment_id     INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id     INT NOT NULL,
    payment_date   DATE NOT NULL,
    amount         DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) NOT NULL,
    FOREIGN KEY (invoice_id) REFERENCES Invoice(invoice_id)
);

-- 12. Stock_Movement
CREATE TABLE Stock_Movement (
    movement_id   INT AUTO_INCREMENT PRIMARY KEY,
    product_id    INT NOT NULL,
    movement_type VARCHAR(20) NOT NULL,
    quantity      INT NOT NULL,
    movement_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES Product(product_id)
);

-- 13. Return_Item
CREATE TABLE Return_Item (
    return_id   INT AUTO_INCREMENT PRIMARY KEY,
    sale_id     INT NOT NULL,
    product_id  INT NOT NULL,
    quantity    INT NOT NULL CHECK (quantity > 0),
    return_date DATE NOT NULL,
    FOREIGN KEY (sale_id)    REFERENCES Sale(sale_id),
    FOREIGN KEY (product_id) REFERENCES Product(product_id)
);

-- View: Product_Stock_Report
CREATE OR REPLACE VIEW Product_Stock_Report AS
SELECT
    p.product_id,
    p.product_name,
    c.category_name,
    b.brand_name,
    p.stock_qty,
    p.unit_price,
    (p.stock_qty * p.unit_price) AS inventory_value
FROM Product p
JOIN Category c ON c.category_id = p.category_id
JOIN Brand    b ON b.brand_id    = p.brand_id;

-- =============================================================
-- Sample seed data (optional — remove if you have your own data)
-- =============================================================

INSERT INTO Category (category_name) VALUES
('Electronics'), ('Clothing'), ('Groceries'), ('Stationery'), ('Furniture');

INSERT INTO Brand (brand_name) VALUES
('Samsung'), ('Apple'), ('Nike'), ('Amul'), ('Camlin');

INSERT INTO Supplier (supplier_name, phone, email) VALUES
('TechMart Distributors', '9876543210', 'techmart@example.com'),
('Fashion Hub',           '9123456780', 'fashionhub@example.com'),
('FoodSupply Co.',        '9988776655', 'foodsupply@example.com');

INSERT INTO Customer (customer_name, phone, email) VALUES
('Ravi Kumar',   '9000111222', 'ravi@example.com'),
('Priya Sharma', '9000333444', 'priya@example.com'),
('Arjun Patel',  '9000555666', NULL);

INSERT INTO Product (product_name, unit_price, stock_qty, category_id, brand_id) VALUES
('Samsung 55" Smart TV',    55000.00, 15, 1, 1),
('Apple iPhone 15',        89999.00,  8, 1, 2),
('Nike Running Shoes',      4999.00, 30, 2, 3),
('Amul Butter 500g',          55.00, 200, 3, 4),
('Camlin Geometry Box',       120.00,  50, 4, 5),
('Samsung Galaxy S24',     79999.00,  5, 1, 1),
('Nike T-Shirt',             999.00, 40, 2, 3),
('Amul Full Cream Milk 1L',   28.00, 300, 3, 4);
