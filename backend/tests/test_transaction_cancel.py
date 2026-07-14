"""거래 취소(cancel) 재구현 테스트 — 효과 기반 역재생.

각 거래 유형을 실제 엔드포인트로 생성 → 취소 → 재고 원복을 검증한다.
핵심: 불량(MARK_DEFECTIVE) 격리 취소가 창고/부서 위치를 정확히 되돌리는지.
"""

from __future__ import annotations

from decimal import Decimal

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    LocationStatusEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services.pin_auth import DEFAULT_PIN_HASH


def _make_employee(
    db_session,
    *,
    code: str = "KW01",
    name: str = "김취소",
    department: DepartmentEnum = DepartmentEnum.ASSEMBLY,
    warehouse_role: str = "none",
    department_role: str = "none",
) -> Employee:
    emp = Employee(
        employee_code=code,
        name=name,
        role=f"{department.value}/staff",
        department=department,
        level=EmployeeLevelEnum.STAFF,
        warehouse_role=warehouse_role,
        department_role=department_role,
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(emp)
    db_session.flush()
    return emp


def _cells(db_session, item_id):
    """(warehouse_qty, {(dept,status): qty}) 스냅샷."""
    inv = db_session.query(Inventory).filter(Inventory.item_id == item_id).first()
    locs = {
        (l.department, l.status.value): int(l.quantity or 0)
        for l in db_session.query(InventoryLocation).filter(InventoryLocation.item_id == item_id).all()
    }
    return int(inv.warehouse_qty or 0), int(inv.quantity or 0), locs


def _cancel(client, log_id, *, code="KW01", pin="0000", reason="취소 테스트"):
    return client.post(
        f"/api/inventory/transactions/{log_id}/cancel",
        json={"reason": reason, "employee_code": code, "pin": pin},
    )


def _approve(client, request_id, approver: Employee):
    return client.post(
        f"/api/stock-requests/{request_id}/approve",
        json={"actor_employee_id": str(approver.employee_id), "pin": "0000"},
    )


def _receive_v2(client, item, requester: Employee, quantity: int):
    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "receive",
            "sub_type": "receive_supplier",
            "targets": [{"source_kind": "direct_item", "item_id": str(item.item_id), "quantity": str(quantity)}],
        },
    )
    assert preview.status_code == 200, preview.text
    res = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "receive",
            "sub_type": "receive_supplier",
            "bundles": preview.json()["bundles"],
        },
    )
    assert res.status_code == 201, res.text
    return res


# ---------------------------------------------------------------------------
# 불량 격리(새 불량) 취소 — 사용자가 막혔던 바로 그 케이스
# ---------------------------------------------------------------------------


def test_cancel_quarantine_restores_warehouse_and_defective(client, db_session, make_item):
    item = make_item(name="격리품", warehouse_qty=Decimal("100"))
    actor = _make_employee(db_session)  # 역할 없음 — is_self 는 produced_by 이름으로 판정
    db_session.commit()

    res = client.post(
        "/api/defects/quarantine",
        json={
            "item_id": str(item.item_id),
            "qty": 30,
            "source": "warehouse",
            "target_dept": DepartmentEnum.ASSEMBLY.value,
            "reason_memo": "표면 흠집",
            "actor_employee_id": str(actor.employee_id),
        },
    )
    assert res.status_code == 200, res.text

    wh, total, locs = _cells(db_session, item.item_id)
    assert wh == 70
    assert locs[(DepartmentEnum.ASSEMBLY.value, "DEFECTIVE")] == 30
    assert total == 100  # 총량 불변

    log = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.transaction_type == TransactionTypeEnum.MARK_DEFECTIVE)
        .first()
    )
    # 효과가 캡처됐는지 — 창고 -30 / 조립 DEFECTIVE +30
    assert log.inventory_effect is not None
    deltas = {(c["scope"], c.get("department"), c.get("status")): c["delta"] for c in log.inventory_effect}
    assert deltas[("warehouse", None, None)] == -30
    assert deltas[("location", DepartmentEnum.ASSEMBLY.value, "DEFECTIVE")] == 30

    res = _cancel(client, log.log_id)
    assert res.status_code == 200, res.text
    assert res.json()["cancelled"] is True

    wh, total, locs = _cells(db_session, item.item_id)
    assert wh == 100  # 창고 복귀
    assert locs.get((DepartmentEnum.ASSEMBLY.value, "DEFECTIVE"), 0) == 0
    assert total == 100


