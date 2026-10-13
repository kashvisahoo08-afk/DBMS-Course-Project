"""
services/inventory_service.py
Stock adjustment helper used by purchases, sales, and returns.
All functions expect an open cursor from an active transaction.
"""
import logging

logger = logging.getLogger(__name__)

# Movement type constants — match what already exists in the DB
MOVEMENT_IN     = "PURCHASE"   # stock received via purchase
MOVEMENT_OUT    = "SALE"       # stock deducted via sale
MOVEMENT_RETURN = "RETURN"     # stock restored via return


def adjust_stock(cur, product_id: int, delta: int, movement_type: str) -> None:
    """
    Adjust stock_qty by *delta* and insert a stock_movement record.
    Positive delta = stock added (purchase / return).
    Negative delta = stock removed (sale).
    Raises ValueError if the resulting qty would be negative.
    """
    cur.execute(
        "SELECT stock_qty FROM product WHERE product_id = %s FOR UPDATE",
        (product_id,)
    )
    row = cur.fetchone()
    if row is None:
        raise ValueError(f"Product {product_id} not found.")

    current_qty = row["stock_qty"] if isinstance(row, dict) else row[0]
    new_qty     = current_qty + delta

    if new_qty < 0:
        raise ValueError(
            f"Insufficient stock for product {product_id}. "
            f"Available: {current_qty}, requested: {abs(delta)}."
        )

    cur.execute(
        "UPDATE product SET stock_qty = %s WHERE product_id = %s",
        (new_qty, product_id)
    )
    cur.execute(
        "INSERT INTO stock_movement (product_id, movement_type, quantity, movement_date) "
        "VALUES (%s, %s, %s, CURDATE())",
        (product_id, movement_type, abs(delta))
    )
