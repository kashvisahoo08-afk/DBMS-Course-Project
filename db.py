"""
db.py
MySQL connection pool and helper utilities.
All database access passes through this module.
No credentials are exposed to frontend code.
"""
from __future__ import annotations
import logging
import mysql.connector
from mysql.connector import pooling, Error as MySQLError
from config import Config

logger = logging.getLogger(__name__)

_pool = None  # type: pooling.MySQLConnectionPool | None


def init_pool() -> None:
    """Initialise the connection pool once at application startup."""
    global _pool
    try:
        _pool = pooling.MySQLConnectionPool(
            pool_name="retail_pool",
            pool_size=5,
            pool_reset_session=True,
            host=Config.MYSQL_HOST,
            port=Config.MYSQL_PORT,
            user=Config.MYSQL_USER,
            password=Config.MYSQL_PASSWORD,
            database=Config.MYSQL_DB,
            autocommit=False,
            charset="utf8mb4",
            collation="utf8mb4_unicode_ci",
        )
        logger.info("MySQL connection pool initialised (host=%s db=%s)", Config.MYSQL_HOST, Config.MYSQL_DB)
    except MySQLError as exc:
        logger.error("Failed to create MySQL pool: %s", exc)
        raise


def get_connection():
    """Return a pooled connection.  Caller is responsible for closing it."""
    if _pool is None:
        init_pool()
    return _pool.get_connection()


# ---------------------------------------------------------------------------
# Low-level helpers
# ---------------------------------------------------------------------------

def fetchall(sql: str, params: tuple = ()) -> list:
    """Execute *sql* and return all rows as a list of dicts."""
    conn = get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(sql, params)
        return cur.fetchall()
    except MySQLError as exc:
        logger.error("fetchall error: %s | SQL: %s", exc, sql)
        raise
    finally:
        conn.close()


def fetchone(sql: str, params: tuple = ()):
    """Execute *sql* and return the first row as a dict, or None."""
    conn = get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(sql, params)
        return cur.fetchone()
    except MySQLError as exc:
        logger.error("fetchone error: %s | SQL: %s", exc, sql)
        raise
    finally:
        conn.close()


def execute(sql: str, params: tuple = ()) -> int:
    """Execute a single DML statement outside a transaction.
    Returns lastrowid."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        conn.commit()
        return cur.lastrowid
    except MySQLError as exc:
        conn.rollback()
        logger.error("execute error: %s | SQL: %s", exc, sql)
        raise
    finally:
        conn.close()


def test_connection() -> dict:
    """Return a status dict for the /settings health check."""
    try:
        row = fetchone("SELECT VERSION() AS version, NOW() AS server_time, DATABASE() AS db_name")
        return {"status": "ok", "version": row["version"],
                "server_time": str(row["server_time"]), "db": row["db_name"]}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}