# ---------------------------------------------------------------------------
# 단순 입고/이동 취소
# ---------------------------------------------------------------------------


def test_cancel_receive_restores_warehouse(client, db_session, make_item):
    item = make_item(name="입고품", warehouse_qty=Decimal("0"))
    actor = _make_employee(db_session, code="RC01")
    db_session.commit()
    res = _receive_v2(client, item, actor, 50)
    wh, _, _ = _cells(db_session, item.item_id)
    assert wh == 50

    log = db_session.query(TransactionLog).filter(
        TransactionLog.transaction_type == TransactionTypeEnum.RECEIVE
    ).first()
    res = _cancel(client, log.log_id, code="RC01")
    assert res.status_code == 200, res.text

    wh, _, _ = _cells(db_session, item.item_id)
    assert wh == 0


def test_cancel_internal_use_restores_warehouse_total(client, db_session, make_item):
    item = make_item(name="사내사용 취소품", warehouse_qty=Decimal("12"))
    actor = _make_employee(
        db_session,
        code="IU-CANCEL",
        department=DepartmentEnum.AS,
    )
    approver = _make_employee(
        db_session,
        code="IU-CANCEL-WH",
        warehouse_role="primary",
    )
    db_session.commit()
    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(actor.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": "AS",
            "targets": [
                {"source_kind": "direct_item", "item_id": str(item.item_id), "quantity": 4}
            ],
        },
    )
    assert preview.status_code == 200, preview.text
    submitted = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(actor.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": "AS",
            "bundles": preview.json()["bundles"],
        },
    )
    assert submitted.status_code == 201, submitted.text
    approved = _approve(client, submitted.json()["stock_request_id"], approver)
    assert approved.status_code == 200, approved.text
    log = db_session.query(TransactionLog).filter(
        TransactionLog.transaction_type == TransactionTypeEnum.INTERNAL_USE
    ).one()
    assert _cells(db_session, item.item_id)[:2] == (8, 8)

    cancelled = _cancel(client, log.log_id, code=actor.employee_code)
    assert cancelled.status_code == 200, cancelled.text
    assert _cells(db_session, item.item_id)[:2] == (12, 12)


def test_cancel_internal_use_batch_restores_all_items(
    client, db_session, make_item
):
    first = make_item(name="사내사용 배치품 A", warehouse_qty=Decimal("12"))
    second = make_item(name="사내사용 배치품 B", warehouse_qty=Decimal("9"))
    actor = _make_employee(
        db_session,
        code="IU-BATCH-CANCEL",
        department=DepartmentEnum.RESEARCH,
    )
    approver = _make_employee(
        db_session,
        code="IU-BATCH-WH",
        warehouse_role="deputy",
    )
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(actor.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": "연구",
            "targets": [
                {"source_kind": "direct_item", "item_id": str(first.item_id), "quantity": 4},
                {"source_kind": "direct_item", "item_id": str(second.item_id), "quantity": 5},
            ],
        },
    )
    assert preview.status_code == 200, preview.text
    submitted = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(actor.employee_id),
            "work_type": "internal_use",
            "sub_type": "internal_use_out",
            "to_department": "연구",
            "bundles": preview.json()["bundles"],
        },
    )
    assert submitted.status_code == 201, submitted.text
    approved = _approve(client, submitted.json()["stock_request_id"], approver)
    assert approved.status_code == 200, approved.text

    logs = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.transaction_type == TransactionTypeEnum.INTERNAL_USE)
        .all()
    )
    assert len(logs) == 2
    assert logs[0].operation_batch_id is not None
    assert {log.operation_batch_id for log in logs} == {logs[0].operation_batch_id}
    assert _cells(db_session, first.item_id) == (8, 8, {})
    assert _cells(db_session, second.item_id) == (4, 4, {})

    cancelled = _cancel(client, logs[0].log_id, code=actor.employee_code)
    assert cancelled.status_code == 200, cancelled.text
    db_session.expire_all()

    batch_logs = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.operation_batch_id == logs[0].operation_batch_id)
        .all()
    )
    assert len(batch_logs) == 2
    assert all(log.cancelled for log in batch_logs)
    assert _cells(db_session, first.item_id) == (12, 12, {})
    assert _cells(db_session, second.item_id) == (9, 9, {})


