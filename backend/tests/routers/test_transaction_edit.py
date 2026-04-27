"""거래 수정 (메타데이터 + 수량 보정) 테스트."""

from __future__ import annotations

import json
from decimal import Decimal

import pytest
from app.models import (
    CategoryEnum,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    Item,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services.pin_auth import DEFAULT_PIN_HASH, hash_pin


@pytest.fixture()
def editor(db_session):
    """수정 작업을 수행할 직원 (PIN 0000)."""
    emp = Employee(
        employee_code="ED01",
        name="수정담당",
        role="조립/대리",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        display_order=99,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(emp)
    db_session.commit()
    return emp


@pytest.fixture()
def receive_log(db_session, make_item):
    """RECEIVE 거래 + 재고 100."""
    item = make_item(name="테스트입고품", warehouse_qty=Decimal("100"))
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=Decimal("100"),
        quantity_before=Decimal("0"),
        quantity_after=Decimal("100"),
        reference_no="REF-001",
        produced_by="원작성자(조립)",
        notes="원본 메모",
    )
    db_session.add(log)
    db_session.commit()
    return log, item


@pytest.fixture()
def ship_log(db_session, make_item):
    """SHIP 거래 + 재고 70 (100 받았다가 30 출고)."""
    item = make_item(name="테스트출고품", warehouse_qty=Decimal("70"))
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.SHIP,
        quantity_change=Decimal("-30"),
        quantity_before=Decimal("100"),
        quantity_after=Decimal("70"),
        reference_no="SHP-001",
        produced_by="출고자(영업)",
        notes=None,
    )
    db_session.add(log)
    db_session.commit()
    return log, item


# ─── 메타데이터 수정 (3차) ──────────────────────────────────────────────────

def test_meta_edit_requires_reason(client, receive_log, editor):
    log, _item = receive_log
    resp = client.post(
        f"/api/inventory/transactions/{log.log_id}/meta-edit",
        json={
            "notes": "수정된 메모",
            "reason": "",  # 빈 사유 → 422
            "edited_by_employee_id": str(editor.employee_id),
            "edited_by_pin": "0000",
        },
    )
    assert resp.status_code == 422


def test_meta_edit_wrong_pin_403(client, receive_log, editor):
    log, _ = receive_log
    resp = client.post(
        f"/api/inventory/transactions/{log.log_id}/meta-edit",
        json={
            "notes": "수정된 메모",
            "reason": "오타 수정",
            "edited_by_employee_id": str(editor.employee_id),
            "edited_by_pin": "9999",
        },
    )
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "FORBIDDEN"


