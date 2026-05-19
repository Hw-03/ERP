"""services/audit_csv.py 단위 테스트.

이벤트 리스너는 app.database.SessionLocal 에 묶여 있어 fixture 의 in-memory
세션과 다른 connection 을 사용하므로 별도 통합 테스트로 다룬다. 본 파일은
pure helper (row_from_log, path_for_month, AUDIT_TX_TYPES) 와 DB-backed
backfill_all 의 idempotency 만 검증한다.
"""

from __future__ import annotations

import csv
import uuid as _uuid
from datetime import datetime
from decimal import Decimal
from pathlib import Path

import pytest

from app.models import Item, TransactionLog, TransactionTypeEnum
from app.services import audit_csv


D = Decimal


@pytest.fixture()
def csv_dir(tmp_path, monkeypatch) -> Path:
    """AUDIT_CSV_DIR 을 tmp 경로로 강제."""
    monkeypatch.setenv("AUDIT_CSV_DIR", str(tmp_path))
    # backend Path import 후 캐싱 우려 없음 — get_csv_dir() 매번 환경변수 읽음
    return tmp_path


def _mk_log(item_id, *, tx: TransactionTypeEnum, qty, when: datetime) -> TransactionLog:
    log = TransactionLog(
        log_id=_uuid.uuid4(),
        item_id=item_id,
        transaction_type=tx,
        quantity_change=qty,
        quantity_before=D("0"),
        quantity_after=qty,
        reference_no="RX-001",
        produced_by="홍길동",
        notes="단위 테스트",
        created_at=when,
    )
    return log


def test_audit_tx_types_excludes_production_and_reserve():
    """생산/백플러시/예약 은 명시적으로 제외."""
    assert TransactionTypeEnum.PRODUCE not in audit_csv.AUDIT_TX_TYPES
    assert TransactionTypeEnum.BACKFLUSH not in audit_csv.AUDIT_TX_TYPES
    assert TransactionTypeEnum.RESERVE not in audit_csv.AUDIT_TX_TYPES
    assert TransactionTypeEnum.RESERVE_RELEASE not in audit_csv.AUDIT_TX_TYPES


def test_audit_tx_types_includes_material_movement():
    """자재 이동 핵심 유형은 포함."""
    for tt in (
        TransactionTypeEnum.RECEIVE,
        TransactionTypeEnum.SHIP,
        TransactionTypeEnum.TRANSFER_TO_PROD,
        TransactionTypeEnum.TRANSFER_TO_WH,
        TransactionTypeEnum.TRANSFER_DEPT,
        TransactionTypeEnum.SCRAP,
        TransactionTypeEnum.LOSS,
        TransactionTypeEnum.ADJUST,
        TransactionTypeEnum.RETURN,
        TransactionTypeEnum.SUPPLIER_RETURN,
        TransactionTypeEnum.MARK_DEFECTIVE,
        TransactionTypeEnum.DISASSEMBLE,
    ):
        assert tt in audit_csv.AUDIT_TX_TYPES, f"{tt} 누락"


def test_row_from_log_columns_in_order(make_item, db_session):
    item = make_item(name="볼트 M4")
    log = _mk_log(item.item_id, tx=TransactionTypeEnum.RECEIVE, qty=D("10"), when=datetime(2026, 5, 20, 9, 30, 0))
    row = audit_csv.row_from_log(log, item)
    assert len(row) == len(audit_csv.CSV_HEADERS) == 11
    assert row[0] == "2026-05-20 09:30:00"
    assert row[1] == "입고"
    assert row[3] == "볼트 M4"
    assert row[4] == "10"
    assert row[7] == "RX-001"
    assert row[8] == "홍길동"
    assert row[10] == str(log.log_id)


def test_row_from_log_strips_newlines_in_notes(make_item):
    item = make_item()
    log = _mk_log(item.item_id, tx=TransactionTypeEnum.SHIP, qty=D("-3"), when=datetime(2026, 5, 1, 0, 0))
    log.notes = "first\nsecond\rthird"
    row = audit_csv.row_from_log(log, item)
    assert "\n" not in row[9] and "\r" not in row[9]
    assert "first second third" == row[9]


def test_path_for_month_uses_env_dir(csv_dir):
    p = audit_csv.path_for_month(datetime(2026, 5, 20))
    assert p == csv_dir / "inout_2026-05.csv"


def test_backfill_writes_monthly_files(csv_dir, make_item, db_session):
    item = make_item(name="너트")
    # 같은 월 2건 + 다른 월 1건
    db_session.add(_mk_log(item.item_id, tx=TransactionTypeEnum.RECEIVE, qty=D("5"), when=datetime(2026, 5, 1, 10, 0)))
    db_session.add(_mk_log(item.item_id, tx=TransactionTypeEnum.SHIP, qty=D("-2"), when=datetime(2026, 5, 20, 11, 0)))
    db_session.add(_mk_log(item.item_id, tx=TransactionTypeEnum.SCRAP, qty=D("-1"), when=datetime(2026, 4, 30, 23, 59)))
    db_session.commit()

    result = audit_csv.backfill_all(db_session)
    assert result["total_rows"] == 3
    assert sorted(result["months"]) == ["2026-04", "2026-05"]

    may = csv_dir / "inout_2026-05.csv"
    apr = csv_dir / "inout_2026-04.csv"
    assert may.exists() and apr.exists()

    with may.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    assert rows[0] == audit_csv.CSV_HEADERS
    assert len(rows) == 3  # header + 2건
    assert rows[1][1] == "입고"
    assert rows[2][1] == "출고"