def test_effect_helper_roundtrip(db_session, make_item):
    """효과 캡처(snapshot/diff) → 역재생(apply_effect_reverse) 라운드트립 — 창고↔부서 이동 형태."""
    from app.services import inv_effect

    item = make_item(name="이동품", warehouse_qty=Decimal("40"))
    db_session.commit()

    before = inv_effect.snapshot_cells(db_session, item.item_id)
    # 창고→조립 PRODUCTION 이동을 모사
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.warehouse_qty = Decimal("25")
    loc = InventoryLocation(
        item_id=item.item_id, department=DepartmentEnum.ASSEMBLY.value,
        status=LocationStatusEnum.PRODUCTION, quantity=Decimal("15"),
    )
    db_session.add(loc)
    db_session.flush()

    effect = inv_effect.capture_effect(db_session, item.item_id, before)
    deltas = {(c["scope"], c.get("department"), c.get("status")): c["delta"] for c in effect}
    assert deltas[("warehouse", None, None)] == -15
    assert deltas[("location", DepartmentEnum.ASSEMBLY.value, "PRODUCTION")] == 15

    # 역재생 → 원상복구
    inv_effect.apply_effect_reverse(db_session, item.item_id, effect)
    db_session.flush()
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    loc = db_session.query(InventoryLocation).filter(
        InventoryLocation.item_id == item.item_id,
        InventoryLocation.status == LocationStatusEnum.PRODUCTION,
    ).first()
    assert int(inv.warehouse_qty) == 40
    assert int(loc.quantity) == 0


def test_cancel_io_v2_receive_restores(client, db_session, make_item):
    """IO v2 경로(io_dispatch) 즉시 입고 → 취소 → 창고 원복. is_self 는 배치 요청자로 판정."""
    item = make_item(name="IO입고품", warehouse_qty=Decimal("0"))
    requester = _make_employee(db_session, code="IOV1", name="IO요청자")
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "receive",
            "sub_type": "receive_supplier",
            "targets": [{"source_kind": "direct_item", "item_id": str(item.item_id), "quantity": "20"}],
        },
    )
    assert preview.status_code == 200, preview.text
    res = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "receive",
            "sub_type": "receive_supplier",
            "bundles": preview.json()["bundles"],
        },
    )
    assert res.status_code == 201, res.text
    wh, _, _ = _cells(db_session, item.item_id)
    assert wh == 20

    log = db_session.query(TransactionLog).filter(
        TransactionLog.item_id == item.item_id,
        TransactionLog.transaction_type == TransactionTypeEnum.RECEIVE,
    ).first()
    assert log.inventory_effect is not None  # io_dispatch 가 효과 캡처
    assert log.operation_batch_id is not None  # 배치 경로

    res = _cancel(client, log.log_id, code="IOV1")
    assert res.status_code == 200, res.text
    assert res.json()["cancelled"] is True
    wh, _, _ = _cells(db_session, item.item_id)
    assert wh == 0


# ---------------------------------------------------------------------------
# 안전 가드 — 음수 방지 / 중복 취소
# ---------------------------------------------------------------------------


def test_cancel_blocked_when_would_go_negative(client, db_session, make_item):
    item = make_item(name="음수품", warehouse_qty=Decimal("0"))
    actor = _make_employee(db_session, code="NG01")
    db_session.commit()

    # 입고 50 → 창고 50
    res = _receive_v2(client, item, actor, 50)
    log = db_session.query(TransactionLog).filter(
        TransactionLog.transaction_type == TransactionTypeEnum.RECEIVE
    ).first()

    # 입고분을 다른 데로 다 써서 창고를 0으로 — 그 뒤 입고 취소 시도 → 음수 → 차단
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.warehouse_qty = Decimal("0")
    inv.quantity = Decimal("0")
    db_session.commit()

    res = _cancel(client, log.log_id, code="NG01")
    assert res.status_code == 422, res.text
    assert "음수" in res.json()["detail"]["message"]

    # 재고 불변
    wh, _, _ = _cells(db_session, item.item_id)
    assert wh == 0
    # 로그도 취소 안 됨
    db_session.refresh(log)
    assert log.cancelled is False