def test_meta_edit_success_records_history(client, db_session, receive_log, editor):
    log, _ = receive_log
    resp = client.post(
        f"/api/inventory/transactions/{log.log_id}/meta-edit",
        json={
            "notes": "수정된 메모",
            "reference_no": "REF-002",
            "produced_by": None,  # 변경 안 됨
            "reason": "오타 수정",
            "edited_by_employee_id": str(editor.employee_id),
            "edited_by_pin": "0000",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["notes"] == "수정된 메모"
    assert data["reference_no"] == "REF-002"
    assert data["edit_count"] == 1

    # 수정 이력 조회
    edits_resp = client.get(f"/api/inventory/transactions/{log.log_id}/edits")
    assert edits_resp.status_code == 200
    edits = edits_resp.json()
    assert len(edits) == 1
    edit = edits[0]
    assert edit["reason"] == "오타 수정"
    assert edit["edited_by_name"] == "수정담당"
    assert edit["correction_log_id"] is None  # 메타 수정은 보정 거래 없음
    before = json.loads(edit["before_payload"])
    after = json.loads(edit["after_payload"])
    assert before["notes"] == "원본 메모"
    assert after["notes"] == "수정된 메모"


def test_meta_edit_blocks_unsupported_type(client, db_session, make_item, editor):
    """PRODUCE 타입 거래는 메타 수정 거부."""
    item = make_item(name="생산품", warehouse_qty=Decimal("0"))
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.PRODUCE,
        quantity_change=Decimal("10"),
        notes="생산입고",
    )
    db_session.add(log)
    db_session.commit()

    resp = client.post(
        f"/api/inventory/transactions/{log.log_id}/meta-edit",
        json={
            "notes": "수정",
            "reason": "테스트",
            "edited_by_employee_id": str(editor.employee_id),
            "edited_by_pin": "0000",
        },
    )
    assert resp.status_code == 422


def test_list_transactions_returns_edit_count(client, db_session, receive_log, editor):
    log, _ = receive_log
    # 2번 수정
    for i in range(2):
        client.post(
            f"/api/inventory/transactions/{log.log_id}/meta-edit",
            json={
                "notes": f"수정 {i}",
                "reason": f"이유 {i}",
                "edited_by_employee_id": str(editor.employee_id),
                "edited_by_pin": "0000",
            },
        )

    resp = client.get("/api/inventory/transactions")
    assert resp.status_code == 200
    rows = resp.json()
    target = next(r for r in rows if r["log_id"] == str(log.log_id))
    assert target["edit_count"] == 2


# ─── 수량 보정 (4차) ────────────────────────────────────────────────────────

def test_quantity_correct_receive_creates_adjust(client, db_session, receive_log, editor):
    """RECEIVE 100 → 80으로 보정. delta=-20 ADJUST 거래 생성, 창고 100→80."""
    log, item = receive_log
    resp = client.post(
        f"/api/inventory/transactions/{log.log_id}/quantity-correction",
        json={
            "quantity_change": 80,
            "reason": "실수 입력",
            "edited_by_employee_id": str(editor.employee_id),
            "edited_by_pin": "0000",
        },
    )
    assert resp.status_code == 200, resp.json()
    data = resp.json()
    assert data["original"]["log_id"] == str(log.log_id)
    assert Decimal(data["correction"]["quantity_change"]) == Decimal("-20")
    assert data["correction"]["transaction_type"] == "ADJUST"

    # 재고 확인
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv.warehouse_qty == Decimal("80")

    # 원본은 보존 (quantity_change 그대로)
    db_session.refresh(log)
    assert log.quantity_change == Decimal("100")


def test_quantity_correct_ship_must_be_negative(client, receive_log, editor):
    """SHIP 부호 검증은 수량 보정에서도 적용."""
    log, _ = receive_log  # 이건 RECEIVE라 RECEIVE 검증
    resp = client.post(
        f"/api/inventory/transactions/{log.log_id}/quantity-correction",
        json={
            "quantity_change": -10,  # RECEIVE인데 음수 → 거부
            "reason": "잘못된 부호",
            "edited_by_employee_id": str(editor.employee_id),
            "edited_by_pin": "0000",
        },
    )
    assert resp.status_code == 422


def test_quantity_correct_ship_negative_value(client, db_session, ship_log, editor):
    """SHIP -30 → -20으로 보정. delta=+10, 창고 70→80."""
    log, item = ship_log
    resp = client.post(
        f"/api/inventory/transactions/{log.log_id}/quantity-correction",
        json={
            "quantity_change": -20,
            "reason": "출고량 정정",
            "edited_by_employee_id": str(editor.employee_id),
            "edited_by_pin": "0000",
        },
    )
    assert resp.status_code == 200
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv.warehouse_qty == Decimal("80")


def test_quantity_correct_negative_warehouse_blocked(client, db_session, ship_log, editor):
    """SHIP -30 → -200으로 보정 시도 (delta=-170, 창고 70-170=-100) → 422 재고부족."""
    log, _ = ship_log
    resp = client.post(
        f"/api/inventory/transactions/{log.log_id}/quantity-correction",
        json={
            "quantity_change": -200,
            "reason": "과도한 출고 정정",
            "edited_by_employee_id": str(editor.employee_id),
            "edited_by_pin": "0000",
        },
    )
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "STOCK_SHORTAGE"


def test_quantity_correct_blocks_adjust_type(client, db_session, make_item, editor):
    """ADJUST 거래는 수량 보정 차단 (정책 미확정)."""
    item = make_item(name="조정품", warehouse_qty=Decimal("50"))
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.ADJUST,
        quantity_change=Decimal("50"),
    )
    db_session.add(log)
    db_session.commit()

    resp = client.post(
        f"/api/inventory/transactions/{log.log_id}/quantity-correction",
        json={
            "quantity_change": 60,
            "reason": "재조정",
            "edited_by_employee_id": str(editor.employee_id),
            "edited_by_pin": "0000",
        },
    )
    assert resp.status_code == 422


def test_quantity_correct_links_correction_log(client, db_session, receive_log, editor):
    """수량 보정 후 TransactionEditLog의 correction_log_id가 보정 거래를 가리킴."""
    log, _ = receive_log
    resp = client.post(
        f"/api/inventory/transactions/{log.log_id}/quantity-correction",
        json={
            "quantity_change": 90,
            "reason": "정확한 수량",
            "edited_by_employee_id": str(editor.employee_id),
            "edited_by_pin": "0000",
        },
    )
    assert resp.status_code == 200
    correction_id = resp.json()["correction"]["log_id"]

    edits = client.get(f"/api/inventory/transactions/{log.log_id}/edits").json()
    assert len(edits) == 1
    assert edits[0]["correction_log_id"] == correction_id


# ─── 직원 PIN 초기화 (2차) ─────────────────────────────────────────────────

def test_reset_pin_endpoint(client, db_session):
    emp = Employee(
        employee_code="PR01",
        name="피인변경자",
        role="테스트",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        display_order=1,
        is_active="true",
        pin_hash=hash_pin("9999"),  # 변경된 PIN
    )
    db_session.add(emp)
    db_session.commit()

    # 9999로 검증 성공
    r = client.post(f"/api/employees/{emp.employee_id}/verify-pin", json={"pin": "9999"})
    assert r.status_code == 200

    # 초기화 후
    reset = client.post(f"/api/employees/{emp.employee_id}/reset-pin")
    assert reset.status_code == 204

    # 9999는 실패, 0000은 성공
    r1 = client.post(f"/api/employees/{emp.employee_id}/verify-pin", json={"pin": "9999"})
    assert r1.status_code == 403
    r2 = client.post(f"/api/employees/{emp.employee_id}/verify-pin", json={"pin": "0000"})
    assert r2.status_code == 200