def test_backfill_excludes_produce(csv_dir, make_item, db_session):
    """생산입고는 외부 로그에서 제외."""
    item = make_item()
    db_session.add(_mk_log(item.item_id, tx=TransactionTypeEnum.PRODUCE, qty=D("10"), when=datetime(2026, 5, 5, 8, 0)))
    db_session.add(_mk_log(item.item_id, tx=TransactionTypeEnum.RECEIVE, qty=D("5"), when=datetime(2026, 5, 5, 9, 0)))
    db_session.commit()

    result = audit_csv.backfill_all(db_session)
    assert result["total_rows"] == 1
    p = csv_dir / "inout_2026-05.csv"
    with p.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    assert len(rows) == 2  # header + 1
    assert rows[1][1] == "입고"


def test_backfill_idempotent(csv_dir, make_item, db_session):
    """같은 인풋으로 두 번 돌려도 결과가 같다."""
    item = make_item()
    db_session.add(_mk_log(item.item_id, tx=TransactionTypeEnum.RECEIVE, qty=D("7"), when=datetime(2026, 3, 15, 14, 0)))
    db_session.commit()

    audit_csv.backfill_all(db_session)
    p = csv_dir / "inout_2026-03.csv"
    snapshot1 = p.read_bytes()

    audit_csv.backfill_all(db_session)
    snapshot2 = p.read_bytes()
    assert snapshot1 == snapshot2


def test_list_available_months_reflects_disk(csv_dir, make_item, db_session):
    item = make_item()
    db_session.add(_mk_log(item.item_id, tx=TransactionTypeEnum.RECEIVE, qty=D("1"), when=datetime(2026, 2, 1, 0, 0)))
    db_session.add(_mk_log(item.item_id, tx=TransactionTypeEnum.SHIP, qty=D("-1"), when=datetime(2026, 2, 28, 23, 0)))
    db_session.commit()
    audit_csv.backfill_all(db_session)

    meta = audit_csv.list_available_months()
    assert len(meta) == 1
    assert meta[0]["month"] == "2026-02"
    assert meta[0]["file_name"] == "inout_2026-02.csv"
    assert meta[0]["row_count"] == 2
    assert meta[0]["size_bytes"] > 0


def test_listener_appends_on_commit(csv_dir, make_item, db_session):
    """세션 이벤트가 실제 commit 직후 CSV 에 append 한다 (rollback 은 미반영)."""
    from sqlalchemy import event

    event.listen(db_session, "after_flush", audit_csv._collect_after_flush)
    event.listen(db_session, "after_commit", audit_csv._emit_after_commit)
    event.listen(db_session, "after_rollback", audit_csv._discard_on_rollback)

    try:
        item = make_item(name="리스너 품목")
        db_session.add(
            _mk_log(item.item_id, tx=TransactionTypeEnum.RECEIVE, qty=D("3"), when=datetime(2026, 6, 10, 12, 0))
        )
        db_session.commit()

        p = csv_dir / "inout_2026-06.csv"
        assert p.exists(), "commit 직후 월별 CSV 가 생성되어야 한다"
        with p.open("r", encoding="utf-8-sig", newline="") as f:
            rows = list(csv.reader(f))
        assert len(rows) == 2  # header + 1
        assert rows[1][1] == "입고"
        assert rows[1][3] == "리스너 품목"
    finally:
        event.remove(db_session, "after_flush", audit_csv._collect_after_flush)
        event.remove(db_session, "after_commit", audit_csv._emit_after_commit)
        event.remove(db_session, "after_rollback", audit_csv._discard_on_rollback)


def test_listener_skips_rollback(csv_dir, make_item, db_session):
    """rollback 된 거래는 CSV 에 남지 않는다."""
    from sqlalchemy import event

    event.listen(db_session, "after_flush", audit_csv._collect_after_flush)
    event.listen(db_session, "after_commit", audit_csv._emit_after_commit)
    event.listen(db_session, "after_rollback", audit_csv._discard_on_rollback)

    try:
        item = make_item()
        db_session.commit()  # item 자체는 커밋 (별도 transaction)

        db_session.add(
            _mk_log(item.item_id, tx=TransactionTypeEnum.SCRAP, qty=D("-1"), when=datetime(2026, 7, 1, 8, 0))
        )
        db_session.flush()
        db_session.rollback()

        p = csv_dir / "inout_2026-07.csv"
        assert not p.exists(), "rollback 된 거래는 파일을 만들지 않아야 한다"
    finally:
        event.remove(db_session, "after_flush", audit_csv._collect_after_flush)
        event.remove(db_session, "after_commit", audit_csv._emit_after_commit)
        event.remove(db_session, "after_rollback", audit_csv._discard_on_rollback)
