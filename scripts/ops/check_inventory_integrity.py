#!/usr/bin/env python3
"""재고 무결성 직접 점검 (서버 없이 DB 직접 접속).

사용법:
    # SQLite (기본)
    python scripts/ops/check_inventory_integrity.py

    # 환경변수로 DB URL 지정
    DATABASE_URL=postgresql://erp_user:erp_pass@localhost:5432/erp_db \
        python scripts/ops/check_inventory_integrity.py

종료 코드:
    0 = 전체 PASS
    1 = 위반 항목 있음
"""

import os
import sys
from decimal import Decimal
from pathlib import Path

# backend를 sys.path에 추가
BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{(BACKEND_DIR / 'erp.db').as_posix()}",
)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
Session = sessionmaker(bind=engine)


def _f(val) -> Decimal:
    return Decimal(str(val)) if val is not None else Decimal("0")


def check_negative_inventory(db) -> list[dict]:
    rows = db.execute(text(
        "SELECT i.item_id, it.erp_code, it.name, i.warehouse_qty, i.quantity "
        "FROM inventory i LEFT JOIN item it ON it.item_id = i.item_id "
        "WHERE i.warehouse_qty < 0 OR i.quantity < 0"
    )).fetchall()
    return [{"item_id": str(r[0]), "erp_code": r[1], "name": r[2],
             "warehouse_qty": r[3], "quantity": r[4]} for r in rows]


def check_negative_locations(db) -> list[dict]:
    rows = db.execute(text(
        "SELECT il.item_id, it.erp_code, il.department, il.status, il.quantity "
        "FROM inventory_location il LEFT JOIN item it ON it.item_id = il.item_id "
        "WHERE il.quantity < 0"
    )).fetchall()
    return [{"item_id": str(r[0]), "erp_code": r[1], "department": r[2],
             "status": r[3], "quantity": r[4]} for r in rows]


def check_pending_exceeds_warehouse(db) -> list[dict]:
    rows = db.execute(text(
        "SELECT i.item_id, it.erp_code, i.pending_quantity, i.warehouse_qty "
        "FROM inventory i LEFT JOIN item it ON it.item_id = i.item_id "
        "WHERE i.pending_quantity > i.warehouse_qty AND i.pending_quantity > 0"
    )).fetchall()
    return [{"item_id": str(r[0]), "erp_code": r[1],
             "pending_quantity": r[2], "warehouse_qty": r[3]} for r in rows]


def check_total_mismatch(db) -> list[dict]:
    """Inventory.quantity != warehouse_qty + Σ location.quantity"""
    rows = db.execute(text("""
        SELECT i.item_id, it.erp_code,
               i.quantity AS stored_total,
               i.warehouse_qty + COALESCE(loc_sum.total, 0) AS computed_total
        FROM inventory i
        LEFT JOIN item it ON it.item_id = i.item_id
        LEFT JOIN (
            SELECT item_id, SUM(quantity) AS total
            FROM inventory_location
            GROUP BY item_id
        ) loc_sum ON loc_sum.item_id = i.item_id
        WHERE ABS(i.quantity - (i.warehouse_qty + COALESCE(loc_sum.total, 0))) > 0.001
    """)).fetchall()
    return [{"item_id": str(r[0]), "erp_code": r[1],
             "stored_total": r[2], "computed_total": r[3]} for r in rows]


def check_stale_reserved(db) -> list[dict]:
    rows = db.execute(text(
        "SELECT request_id, request_code, created_at "
        "FROM stock_request "
        "WHERE status = 'reserved' "
        "AND created_at < datetime('now', '-7 days')"
        if DATABASE_URL.startswith("sqlite") else
        "SELECT request_id, request_code, created_at "
        "FROM stock_request "
        "WHERE status = 'reserved' "
        "AND created_at < NOW() - INTERVAL '7 days'"
    )).fetchall()
    return [{"request_id": str(r[0]), "request_code": r[1], "created_at": str(r[2])}
            for r in rows]


def main():
    print("=" * 56)
    print("  재고 무결성 점검")
    print(f"  DB: {DATABASE_URL[:60]}...")
    print("=" * 56)

    violations = 0

    with Session() as db:
        # 1. 음수 재고
        neg_inv = check_negative_inventory(db)
        if neg_inv:
            print(f"❌ 음수 창고/총재고: {len(neg_inv)}개 품목")
            for v in neg_inv[:5]:
                print(f"   {v['erp_code']} wh={v['warehouse_qty']} total={v['quantity']}")
            violations += len(neg_inv)
        else:
            print("✅ 음수 창고/총재고: 없음")

        # 2. 음수 위치 재고
        neg_loc = check_negative_locations(db)
        if neg_loc:
            print(f"❌ 음수 위치 재고: {len(neg_loc)}개 행")
            for v in neg_loc[:5]:
                print(f"   {v['erp_code']} {v['department']}/{v['status']} qty={v['quantity']}")
            violations += len(neg_loc)
        else:
            print("✅ 음수 위치 재고: 없음")

        # 3. pending > warehouse
        pend = check_pending_exceeds_warehouse(db)
        if pend:
            print(f"❌ pending > warehouse: {len(pend)}개 품목")
            for v in pend[:5]:
                print(f"   {v['erp_code']} pending={v['pending_quantity']} wh={v['warehouse_qty']}")
            violations += len(pend)
        else:
            print("✅ pending ≤ warehouse: 모두 만족")

        # 4. 총량 불일치
        mismatch = check_total_mismatch(db)
        if mismatch:
            print(f"❌ 총량 불일치: {len(mismatch)}개 품목")
            for v in mismatch[:5]:
                print(f"   {v['erp_code']} stored={v['stored_total']} computed={v['computed_total']}")
            violations += len(mismatch)
        else:
            print("✅ 총량 일치: 모두 정상")

        # 5. Stale reserved 요청
        try:
            stale = check_stale_reserved(db)
            if stale:
                print(f"⚠️  7일 이상 RESERVED: {len(stale)}건")
            else:
                print("✅ 장기 RESERVED 없음")
        except Exception:
            print("⚠️  stale 요청 검사 실패 (stock_request 테이블 없음?)")

    print()
    print("-" * 56)
    if violations > 0:
        print(f"  ❌ 위반 항목: {violations}건 — 즉시 확인 필요")
        sys.exit(1)
    else:
        print("  ✅ 전체 PASS — 재고 무결성 정상")
        sys.exit(0)


if __name__ == "__main__":
    main()