def test_cancel_blocks_empty_inventory_effect_without_mutating_stock(client, db_session, make_item):
    item = make_item(name="empty-effect", warehouse_qty=Decimal("50"))
    actor = _make_employee(db_session, code="EMP0")
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=Decimal("50"),
        quantity_before=Decimal("0"),
        quantity_after=Decimal("50"),
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        inventory_effect=[],
    )
    db_session.add(log)
    db_session.commit()

    res = _cancel(client, log.log_id, code="EMP0")

    assert res.status_code == 422, res.text
    assert "재고 효과" in res.json()["detail"]["message"]
    wh, total, _ = _cells(db_session, item.item_id)
    assert wh == 50
    assert total == 50
    db_session.refresh(log)
    assert log.cancelled is False


def test_cancel_blocks_zero_delta_inventory_effect_without_mutating_stock(client, db_session, make_item):
    item = make_item(name="zero-effect", warehouse_qty=Decimal("50"))
    actor = _make_employee(db_session, code="EMPZ")
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=Decimal("50"),
        quantity_before=Decimal("0"),
        quantity_after=Decimal("50"),
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        inventory_effect=[{"scope": "warehouse", "delta": 0}],
    )
    db_session.add(log)
    db_session.commit()

    res = _cancel(client, log.log_id, code="EMPZ")

    assert res.status_code == 422, res.text
    assert "재고 효과" in res.json()["detail"]["message"]
    wh, total, _ = _cells(db_session, item.item_id)
    assert wh == 50
    assert total == 50
    db_session.refresh(log)
    assert log.cancelled is False

def test_cancel_idempotent_double(client, db_session, make_item):
    item = make_item(name="cancel-duplicate", warehouse_qty=Decimal("0"))
    actor = _make_employee(db_session, code="DUP1")
    db_session.commit()

    _receive_v2(client, item, actor, 10)
    log = db_session.query(TransactionLog).filter(
        TransactionLog.transaction_type == TransactionTypeEnum.RECEIVE
    ).first()

    assert _cancel(client, log.log_id, code="DUP1").status_code == 200
    res2 = _cancel(client, log.log_id, code="DUP1")
    assert res2.status_code == 422
    assert "이미 취소" in res2.json()["detail"]["message"]


# ---------------------------------------------------------------------------
# 권한
# ---------------------------------------------------------------------------


def test_cancel_non_self_non_approver_forbidden(client, db_session, make_item):
    item = make_item(name="권한품", warehouse_qty=Decimal("100"))
    requester = _make_employee(db_session, code="OWN1", name="요청자")
    other = _make_employee(db_session, code="OTH1", name="무권한타인")  # 역할 없음
    db_session.commit()

    client.post(
        "/api/defects/quarantine",
        json={
            "item_id": str(item.item_id), "qty": 10, "source": "warehouse",
            "target_dept": DepartmentEnum.ASSEMBLY.value, "reason_memo": "x",
            "actor_employee_id": str(requester.employee_id),
        },
    )
    log = db_session.query(TransactionLog).filter(
        TransactionLog.transaction_type == TransactionTypeEnum.MARK_DEFECTIVE
    ).first()

    res = _cancel(client, log.log_id, code="OTH1")
    assert res.status_code == 403, res.text




def test_cancel_without_employee_id_does_not_trust_same_name(client, db_session, make_item):
    item = make_item(name="same-name-cancel", warehouse_qty=Decimal("80"))
    original = _make_employee(db_session, code="SN01", name="Same Name")
    other_same_name = _make_employee(db_session, code="SN02", name="Same Name")
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=Decimal("20"),
        quantity_before=Decimal("60"),
        quantity_after=Decimal("80"),
        produced_by=original.name,
        producer_employee_id=None,
        inventory_effect=[{"scope": "warehouse", "delta": 20}],
    )
    db_session.add(log)
    db_session.commit()

    res = _cancel(client, log.log_id, code=other_same_name.employee_code)

    assert res.status_code == 403, res.text
    wh, total, _ = _cells(db_session, item.item_id)
    assert wh == 80
    assert total == 80
    db_session.refresh(log)
    assert log.cancelled is False
