#!/usr/bin/env python3
"""Check DEXCOWIN MES inventory integrity without starting the server.

Usage:
    python scripts/ops/check_inventory_integrity.py
    python scripts/ops/check_inventory_integrity.py --db-url sqlite:///C:/ERP/backend/mes.db
    python scripts/ops/check_inventory_integrity.py --db-url postgresql://...

Exit codes:
    0 = PASS
    1 = integrity violation or DB/schema error
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

load_dotenv(BACKEND_DIR / ".env")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check DEXCOWIN MES inventory integrity")
    parser.add_argument("--db-url", default=None, help="SQLAlchemy database URL")
    return parser.parse_args()


def database_url(args: argparse.Namespace) -> str:
    return args.db_url or os.getenv("DATABASE_URL") or f"sqlite:///{(BACKEND_DIR / 'mes.db').as_posix()}"


def make_session(url: str):
    engine = create_engine(
        url,
        connect_args={"check_same_thread": False} if url.startswith("sqlite") else {},
    )
    return sessionmaker(bind=engine)


def _rows(db: Any, sql: str) -> list[Any]:
    return list(db.execute(text(sql)).fetchall())


def require_tables(db: Any) -> list[str]:
    existing = {row[0] for row in _rows(db, "SELECT name FROM sqlite_master WHERE type='table'")}
    required = {"items", "inventory", "inventory_locations", "stock_requests", "stock_request_lines"}
    return sorted(required - existing)


def check_negative_inventory(db: Any) -> list[dict[str, Any]]:
    rows = _rows(
        db,
        """
        SELECT i.item_id, it.mes_code, it.item_name, i.warehouse_qty, i.quantity, i.pending_quantity
        FROM inventory i
        LEFT JOIN items it ON it.item_id = i.item_id
        WHERE i.warehouse_qty < 0 OR i.quantity < 0 OR i.pending_quantity < 0
        """,
    )
    return [
        {
            "item_id": str(row[0]),
            "mes_code": row[1],
            "item_name": row[2],
            "warehouse_qty": row[3],
            "quantity": row[4],
            "pending_quantity": row[5],
        }
        for row in rows
    ]


def check_negative_locations(db: Any) -> list[dict[str, Any]]:
    rows = _rows(
        db,
        """
        SELECT il.item_id, it.mes_code, il.department, il.status, il.quantity
        FROM inventory_locations il
        LEFT JOIN items it ON it.item_id = il.item_id
        WHERE il.quantity < 0
        """,
    )
    return [
        {
            "item_id": str(row[0]),
            "mes_code": row[1],
            "department": row[2],
            "status": row[3],
            "quantity": row[4],
        }
        for row in rows
    ]


def check_pending_exceeds_warehouse(db: Any) -> list[dict[str, Any]]:
    rows = _rows(
        db,
        """
        SELECT i.item_id, it.mes_code, i.pending_quantity, i.warehouse_qty
        FROM inventory i
        LEFT JOIN items it ON it.item_id = i.item_id
        WHERE i.pending_quantity > i.warehouse_qty AND i.pending_quantity > 0
        """,
    )
    return [
        {
            "item_id": str(row[0]),
            "mes_code": row[1],
            "pending_quantity": row[2],
            "warehouse_qty": row[3],
        }
        for row in rows
    ]

def check_pending_reservation_mismatch(db: Any) -> list[dict[str, Any]]:
    rows = _rows(
        db,
        """
        SELECT i.item_id,
               it.mes_code,
               i.pending_quantity AS stored_pending,
               COALESCE(reserved.reserved_qty, 0) AS reserved_qty
        FROM inventory i
        LEFT JOIN items it ON it.item_id = i.item_id
        LEFT JOIN (
            SELECT l.item_id, SUM(l.quantity) AS reserved_qty
            FROM stock_request_lines l
            JOIN stock_requests r ON r.request_id = l.request_id
            WHERE LOWER(CAST(r.status AS TEXT)) = 'reserved'
              AND LOWER(CAST(l.status AS TEXT)) = 'reserved'
              AND LOWER(CAST(l.from_bucket AS TEXT)) = 'warehouse'
            GROUP BY l.item_id
        ) reserved ON reserved.item_id = i.item_id
        WHERE ABS(i.pending_quantity - COALESCE(reserved.reserved_qty, 0)) > 0.001
        """,
    )
    return [
        {
            "item_id": str(row[0]),
            "mes_code": row[1],
            "stored_pending": row[2],
            "reserved_qty": row[3],
        }
        for row in rows
    ]


def check_total_mismatch(db: Any) -> list[dict[str, Any]]:
    rows = _rows(
        db,
        """
        SELECT i.item_id, it.mes_code,
               i.quantity AS stored_total,
               i.warehouse_qty + COALESCE(loc_sum.total, 0) AS computed_total
        FROM inventory i
        LEFT JOIN items it ON it.item_id = i.item_id
        LEFT JOIN (
            SELECT item_id, SUM(quantity) AS total
            FROM inventory_locations
            GROUP BY item_id
        ) loc_sum ON loc_sum.item_id = i.item_id
        WHERE ABS(i.quantity - (i.warehouse_qty + COALESCE(loc_sum.total, 0))) > 0.001
        """,
    )
    return [
        {
            "item_id": str(row[0]),
            "mes_code": row[1],
            "stored_total": row[2],
            "computed_total": row[3],
        }
        for row in rows
    ]

def check_orphan_locations(db: Any) -> list[dict[str, Any]]:
    rows = _rows(
        db,
        """
        SELECT il.item_id, it.mes_code, il.department, il.status, il.quantity
        FROM inventory_locations il
        LEFT JOIN inventory i ON i.item_id = il.item_id
        LEFT JOIN items it ON it.item_id = il.item_id
        WHERE i.item_id IS NULL
        """,
    )
    return [
        {
            "item_id": str(row[0]),
            "mes_code": row[1],
            "department": row[2],
            "status": row[3],
            "quantity": row[4],
        }
        for row in rows
    ]


def check_orphan_inventory(db: Any) -> list[dict[str, Any]]:
    rows = _rows(
        db,
        """
        SELECT i.item_id, i.warehouse_qty, i.quantity, i.pending_quantity
        FROM inventory i
        LEFT JOIN items it ON it.item_id = i.item_id
        WHERE it.item_id IS NULL
        """,
    )
    return [
        {
            "item_id": str(row[0]),
            "warehouse_qty": row[1],
            "quantity": row[2],
            "pending_quantity": row[3],
        }
        for row in rows
    ]


def check_orphan_transactions(db: Any) -> list[dict[str, Any]]:
    rows = _rows(
        db,
        """
        SELECT tl.log_id, tl.item_id
        FROM transaction_logs tl
        LEFT JOIN items it ON it.item_id = tl.item_id
        WHERE tl.item_id IS NOT NULL AND it.item_id IS NULL
        """,
    )
    return [
        {
            "log_id": str(row[0]),
            "item_id": str(row[1]),
        }
        for row in rows
    ]

def check_missing_transaction_effects(db: Any) -> list[dict[str, Any]]:
    rows = _rows(
        db,
        """
        SELECT transaction_type, COUNT(*) AS count
        FROM transaction_logs
        WHERE transaction_type IN (
            'RECEIVE', 'SHIP', 'TRANSFER_TO_PROD', 'TRANSFER_TO_WH', 'TRANSFER_DEPT',
            'ADJUST', 'PRODUCE', 'BACKFLUSH', 'MARK_DEFECTIVE', 'UNMARK_DEFECTIVE',
            'DEFECT_SCRAP', 'SUPPLIER_RETURN', 'DISASSEMBLE'
        )
        AND COALESCE(TRIM(CAST(inventory_effect AS TEXT)), '') IN ('', '[]', 'null')
        GROUP BY transaction_type
        ORDER BY transaction_type
        """,
    )
    return [
        {
            "transaction_type": row[0],
            "count": row[1],
        }
        for row in rows
    ]


def check_stale_reserved(db: Any, url: str) -> list[dict[str, Any]]:
    if url.startswith("sqlite"):
        sql = """
            SELECT request_id, request_code, created_at
            FROM stock_requests
            WHERE status = 'reserved'
            AND created_at < datetime('now', '-7 days')
        """
    else:
        sql = """
            SELECT request_id, request_code, created_at
            FROM stock_requests
            WHERE status = 'reserved'
            AND created_at < NOW() - INTERVAL '7 days'
        """
    rows = _rows(db, sql)
    return [
        {"request_id": str(row[0]), "request_code": row[1], "created_at": str(row[2])}
        for row in rows
    ]


def print_sample(label: str, rows: list[dict[str, Any]], *keys: str) -> None:
    print(f"FAIL {label}: {len(rows)}")
    for row in rows[:5]:
        details = " ".join(f"{key}={row.get(key)}" for key in keys)
        print(f"  {details}")

def print_warning(label: str, rows: list[dict[str, Any]], *keys: str) -> None:
    total = sum(int(row.get("count") or 0) for row in rows) if "count" in keys else len(rows)
    print(f"WARN {label}: {total}")
    for row in rows[:5]:
        details = " ".join(f"{key}={row.get(key)}" for key in keys)
        print(f"  {details}")


def main() -> int:
    args = parse_args()
    url = database_url(args)
    Session = make_session(url)

    print("=" * 56)
    print("  DEXCOWIN MES inventory integrity check")
    print(f"  DB: {url[:80]}...")
    print("=" * 56)

    violations = 0
    try:
        with Session() as db:
            if url.startswith("sqlite"):
                missing = require_tables(db)
                if missing:
                    print(f"FAIL schema missing required table(s): {', '.join(missing)}")
                    return 1

            checks = [
                ("negative inventory", check_negative_inventory(db), ("mes_code", "warehouse_qty", "quantity", "pending_quantity")),
                ("negative locations", check_negative_locations(db), ("mes_code", "department", "status", "quantity")),
                ("pending > warehouse", check_pending_exceeds_warehouse(db), ("mes_code", "pending_quantity", "warehouse_qty")),
                ("pending reservation mismatch", check_pending_reservation_mismatch(db), ("mes_code", "stored_pending", "reserved_qty")),
                ("total mismatch", check_total_mismatch(db), ("mes_code", "stored_total", "computed_total")),
                ("orphan locations", check_orphan_locations(db), ("mes_code", "department", "status", "quantity")),
                ("orphan inventory", check_orphan_inventory(db), ("item_id", "warehouse_qty", "quantity", "pending_quantity")),
                ("orphan transactions", check_orphan_transactions(db), ("log_id", "item_id")),
                ("stale reserved requests", check_stale_reserved(db, url), ("request_code", "created_at")),
            ]

            for label, rows, keys in checks:
                if rows:
                    print_sample(label, rows, *keys)
                    violations += len(rows)
                else:
                    print(f"PASS {label}: 0")

            warnings = [
                ("missing transaction effects", check_missing_transaction_effects(db), ("transaction_type", "count")),
            ]
            for label, rows, keys in warnings:
                if rows:
                    print_warning(label, rows, *keys)
                else:
                    print(f"PASS {label}: 0")
    except SQLAlchemyError as exc:
        print(f"FAIL database check error: {exc}")
        return 1

    print("-" * 56)
    if violations:
        print(f"FAIL inventory integrity violations: {violations}")
        return 1
    print("PASS inventory integrity normal")
    return 0


if __name__ == "__main__":
    sys.exit(main())