def test_cancel_approver_can_cancel_others(client, db_session, make_item):
    item = make_item(name="결재취소품", warehouse_qty=Decimal("100"))
    requester = _make_employee(db_session, code="OWN2", name="요청자2")
    approver = _make_employee(db_session, code="WH1", name="창고장", warehouse_role="primary")
    db_session.commit()

    client.post(
        "/api/defects/quarantine",
        json={
            "item_id": str(item.item_id), "qty": 10, "source": "warehouse",
            "target_dept": DepartmentEnum.ASSEMBLY.value, "reason_memo": "x",
            "actor_employee_id": str(requester.employee_id),
        },
    )
    log = db_session.query(TransactionLog).filter(
        TransactionLog.transaction_type == TransactionTypeEnum.MARK_DEFECTIVE
    ).first()

    res = _cancel(client, log.log_id, code="WH1")  # 창고 결재권한자
    assert res.status_code == 200, res.text
    wh, _, _ = _cells(db_session, item.item_id)
    assert wh == 100


def test_cancel_wrong_pin_forbidden(client, db_session, make_item):
    item = make_item(name="cancel-wrong-pin", warehouse_qty=Decimal("0"))
    actor = _make_employee(db_session, code="PIN1")
    db_session.commit()
    _receive_v2(client, item, actor, 5)
    log = db_session.query(TransactionLog).filter(
        TransactionLog.transaction_type == TransactionTypeEnum.RECEIVE
    ).first()
    res = _cancel(client, log.log_id, code="PIN1", pin="9999")
    assert res.status_code == 403


# ---------------------------------------------------------------------------
# 레거시 로그(효과 기록 없음) — 안내 메시지
# ---------------------------------------------------------------------------


def test_cancel_legacy_defect_without_effect_returns_message(client, db_session, make_item):
    item = make_item(name="레거시불량", warehouse_qty=Decimal("100"))
    approver = _make_employee(db_session, code="WH2", name="창고장2", warehouse_role="primary")
    # 효과 기록 이전 형식의 MARK_DEFECTIVE 로그 직접 삽입 (inventory_effect=None)
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.MARK_DEFECTIVE,
        quantity_change=Decimal("0"),
        quantity_before=Decimal("100"),
        quantity_after=Decimal("100"),
        produced_by="누군가",
        notes="격리: warehouse → 조립",
        department=DepartmentEnum.ASSEMBLY.value,
        inventory_effect=None,
    )
    db_session.add(log)
    db_session.commit()

    res = _cancel(client, log.log_id, code="WH2")
    assert res.status_code == 422, res.text
    assert "재고 효과" in res.json()["detail"]["message"]


def test_cancel_legacy_mark_defective_with_inferred_quantity_is_blocked(client, db_session, make_item):
    """수량 추론이 가능해 보여도 inventory_effect=None이면 자동 취소하지 않는다."""
    item = make_item(name="레거시불량복구", warehouse_qty=Decimal("70"))
    approver = _make_employee(db_session, code="WH3", name="창고장3", warehouse_role="primary")
    # 격리된 상태 재현: 부서 DEFECTIVE 위치에 30개
    loc = InventoryLocation(
        item_id=item.item_id,
        department=DepartmentEnum.ASSEMBLY.value,
        status=LocationStatusEnum.DEFECTIVE,
        quantity=Decimal("30"),
    )
    db_session.add(loc)
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.MARK_DEFECTIVE,
        quantity_change=Decimal("0"),
        quantity_before=Decimal("100"),
        quantity_after=Decimal("100"),
        produced_by="누군가",
        notes="격리: warehouse → 조립",
        department=DepartmentEnum.ASSEMBLY.value,
        warehouse_qty_before=Decimal("100"),
        warehouse_qty_after=Decimal("70"),
        inventory_effect=None,
    )
    db_session.add(log)
    db_session.commit()

    res = _cancel(client, log.log_id, code="WH3")
    assert res.status_code == 422, res.text
    assert "재고 효과" in res.json()["detail"]["message"]

    wh, _, locs = _cells(db_session, item.item_id)
    assert wh == 70
    assert locs.get((DepartmentEnum.ASSEMBLY.value, "DEFECTIVE"), 0) == 30
    db_session.refresh(log)
    assert log.cancelled is False
