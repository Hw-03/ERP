"""services/io_dispatch.py 회귀 그물 단위테스트.

현재 동작을 고정하는 회귀 테스트. 서비스 코드는 절대 수정하지 않는다.

전략: IoBatch/IoBundle/IoLine 를 DB 에 직접 만들고 io_dispatch 내부 함수를
직접 호출한 뒤, Inventory/InventoryLocation/TransactionLog 를 조회해 검증한다.
(HTTP 경유 흐름은 tests/test_io_v2.py 가 이미 커버 — 여기서는 dispatch 분기 자체를 못박는다.)
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.models import (
    BOM,
    DepartmentEnum,
    DefectQuarantineRecord,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryOperation,
    InventoryOperationEffect,
    InventoryOperationRoleEnum,
    InventoryLocation,
    IoBatch,
    IoBundle,
    IoLine,
    LocationStatusEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    ShippingRequest,
    ShippingRequestStatusEnum,
    SystemSetting,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services import io_dispatch as svc
from app.services.bom_stock_policy import io_bom_auto_claims, issue_bom_auto_token
from app.services.pin_auth import DEFAULT_PIN_HASH
from app.routers.inventory._tx_filters import _batch_name_map

D = Decimal
ASSEMBLY = DepartmentEnum.ASSEMBLY
TUNING = DepartmentEnum.TUNING


# ──────────────────────────── helpers ────────────────────────────


def _make_employee(
    db_session,
    *,
    code: str = "DISP01",
    name: str = "디스패치테스터",
    department: DepartmentEnum = DepartmentEnum.ASSEMBLY,
    warehouse_role: str = "none",
    department_role: str = "none",
    level: EmployeeLevelEnum = EmployeeLevelEnum.STAFF,
) -> Employee:
    employee = Employee(
        employee_code=code,
        name=name,
        role=f"{department.value}/staff",
        department=department,
        level=level,
        warehouse_role=warehouse_role,
        department_role=department_role,
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(employee)
    db_session.flush()
    return employee


def _build_batch(
    db_session,
    *,
    requester: Employee,
    sub_type: str,
    work_type: str = "process",
    status: str = "submitted",
    from_department=None,
    to_department=None,
    source_kind: str = "bom_parent",
    source_item_id=None,
    lines: list[dict],
) -> IoBatch:
    """라인 dict 목록으로 IoBatch/IoBundle/IoLine 한 묶음을 DB 에 만든다.

    line dict keys: direction, from_bucket, to_bucket, item_id, quantity,
    그리고 옵션 from_department/to_department/included/origin.
    """
    batch = IoBatch(
        batch_id=uuid.uuid4(),
        work_type=work_type,
        sub_type=sub_type,
        status=status,
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department=requester.department.value,
        from_department=from_department,
        to_department=to_department,
        requires_approval=False,
    )
    db_session.add(batch)
    db_session.flush()
    bundle = IoBundle(
        bundle_id=uuid.uuid4(),
        batch_id=batch.batch_id,
        source_kind=source_kind,
        source_item_id=source_item_id,
        title_snapshot="테스트 묶음",
        quantity=D("1"),
        expanded_level=1,
    )
    db_session.add(bundle)
    db_session.flush()
    for spec in lines:
        db_session.add(
            IoLine(
                line_id=uuid.uuid4(),
                bundle_id=bundle.bundle_id,
                item_id=spec["item_id"],
                item_name_snapshot=spec.get("item_name", "품목"),
                mes_code_snapshot=None,
                unit="EA",
                direction=spec["direction"],
                from_bucket=spec.get("from_bucket", "none"),
                from_department=spec.get("from_department"),
                to_bucket=spec.get("to_bucket", "none"),
                to_department=spec.get("to_department"),
                quantity=spec["quantity"],
                bom_expected=None,
                included=spec.get("included", True),
                origin=spec.get("origin", "direct"),
                edited=False,
                has_children_snapshot=False,
                shortage=0,
            )
        )
    db_session.flush()
    db_session.refresh(batch)
    return batch


def _prod_qty(db_session, item_id, dept=ASSEMBLY) -> Decimal:
    loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == dept,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .first()
    )
    return loc.quantity if loc else D("0")


def _issue_bom_auto_token(db_session, batch: IoBatch, line: IoLine) -> None:
    """미리보기에서 받은 자동 BOM 행을 서비스 단위 테스트에 재현한다."""
    bundle = line.bundle
    line.bom_auto_token = issue_bom_auto_token(
        db_session,
        flow="io",
        claims=io_bom_auto_claims(
            bundle_id=bundle.bundle_id,
            line_id=line.line_id,
            source_kind=bundle.source_kind,
            source_item_id=bundle.source_item_id,
            item_id=line.item_id,
            work_type=batch.work_type,
            sub_type=batch.sub_type,
            direction=line.direction,
            from_bucket=line.from_bucket,
            from_department=line.from_department,
            to_bucket=line.to_bucket,
            to_department=line.to_department,
        ),
    )
    db_session.flush()


def _loc_pending(
    db_session, item_id, dept=ASSEMBLY, status=LocationStatusEnum.PRODUCTION
) -> Decimal:
    loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == dept,
            InventoryLocation.status == status,
        )
        .first()
    )
    return loc.pending_quantity if loc else D("0")


def _defective_qty(db_session, item_id, dept=ASSEMBLY) -> Decimal:
    loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == dept,
            InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
        )
        .first()
    )
    return loc.quantity if loc else D("0")


def _warehouse_qty(db_session, item_id) -> Decimal:
    inv = db_session.query(Inventory).filter(Inventory.item_id == item_id).first()
    return inv.warehouse_qty if inv else D("0")


def _single_line(batch: IoBatch) -> IoLine:
    return batch.bundles[0].lines[0]


# ──────────────────────────── _apply_line: 방향별 ────────────────────────────


def test_apply_line_in_receive_warehouse(make_item, db_session):
    """in / to_bucket=warehouse → RECEIVE, 창고 +qty."""
    item = make_item(name="원자재", warehouse_qty=D("0"))
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="receive_supplier",
        work_type="receive",
        lines=[{"item_id": item.item_id, "direction": "in",
                "from_bucket": "none", "to_bucket": "warehouse", "quantity": D("5")}],
    )
    svc._apply_line(db_session, batch=batch, line=_single_line(batch), requester=requester)
    db_session.flush()  # _log_immediate 는 flush 하지 않음(autoflush=False) — 명시 flush 후 조회.

    assert _warehouse_qty(db_session, item.item_id) == D("5")
    log = db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).one()
    assert log.transaction_type == TransactionTypeEnum.RECEIVE
    assert log.quantity_change == D("5")
    assert log.quantity_before == D("0")
    assert log.quantity_after == D("5")
    assert log.operation_batch_id == batch.batch_id


def test_apply_line_in_produce_to_production(make_item, make_location, db_session):
    """in / to_bucket=production → PRODUCE, 부서 PRODUCTION +qty."""
    item = make_item(name="결과품", process_type_code="AF")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("0"))
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="produce",
        lines=[{"item_id": item.item_id, "direction": "in",
                "from_bucket": "none", "to_bucket": "production",
                "to_department": ASSEMBLY.value, "quantity": D("3")}],
    )
    svc._apply_line(db_session, batch=batch, line=_single_line(batch), requester=requester)
    db_session.flush()

    assert _prod_qty(db_session, item.item_id) == D("3")
    log = db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).one()
    assert log.transaction_type == TransactionTypeEnum.PRODUCE
    assert log.quantity_change == D("3")


def test_apply_line_out_warehouse_ship(make_item, db_session):
    """out / from_bucket=warehouse → SHIP, 창고 -qty."""
    item = make_item(name="출하품", warehouse_qty=D("10"))
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="ship",
        lines=[{"item_id": item.item_id, "direction": "out",
                "from_bucket": "warehouse", "to_bucket": "none", "quantity": D("4")}],
    )
    svc._apply_line(db_session, batch=batch, line=_single_line(batch), requester=requester)
    db_session.flush()

    assert _warehouse_qty(db_session, item.item_id) == D("6")
    log = db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).one()
    assert log.transaction_type == TransactionTypeEnum.SHIP
    assert log.quantity_change == D("-4")


def test_apply_line_out_production_backflush(make_item, make_location, db_session):
    """out / from_bucket=production → BACKFLUSH, 부서 PRODUCTION -qty."""
    item = make_item(name="부품")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("8"))
    db_session.flush()
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = D("8")
    db_session.flush()
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="consume",
        lines=[{"item_id": item.item_id, "direction": "out",
                "from_bucket": "production", "from_department": ASSEMBLY.value,
                "to_bucket": "none", "quantity": D("3")}],
    )
    svc._apply_line(db_session, batch=batch, line=_single_line(batch), requester=requester)
    db_session.flush()

    assert _prod_qty(db_session, item.item_id) == D("5")
    log = db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).one()
    assert log.transaction_type == TransactionTypeEnum.BACKFLUSH
    assert log.quantity_change == D("-3")


def test_apply_line_out_defective_supplier_return(make_item, make_location, db_session):
    """out / from_bucket=defective → SUPPLIER_RETURN, 부서 DEFECTIVE -qty."""
    item = make_item(name="불량반품")
    loc = make_location(item.item_id, department=ASSEMBLY, quantity=D("5"))
    loc.status = LocationStatusEnum.DEFECTIVE
    db_session.flush()
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = D("5")
    db_session.flush()
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="defect_return",
        lines=[{"item_id": item.item_id, "direction": "out",
                "from_bucket": "defective", "from_department": ASSEMBLY,
                "to_bucket": "none", "quantity": D("2")}],
    )
    svc._apply_line(db_session, batch=batch, line=_single_line(batch), requester=requester)
    db_session.flush()

    assert _defective_qty(db_session, item.item_id) == D("3")
    log = db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).one()
    assert log.transaction_type == TransactionTypeEnum.SUPPLIER_RETURN
    assert log.quantity_change == D("-2")


def test_apply_line_move_warehouse_to_production(make_item, make_location, db_session):
    """move / from_bucket=warehouse → TRANSFER_TO_PROD, 총량 불변·창고→부서 이동."""
    item = make_item(name="이동품", warehouse_qty=D("10"))
    make_location(item.item_id, department=ASSEMBLY, quantity=D("0"))
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="warehouse_to_dept",
        lines=[{"item_id": item.item_id, "direction": "move",
                "from_bucket": "warehouse", "to_bucket": "production",
                "to_department": ASSEMBLY, "quantity": D("4")}],
    )
    svc._apply_line(db_session, batch=batch, line=_single_line(batch), requester=requester)
    db_session.flush()

    assert _warehouse_qty(db_session, item.item_id) == D("6")
    assert _prod_qty(db_session, item.item_id) == D("4")
    log = db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).one()
    assert log.transaction_type == TransactionTypeEnum.TRANSFER_TO_PROD
    # move 방향은 quantity_change 0 (위치만 이동, 총량 불변)
    assert log.quantity_change == D("0")
    assert log.transfer_qty == D("4")
    assert log.warehouse_qty_before == D("10")
    assert log.warehouse_qty_after == D("6")
    assert log.department_qty_before == D("0")
    assert log.department_qty_after == D("4")


def test_apply_line_move_production_to_warehouse(make_item, make_location, db_session):
    """move / from_bucket=production, to_bucket=warehouse → TRANSFER_TO_WH."""
    item = make_item(name="복귀품", warehouse_qty=D("0"))
    make_location(item.item_id, department=ASSEMBLY, quantity=D("7"))
    db_session.flush()
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = D("7")
    db_session.flush()
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="dept_to_warehouse",
        lines=[{"item_id": item.item_id, "direction": "move",
                "from_bucket": "production", "from_department": ASSEMBLY,
                "to_bucket": "warehouse", "quantity": D("3")}],
    )
    svc._apply_line(db_session, batch=batch, line=_single_line(batch), requester=requester)
    db_session.flush()

    assert _prod_qty(db_session, item.item_id) == D("4")
    assert _warehouse_qty(db_session, item.item_id) == D("3")
    log = db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).one()
    assert log.transaction_type == TransactionTypeEnum.TRANSFER_TO_WH


def test_apply_line_move_between_departments(make_item, make_location, db_session):
    """move / production→production (부서간) → TRANSFER_DEPT."""
    item = make_item(name="부서이동품")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("6"))
    make_location(item.item_id, department=TUNING, quantity=D("0"))
    db_session.flush()
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = D("6")
    db_session.flush()
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="transfer_dept",
        lines=[{"item_id": item.item_id, "direction": "move",
                "from_bucket": "production", "from_department": ASSEMBLY,
                "to_bucket": "production", "to_department": TUNING, "quantity": D("2")}],
    )
    svc._apply_line(db_session, batch=batch, line=_single_line(batch), requester=requester)
    db_session.flush()

    assert _prod_qty(db_session, item.item_id, dept=ASSEMBLY) == D("4")
    assert _prod_qty(db_session, item.item_id, dept=TUNING) == D("2")
    log = db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).one()
    assert log.transaction_type == TransactionTypeEnum.TRANSFER_DEPT
    assert log.warehouse_qty_before == D("0")
    assert log.warehouse_qty_after == D("0")
    assert log.department_qty_before == D("6")
    assert log.department_qty_after == D("6")


def test_apply_line_defective_mark(make_item, make_location, db_session):
    """defective / production 출처 → MARK_DEFECTIVE, PRODUCTION→DEFECTIVE 이동."""
    item = make_item(name="불량처리")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("5"))
    db_session.flush()
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = D("5")
    db_session.flush()
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="defect_quarantine",
        lines=[{"item_id": item.item_id, "direction": "defective",
                "from_bucket": "production", "from_department": ASSEMBLY,
                "to_bucket": "defective", "to_department": ASSEMBLY, "quantity": D("2")}],
    )
    svc._apply_line(db_session, batch=batch, line=_single_line(batch), requester=requester)
    db_session.flush()

    assert _prod_qty(db_session, item.item_id) == D("3")
    assert _defective_qty(db_session, item.item_id) == D("2")
    log = db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).one()
    assert log.transaction_type == TransactionTypeEnum.MARK_DEFECTIVE
    assert log.warehouse_qty_before == D("0")
    assert log.warehouse_qty_after == D("0")
    assert log.department_qty_before == D("5")
    assert log.department_qty_after == D("3")
    record = (
        db_session.query(DefectQuarantineRecord)
        .filter(DefectQuarantineRecord.item_id == item.item_id)
        .one()
    )
    assert record.remaining_quantity == D("2")
    assert log.defect_quarantine_record_id == record.record_id


def test_apply_line_adjust_in_and_out(make_item, make_location, db_session):
    """adjust in (none→production) +qty, adjust out (production→none) -qty 모두 ADJUST 로그."""
    item = make_item(name="보정품")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("0"))
    requester = _make_employee(db_session)

    batch_in = _build_batch(
        db_session,
        requester=requester,
        sub_type="adjust_in",
        lines=[{"item_id": item.item_id, "direction": "adjust",
                "from_bucket": "none", "to_bucket": "production",
                "to_department": ASSEMBLY, "quantity": D("4"), "origin": "adjust_in"}],
    )
    svc._apply_line(db_session, batch=batch_in, line=_single_line(batch_in), requester=requester)
    assert _prod_qty(db_session, item.item_id) == D("4")

    batch_out = _build_batch(
        db_session,
        requester=requester,
        sub_type="adjust_out",
        lines=[{"item_id": item.item_id, "direction": "adjust",
                "from_bucket": "production", "from_department": ASSEMBLY,
                "to_bucket": "none", "quantity": D("1"), "origin": "adjust_out"}],
    )
    svc._apply_line(db_session, batch=batch_out, line=_single_line(batch_out), requester=requester)
    db_session.flush()
    assert _prod_qty(db_session, item.item_id) == D("3")

    logs = db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).all()
    assert len(logs) == 2
    assert all(l.transaction_type == TransactionTypeEnum.ADJUST for l in logs)
    changes = sorted(l.quantity_change for l in logs)
    assert changes == [D("-1"), D("4")]


# ──────────────────────────── _submit_immediate ────────────────────────────


def test_submit_immediate_completes_and_orders_out_first(make_item, make_location, db_session):
    """즉시 반영: out(차감) 먼저 → in(적재), batch=completed, 로그 2건."""
    comp = make_item(name="구성품")
    result = make_item(name="완제품", process_type_code="AF")
    make_location(comp.item_id, department=ASSEMBLY, quantity=D("10"))
    make_location(result.item_id, department=ASSEMBLY, quantity=D("0"))
    db_session.flush()
    inv = db_session.query(Inventory).filter(Inventory.item_id == comp.item_id).first()
    inv.quantity = D("10")
    db_session.flush()
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="produce",
        lines=[
            {"item_id": result.item_id, "direction": "in", "from_bucket": "none",
             "to_bucket": "production", "to_department": ASSEMBLY, "quantity": D("1")},
            {"item_id": comp.item_id, "direction": "out", "from_bucket": "production",
             "from_department": ASSEMBLY, "to_bucket": "none", "quantity": D("2")},
        ],
    )
    svc._submit_immediate(db_session, requester=requester, batch=batch)

    assert batch.status == "completed"
    assert batch.completed_at is not None
    assert _prod_qty(db_session, comp.item_id) == D("8")
    assert _prod_qty(db_session, result.item_id) == D("1")
    assert db_session.query(TransactionLog).count() == 2


def test_submit_immediate_records_one_operation_for_all_batch_lines(
    make_item, make_location, db_session
):
    component = make_item(name="원장 배치 구성품")
    result = make_item(name="원장 배치 결과품", process_type_code="AF")
    make_location(component.item_id, department=ASSEMBLY, quantity=D("2"))
    requester = _make_employee(db_session, code="LEDGER-IO")
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="produce",
        lines=[
            {
                "item_id": result.item_id,
                "direction": "in",
                "from_bucket": "none",
                "to_bucket": "production",
                "to_department": ASSEMBLY,
                "quantity": D("1"),
            },
            {
                "item_id": component.item_id,
                "direction": "out",
                "from_bucket": "production",
                "from_department": ASSEMBLY,
                "to_bucket": "none",
                "quantity": D("2"),
            },
        ],
    )
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.commit()

    svc._submit_immediate(db_session, requester=requester, batch=batch)

    operation = db_session.query(InventoryOperation).one()
    logs = db_session.query(TransactionLog).order_by(TransactionLog.created_at).all()
    assert {log.operation_id for log in logs} == {operation.operation_id}
    assert [log.operation_role for log in logs] == [
        InventoryOperationRoleEnum.COMPONENT_INPUT,
        InventoryOperationRoleEnum.PRODUCT_OUTPUT,
    ]
    effect = db_session.query(InventoryOperationEffect).one()
    assert effect.subject_type == "IoBatch"
    assert effect.after_state == {"status": "completed"}


def test_submit_immediate_prelocks_sorted_unique_inventories_before_mutation(
    make_item, db_session, monkeypatch
):
    first = make_item(name="immediate-lock-first", warehouse_qty=D("0"))
    second = make_item(name="immediate-lock-second", warehouse_qty=D("0"))
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="receive_supplier",
        work_type="receive",
        lines=[
            {"item_id": second.item_id, "direction": "in", "from_bucket": "none",
             "to_bucket": "warehouse", "quantity": D("1")},
            {"item_id": first.item_id, "direction": "in", "from_bucket": "none",
             "to_bucket": "warehouse", "quantity": D("1")},
        ],
    )
    events = []

    def lock_inventories(_db, item_ids):
        events.append(("lock", item_ids))
        return {item_id: object() for item_id in item_ids}

    def apply_line(*_args, **kwargs):
        events.append(("apply", kwargs["line"].item_id))

    monkeypatch.setattr(svc.inventory_svc, "lock_inventories", lock_inventories)
    monkeypatch.setattr(svc, "_apply_line", apply_line)

    svc._submit_immediate(db_session, requester=requester, batch=batch)

    assert events[0] == ("lock", sorted({first.item_id, second.item_id}))


def test_submit_immediate_skips_excluded_lines(make_item, db_session):
    """included=False 라인은 반영되지 않는다."""
    keep = make_item(name="포함", warehouse_qty=D("0"))
    drop = make_item(name="제외", warehouse_qty=D("0"))
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="receive_supplier",
        work_type="receive",
        lines=[
            {"item_id": keep.item_id, "direction": "in", "from_bucket": "none",
             "to_bucket": "warehouse", "quantity": D("3"), "included": True},
            {"item_id": drop.item_id, "direction": "in", "from_bucket": "none",
             "to_bucket": "warehouse", "quantity": D("9"), "included": False},
        ],
    )
    svc._submit_immediate(db_session, requester=requester, batch=batch)

    assert _warehouse_qty(db_session, keep.item_id) == D("3")
    assert _warehouse_qty(db_session, drop.item_id) == D("0")
    assert db_session.query(TransactionLog).count() == 1


def test_submit_immediate_zero_qty_raises(make_item, db_session):
    """체크된 라인 수량 <= 0 → ValueError (재고 불변)."""
    item = make_item(name="제로", warehouse_qty=D("0"))
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="receive_supplier",
        work_type="receive",
        lines=[{"item_id": item.item_id, "direction": "in", "from_bucket": "none",
                "to_bucket": "warehouse", "quantity": D("0")}],
    )
    with pytest.raises(ValueError, match="0보다 커야"):
        svc._submit_immediate(db_session, requester=requester, batch=batch)
    assert _warehouse_qty(db_session, item.item_id) == D("0")
    assert db_session.query(TransactionLog).count() == 0


def test_submit_immediate_shortage_raises_and_no_change(make_item, db_session):
    """창고 가용 부족 → ValueError(재고 부족), 재고/로그 불변."""
    item = make_item(name="부족", warehouse_qty=D("2"))
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="warehouse_to_dept",
        work_type="warehouse_io",
        lines=[{"item_id": item.item_id, "direction": "move",
                "from_bucket": "warehouse", "to_bucket": "production",
                "to_department": ASSEMBLY, "quantity": D("5")}],
    )
    with pytest.raises(ValueError, match="재고 부족"):
        svc._submit_immediate(db_session, requester=requester, batch=batch)
    assert _warehouse_qty(db_session, item.item_id) == D("2")
    assert db_session.query(TransactionLog).count() == 0


@pytest.mark.parametrize(
    ("bucket", "status"),
    [
        ("production", LocationStatusEnum.PRODUCTION),
        ("defective", LocationStatusEnum.DEFECTIVE),
    ],
)
def test_validate_location_source_uses_quantity_minus_pending(
    make_item, make_location, db_session, bucket, status
):
    item = make_item(name=f"{bucket}-validation-pending")
    location = make_location(
        item.item_id,
        department=ASSEMBLY,
        status=status,
        quantity=D("10"),
    )
    location.pending_quantity = D("3")
    requester = _make_employee(db_session, code=f"VAL-{bucket}")
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="dept_to_warehouse",
        work_type="warehouse_io",
        from_department=ASSEMBLY.value,
        lines=[
            {
                "item_id": item.item_id,
                "direction": "move",
                "from_bucket": bucket,
                "from_department": ASSEMBLY.value,
                "to_bucket": "warehouse",
                "quantity": D("8"),
            }
        ],
    )
    line = _single_line(batch)

    with pytest.raises(ValueError, match="가능 7 / 요청 8"):
        svc._validate_included_lines(db_session, [line])

    line.quantity = D("7")
    svc._validate_included_lines(db_session, [line])


def test_submit_immediate_empty_included_raises(make_item, db_session):
    """체크된 라인이 하나도 없으면 ValueError."""
    item = make_item(name="전부제외", warehouse_qty=D("0"))
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="receive_supplier",
        work_type="receive",
        lines=[{"item_id": item.item_id, "direction": "in", "from_bucket": "none",
                "to_bucket": "warehouse", "quantity": D("3"), "included": False}],
    )
    with pytest.raises(ValueError, match="반영할 품목이 없습니다"):
        svc._submit_immediate(db_session, requester=requester, batch=batch)


# ──────────────────────────── _submit_approval (승인 경로) ────────────────────────────


def test_submit_approval_creates_request_without_immediate_apply(
    make_item, db_session
):
    """warehouse_to_dept: StockRequest 생성, 점유(reserve)만 — 부서 PRODUCTION 미반영."""
    item = make_item(name="승인대상", warehouse_qty=D("10"))
    requester = _make_employee(db_session, warehouse_role="none")
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="warehouse_to_dept",
        work_type="warehouse_io",
        to_department=ASSEMBLY.value,
        lines=[{"item_id": item.item_id, "direction": "move",
                "from_bucket": "warehouse", "to_bucket": "production",
                "to_department": ASSEMBLY.value, "quantity": D("4")}],
    )
    svc._submit_approval(db_session, requester=requester, batch=batch)

    assert db_session.query(StockRequest).count() == 1
    request = db_session.query(StockRequest).one()
    assert batch.stock_request_id == request.request_id
    assert request.operation_batch_id == batch.batch_id
    # 승인 대기 — 즉시 실재고 미반영. 창고 총량 그대로, 점유만 발생.
    assert _prod_qty(db_session, item.item_id, dept=ASSEMBLY) == D("0")
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv.warehouse_qty == D("10")
    assert inv.pending_quantity == D("4")
    assert batch.status in {"submitted", "reserved"}
    assert batch.requires_approval is True
    # 결재 대기 단계에서는 즉시 TransactionLog 가 남지 않는다.
    assert db_session.query(TransactionLog).count() == 0


def test_execute_submission_routes_approval_subtype(make_item, db_session):
    """_execute_submission: APPROVAL_SUB_TYPES 는 승인 경로로 분기."""
    item = make_item(name="라우팅", warehouse_qty=D("6"))
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="warehouse_to_dept",
        work_type="warehouse_io",
        to_department=ASSEMBLY.value,
        lines=[{"item_id": item.item_id, "direction": "move",
                "from_bucket": "warehouse", "to_bucket": "production",
                "to_department": ASSEMBLY.value, "quantity": D("2")}],
    )
    result = svc._execute_submission(db_session, requester=requester, batch=batch)

    assert result["requires_approval"] is True
    assert result["stock_request_id"] is not None
    assert db_session.query(StockRequest).count() == 1


# ──────────────────────────── _submit_dept_only_approval (부서 결재) ────────────────────────────


def test_submit_dept_only_self_approval_executes_immediately(
    make_item, make_location, db_session
):
    """요청자가 부서 정(primary) → 자가승인 즉시 실행 + completed."""
    item = make_item(name="자가승인")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("0"))
    requester = _make_employee(db_session, department_role="primary")
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="adjust_in",
        lines=[{"item_id": item.item_id, "direction": "adjust",
                "from_bucket": "none", "to_bucket": "production",
                "to_department": ASSEMBLY, "quantity": D("4"), "origin": "adjust_in"}],
    )
    svc._submit_dept_only_approval(db_session, requester=requester, batch=batch)

    request = db_session.query(StockRequest).one()
    assert request.department_approved_by_employee_id == requester.employee_id
    assert request.status == StockRequestStatusEnum.COMPLETED
    assert batch.status == "completed"
    assert _prod_qty(db_session, item.item_id) == D("4")
    log = db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).one()
    assert log.transaction_type == TransactionTypeEnum.ADJUST


def test_submit_dept_only_warehouse_primary_self_approval_executes_immediately(
    make_item, make_location, db_session
):
    item = make_item(name="창고 담당 부서 자가승인")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("5"))
    requester = _make_employee(
        db_session,
        code="DEPT-WH-SELF",
        warehouse_role="primary",
    )
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="adjust_out",
        lines=[
            {
                "item_id": item.item_id,
                "direction": "adjust",
                "from_bucket": "production",
                "from_department": ASSEMBLY,
                "to_bucket": "none",
                "quantity": D("2"),
                "origin": "adjust_out",
            }
        ],
    )

    svc._submit_dept_only_approval(db_session, requester=requester, batch=batch)

    request = db_session.query(StockRequest).one()
    assert request.status == StockRequestStatusEnum.COMPLETED
    assert request.department_approved_by_employee_id == requester.employee_id
    assert _loc_pending(db_session, item.item_id) == D("0")
    assert _prod_qty(db_session, item.item_id) == D("3")


def test_submit_dept_only_admin_without_role_waits_for_approval(
    make_item, make_location, db_session
):
    item = make_item(name="admin 부서 결재 대기")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("5"))
    requester = _make_employee(
        db_session,
        code="DEPT-ADMIN-WAIT",
        level=EmployeeLevelEnum.ADMIN,
    )
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="adjust_out",
        lines=[
            {
                "item_id": item.item_id,
                "direction": "adjust",
                "from_bucket": "production",
                "from_department": ASSEMBLY,
                "to_bucket": "none",
                "quantity": D("2"),
                "origin": "adjust_out",
            }
        ],
    )

    svc._submit_dept_only_approval(db_session, requester=requester, batch=batch)

    request = db_session.query(StockRequest).one()
    assert request.status == StockRequestStatusEnum.RESERVED
    assert request.department_approved_by_employee_id is None
    assert _loc_pending(db_session, item.item_id) == D("2")
    assert _prod_qty(db_session, item.item_id) == D("5")


def test_submit_dept_only_self_approval_prelocks_sorted_inventories(
    make_item, make_location, db_session, monkeypatch
):
    first = make_item(name="self-lock-first")
    second = make_item(name="self-lock-second")
    make_location(first.item_id, department=ASSEMBLY, quantity=D("0"))
    make_location(second.item_id, department=ASSEMBLY, quantity=D("0"))
    requester = _make_employee(
        db_session,
        code="SELF-LOCK",
        department_role="primary",
    )
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="adjust_in",
        lines=[
            {"item_id": second.item_id, "direction": "adjust",
             "from_bucket": "none", "to_bucket": "production",
             "to_department": ASSEMBLY, "quantity": D("1"), "origin": "adjust_in"},
            {"item_id": first.item_id, "direction": "adjust",
             "from_bucket": "none", "to_bucket": "production",
             "to_department": ASSEMBLY, "quantity": D("1"), "origin": "adjust_in"},
        ],
    )
    events = []
    real_lock = svc.inventory_svc.lock_inventories

    def lock_inventories(db, item_ids):
        events.append(("lock", item_ids))
        return real_lock(db, item_ids)

    real_apply = svc._apply_line

    def apply_line(*args, **kwargs):
        events.append(("apply", kwargs["line"].item_id))
        return real_apply(*args, **kwargs)

    monkeypatch.setattr(svc.inventory_svc, "lock_inventories", lock_inventories)
    monkeypatch.setattr(svc, "_apply_line", apply_line)

    svc._submit_dept_only_approval(db_session, requester=requester, batch=batch)

    assert events[0] == ("lock", sorted({first.item_id, second.item_id}))


def test_submit_dept_out_self_approval_skips_reservation(
    make_item, make_location, db_session
):
    item = make_item(name="self-approved-out")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("5"))
    requester = _make_employee(db_session, department_role="primary")
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="adjust_out",
        lines=[
            {
                "item_id": item.item_id,
                "direction": "adjust",
                "from_bucket": "production",
                "from_department": ASSEMBLY,
                "to_bucket": "none",
                "quantity": D("2"),
                "origin": "adjust_out",
            }
        ],
    )

    svc._submit_dept_only_approval(db_session, requester=requester, batch=batch)

    request = db_session.query(StockRequest).one()
    assert request.status == StockRequestStatusEnum.COMPLETED
    assert _loc_pending(db_session, item.item_id) == D("0")
    assert _prod_qty(db_session, item.item_id) == D("3")


def test_submit_dept_only_without_authority_waits(make_item, make_location, db_session):
    """일반 직원 → 부서 결재 대기. 실재고 미반영, batch 미완료, 로그 없음."""
    item = make_item(name="결재대기")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("0"))
    requester = _make_employee(db_session, department_role="none")
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="adjust_in",
        lines=[{"item_id": item.item_id, "direction": "adjust",
                "from_bucket": "none", "to_bucket": "production",
                "to_department": ASSEMBLY, "quantity": D("4"), "origin": "adjust_in"}],
    )
    svc._submit_dept_only_approval(db_session, requester=requester, batch=batch)

    request = db_session.query(StockRequest).one()
    assert request.department_approved_by_employee_id is None
    assert request.status == StockRequestStatusEnum.SUBMITTED
    assert batch.status != "completed"
    assert _prod_qty(db_session, item.item_id) == D("0")
    assert db_session.query(TransactionLog).count() == 0


def test_submit_dept_only_outgoing_reserves_department_location(
    make_item, make_location, db_session
):
    item = make_item(name="department-reservation")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("6"))
    requester = _make_employee(db_session, department_role="none")
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="adjust_out",
        lines=[
            {
                "item_id": item.item_id,
                "direction": "adjust",
                "from_bucket": "production",
                "from_department": ASSEMBLY,
                "to_bucket": "none",
                "quantity": D("4"),
                "origin": "adjust_out",
            }
        ],
    )

    svc._submit_dept_only_approval(db_session, requester=requester, batch=batch)

    request = db_session.query(StockRequest).one()
    assert request.status == StockRequestStatusEnum.RESERVED
    assert {line.status for line in request.lines} == {StockRequestStatusEnum.RESERVED}
    assert _loc_pending(db_session, item.item_id) == D("4")
    assert _prod_qty(db_session, item.item_id) == D("6")


def test_submit_dept_out_then_approve_releases_and_consumes(
    make_item, make_location, db_session
):
    from app.services import sr_approval

    item = make_item(name="department-approved-adjustment")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("6"))
    requester = _make_employee(db_session, department_role="none")
    approver = _make_employee(
        db_session,
        code="DISP-DEPT-APP",
        department_role="primary",
    )
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="adjust_out",
        lines=[
            {
                "item_id": item.item_id,
                "direction": "adjust",
                "from_bucket": "production",
                "from_department": ASSEMBLY,
                "to_bucket": "none",
                "quantity": D("4"),
                "origin": "adjust_out",
            }
        ],
    )
    svc._submit_dept_only_approval(db_session, requester=requester, batch=batch)
    request = db_session.query(StockRequest).one()

    sr_approval.approve_request_department(
        db_session,
        request,
        approver=approver,
        pin="0000",
    )
    db_session.flush()

    assert request.status == StockRequestStatusEnum.COMPLETED
    assert batch.status == "completed"
    assert _loc_pending(db_session, item.item_id) == D("0")
    assert _prod_qty(db_session, item.item_id) == D("2")


# ──────────────────── execute_batch_after_dept_approval ────────────────────


def test_mixed_process_manual_waits_for_department_approval_then_applies_all_lines(
    make_bom, make_item, make_location, db_session
):
    component = make_item(name="Mixed Component")
    result_item = make_item(name="Mixed Result", process_type_code="AF")
    manual_item = make_item(name="Mixed Manual")
    make_bom(result_item.item_id, component.item_id, D("2"))
    make_location(component.item_id, department=ASSEMBLY, quantity=D("10"))
    make_location(result_item.item_id, department=ASSEMBLY, quantity=D("0"))
    make_location(manual_item.item_id, department=ASSEMBLY, quantity=D("0"))
    requester = _make_employee(db_session, department_role="none")
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="produce",
        to_department=ASSEMBLY.value,
        source_item_id=result_item.item_id,
        lines=[
            {
                "item_id": component.item_id,
                "direction": "out",
                "from_bucket": "production",
                "from_department": ASSEMBLY.value,
                "to_bucket": "none",
                "quantity": D("2"),
                "origin": "bom_auto",
            },
            {
                "item_id": result_item.item_id,
                "direction": "in",
                "from_bucket": "none",
                "to_bucket": "production",
                "to_department": ASSEMBLY.value,
                "quantity": D("1"),
                "origin": "direct",
            },
        ],
    )
    manual_bundle = IoBundle(
        bundle_id=uuid.uuid4(),
        batch_id=batch.batch_id,
        source_kind="manual",
        source_item_id=manual_item.item_id,
        title_snapshot="수동 낱개",
        quantity=D("3"),
        expanded_level=1,
    )
    db_session.add(manual_bundle)
    db_session.flush()
    db_session.add(
        IoLine(
            line_id=uuid.uuid4(),
            bundle_id=manual_bundle.bundle_id,
            item_id=manual_item.item_id,
            item_name_snapshot=manual_item.item_name,
            mes_code_snapshot=manual_item.mes_code,
            unit="EA",
            direction="adjust",
            from_bucket="none",
            from_department=None,
            to_bucket="production",
            to_department=ASSEMBLY.value,
            quantity=D("3"),
            included=True,
            origin="manual",
            edited=False,
            has_children_snapshot=False,
            shortage=D("0"),
        )
    )
    db_session.flush()
    db_session.refresh(batch)
    _issue_bom_auto_token(
        db_session,
        batch,
        next(line for line in batch.bundles[0].lines if line.origin == "bom_auto"),
    )
    batch.notes = "생산 중 낱개 재고 보정"
    result = svc._execute_submission(db_session, requester=requester, batch=batch)

    request = db_session.query(StockRequest).one()
    assert result["stock_request_id"] == request.request_id
    assert request.requires_department_approval is True
    assert request.requires_warehouse_approval is False
    assert request.status == StockRequestStatusEnum.RESERVED
    assert len(request.lines) == 3
    assert batch.status != "completed"
    assert _prod_qty(db_session, component.item_id) == D("10")
    assert _loc_pending(db_session, component.item_id) == D("2")
    assert _loc_pending(db_session, result_item.item_id) == D("0")
    assert _loc_pending(db_session, manual_item.item_id) == D("0")
    assert _prod_qty(db_session, result_item.item_id) == D("0")
    assert _prod_qty(db_session, manual_item.item_id) == D("0")
    assert db_session.query(TransactionLog).count() == 0

    approver = _make_employee(
        db_session,
        code="DISP02",
        name="Approver",
        department_role="primary",
    )
    request.department_approved_by_employee_id = approver.employee_id
    request.department_approved_by_name = approver.name

    svc.execute_batch_after_dept_approval(db_session, request=request, approver=approver)

    assert batch.status == "completed"
    assert _prod_qty(db_session, component.item_id) == D("8")
    assert _prod_qty(db_session, result_item.item_id) == D("1")
    assert _prod_qty(db_session, manual_item.item_id) == D("3")
    assert db_session.query(TransactionLog).count() == 3


def test_custom_bom_child_quantity_requires_department_approval_even_when_edited_is_false(
    make_bom, make_item, make_location, db_session
):
    """저장된 BOM 기준과 다른 자동 자식은 client edited 값과 무관하게 결재를 거친다."""
    component = make_item(name="커스텀 BOM 자재")
    result_item = make_item(name="커스텀 BOM 결과품", process_type_code="AF")
    make_bom(result_item.item_id, component.item_id, D("2"))
    make_location(component.item_id, department=ASSEMBLY, quantity=D("10"))
    make_location(result_item.item_id, department=ASSEMBLY, quantity=D("0"))
    requester = _make_employee(db_session, department_role="none")
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="produce",
        to_department=ASSEMBLY.value,
        source_item_id=result_item.item_id,
        lines=[
            {
                "item_id": result_item.item_id,
                "direction": "in",
                "from_bucket": "none",
                "to_bucket": "production",
                "to_department": ASSEMBLY.value,
                "quantity": D("1"),
                "origin": "direct",
            },
            {
                "item_id": component.item_id,
                "direction": "out",
                "from_bucket": "production",
                "from_department": ASSEMBLY.value,
                "to_bucket": "none",
                "quantity": D("3"),
                "origin": "bom_auto",
            },
        ],
    )
    child = next(line for line in batch.bundles[0].lines if line.item_id == component.item_id)
    child.edited = False
    batch.notes = "커스텀 BOM 수량 변경"
    _issue_bom_auto_token(db_session, batch, child)

    result = svc._execute_submission(db_session, requester=requester, batch=batch)

    request = db_session.query(StockRequest).one()
    assert result["requires_approval"] is True
    assert request.requires_department_approval is True
    assert batch.status in {"submitted", "reserved"}
    assert _prod_qty(db_session, component.item_id) == D("10")
    assert _prod_qty(db_session, result_item.item_id) == D("0")
    assert db_session.query(TransactionLog).count() == 0

    assert len(request.lines) == 1
    assert request.lines[0].item_id == component.item_id
    parent = next(line for line in batch.bundles[0].lines if line.item_id == result_item.item_id)
    assert parent.included is False
    approver = _make_employee(
        db_session,
        code="CUSTOM-BOM-APPROVER",
        name="커스텀 BOM 결재자",
        department_role="primary",
    )
    request.department_approved_by_employee_id = approver.employee_id
    request.department_approved_by_name = approver.name

    svc.execute_batch_after_dept_approval(
        db_session,
        request=request,
        approver=approver,
    )

    assert _prod_qty(db_session, component.item_id) == D("7")
    assert _prod_qty(db_session, result_item.item_id) == D("0")
    logs = db_session.query(TransactionLog).all()
    assert len(logs) == 1
    assert logs[0].item_id == component.item_id


def test_custom_process_bom_blank_memo_is_rejected_before_parent_is_mutated(
    make_bom, make_item, make_location, db_session
):
    """서버 DB BOM과 다른 하위 수량은 결재 생성·상위 제외 전에 메모를 요구한다."""
    component = make_item(name="메모 없는 커스텀 자재")
    result_item = make_item(name="메모 없는 커스텀 결과품", process_type_code="AF")
    make_bom(result_item.item_id, component.item_id, D("2"))
    make_location(component.item_id, department=ASSEMBLY, quantity=D("10"))
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="produce",
        to_department=ASSEMBLY.value,
        source_item_id=result_item.item_id,
        lines=[
            {
                "item_id": result_item.item_id,
                "direction": "in",
                "from_bucket": "none",
                "to_bucket": "production",
                "to_department": ASSEMBLY.value,
                "quantity": D("1"),
                "origin": "direct",
            },
            {
                "item_id": component.item_id,
                "direction": "out",
                "from_bucket": "production",
                "from_department": ASSEMBLY.value,
                "to_bucket": "none",
                "quantity": D("1"),
                "origin": "bom_auto",
            },
        ],
    )
    batch.notes = " \t "
    child = next(line for line in batch.bundles[0].lines if line.item_id == component.item_id)
    _issue_bom_auto_token(db_session, batch, child)

    with pytest.raises(ValueError, match="메모"):
        svc._execute_submission(db_session, requester=requester, batch=batch)

    parent = next(line for line in batch.bundles[0].lines if line.item_id == result_item.item_id)
    assert parent.included is True
    assert batch.status == "submitted"
    assert db_session.query(StockRequest).count() == 0
    assert db_session.query(TransactionLog).count() == 0


def test_custom_disassemble_normalizes_every_included_child_to_department_out(
    make_bom, make_item, make_location, db_session
):
    """하위 하나만 수정해도 커스텀 분해 묶음의 포함 하위 전체를 선택 출고한다."""
    parent = make_item(name="선택 출고 기준 BOM", process_type_code="AF")
    changed_child = make_item(name="수정한 선택 출고 자재")
    unchanged_child = make_item(name="수정하지 않은 선택 출고 자재")
    make_bom(parent.item_id, changed_child.item_id, D("1"))
    make_bom(parent.item_id, unchanged_child.item_id, D("1"))
    make_location(parent.item_id, department=ASSEMBLY, quantity=D("7"))
    make_location(changed_child.item_id, department=ASSEMBLY, quantity=D("45"))
    make_location(unchanged_child.item_id, department=TUNING, quantity=D("10"))
    requester = _make_employee(db_session, department_role="none")
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="disassemble",
        to_department=ASSEMBLY.value,
        source_item_id=parent.item_id,
        lines=[
            {
                "item_id": parent.item_id,
                "direction": "out",
                "from_bucket": "production",
                "from_department": ASSEMBLY.value,
                "to_bucket": "none",
                "quantity": D("1"),
                "origin": "direct",
            },
            {
                "item_id": changed_child.item_id,
                "direction": "in",
                "from_bucket": "none",
                "to_bucket": "production",
                "to_department": ASSEMBLY.value,
                "quantity": D("2"),
                "origin": "bom_auto",
            },
            {
                "item_id": unchanged_child.item_id,
                "direction": "in",
                "from_bucket": "none",
                "to_bucket": "production",
                "to_department": TUNING.value,
                "quantity": D("1"),
                "origin": "bom_auto",
            },
        ],
    )
    for line in batch.bundles[0].lines:
        if line.origin == "bom_auto":
            _issue_bom_auto_token(db_session, batch, line)

    batch.notes = "분해 구성품 선택 출고"
    result = svc._execute_submission(db_session, requester=requester, batch=batch)

    assert result["requires_approval"] is True
    request = db_session.query(StockRequest).one()
    assert batch.status == "reserved"
    assert _prod_qty(db_session, parent.item_id) == D("7")
    assert _prod_qty(db_session, changed_child.item_id) == D("45")
    assert _prod_qty(db_session, unchanged_child.item_id, TUNING) == D("10")
    assert _loc_pending(db_session, changed_child.item_id) == D("2")
    assert _loc_pending(db_session, unchanged_child.item_id, TUNING) == D("1")
    assert {
        (
            line.item_id,
            line.from_bucket.value,
            getattr(line.from_department, "value", line.from_department),
            line.to_bucket.value,
            getattr(line.to_department, "value", line.to_department),
        )
        for line in request.lines
    } == {
        (changed_child.item_id, "production", ASSEMBLY.value, "none", None),
        (unchanged_child.item_id, "production", TUNING.value, "none", None),
    }

    approver = _make_employee(
        db_session,
        code="CUSTOM-DISASSEMBLE-APPROVER",
        name="선택 출고 결재자",
        department_role="primary",
    )
    request.department_approved_by_employee_id = approver.employee_id
    request.department_approved_by_name = approver.name
    svc.execute_batch_after_dept_approval(
        db_session,
        request=request,
        approver=approver,
    )

    assert _prod_qty(db_session, parent.item_id) == D("7")
    assert _prod_qty(db_session, changed_child.item_id) == D("43")
    assert _prod_qty(db_session, unchanged_child.item_id, TUNING) == D("9")
    assert sorted(log.quantity_change for log in db_session.query(TransactionLog).all()) == [
        D("-2"),
        D("-1"),
    ]


def test_default_disassemble_keeps_parent_out_and_child_recovery(
    make_bom, make_item, make_location, db_session
):
    """수정하지 않은 분해 BOM은 기존 상위 감소·하위 증가를 유지한다."""
    parent = make_item(name="표준 분해 상위", process_type_code="AF")
    child = make_item(name="표준 분해 회수품")
    make_bom(parent.item_id, child.item_id, D("1"))
    make_location(parent.item_id, department=ASSEMBLY, quantity=D("7"))
    make_location(child.item_id, department=ASSEMBLY, quantity=D("45"))
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="disassemble",
        to_department=ASSEMBLY.value,
        source_item_id=parent.item_id,
        lines=[
            {
                "item_id": parent.item_id,
                "direction": "out",
                "from_bucket": "production",
                "from_department": ASSEMBLY.value,
                "to_bucket": "none",
                "quantity": D("1"),
                "origin": "direct",
            },
            {
                "item_id": child.item_id,
                "direction": "in",
                "from_bucket": "none",
                "to_bucket": "production",
                "to_department": ASSEMBLY.value,
                "quantity": D("1"),
                "origin": "bom_auto",
            },
        ],
    )
    _issue_bom_auto_token(db_session, batch, batch.bundles[0].lines[1])

    result = svc._execute_submission(db_session, requester=requester, batch=batch)

    assert result["status"] == "completed"
    assert _prod_qty(db_session, parent.item_id) == D("6")
    assert _prod_qty(db_session, child.item_id) == D("46")
    assert sorted(log.quantity_change for log in db_session.query(TransactionLog).all()) == [
        D("-1"),
        D("1"),
    ]


def test_custom_disassemble_rejects_tampered_bom_child_route(
    make_bom, make_item, make_location, db_session
):
    """서버 발급 분해 경로를 바꾼 자동 하위는 선택 출고로 신뢰하지 않는다."""
    parent = make_item(name="경로 검증 분해 상위", process_type_code="AF")
    child = make_item(name="경로 검증 분해 하위")
    make_bom(parent.item_id, child.item_id, D("1"))
    make_location(parent.item_id, department=ASSEMBLY, quantity=D("7"))
    make_location(child.item_id, department=ASSEMBLY, quantity=D("45"))
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="disassemble",
        to_department=ASSEMBLY.value,
        source_item_id=parent.item_id,
        lines=[
            {
                "item_id": parent.item_id,
                "direction": "out",
                "from_bucket": "production",
                "from_department": ASSEMBLY.value,
                "to_bucket": "none",
                "quantity": D("1"),
                "origin": "direct",
            },
            {
                "item_id": child.item_id,
                "direction": "in",
                "from_bucket": "none",
                "to_bucket": "production",
                "to_department": ASSEMBLY.value,
                "quantity": D("2"),
                "origin": "bom_auto",
            },
        ],
    )
    child_line = batch.bundles[0].lines[1]
    _issue_bom_auto_token(db_session, batch, child_line)
    db_session.query(BOM).filter(
        BOM.parent_item_id == parent.item_id,
        BOM.child_item_id == child.item_id,
    ).delete(synchronize_session=False)
    child_line.to_department = TUNING.value
    batch.notes = "분해 구성품 경로 검증"

    with pytest.raises(ValueError, match="BOM 자동 하위 품목의 원본 정보"):
        svc._execute_submission(db_session, requester=requester, batch=batch)

    assert _prod_qty(db_session, parent.item_id) == D("7")
    assert _prod_qty(db_session, child.item_id) == D("45")
    assert db_session.query(StockRequest).count() == 0
    assert db_session.query(TransactionLog).count() == 0


def test_custom_disassemble_checks_shortage_after_outbound_normalization(
    make_bom, make_item, make_location, db_session
):
    """원본은 회수 입고여도 커스텀 선택 출고 수량이 부족하면 제출을 거부한다."""
    parent = make_item(name="부족 검증 분해 상위", process_type_code="AF")
    child = make_item(name="부족 검증 분해 하위")
    make_bom(parent.item_id, child.item_id, D("1"))
    make_location(parent.item_id, department=ASSEMBLY, quantity=D("7"))
    make_location(child.item_id, department=ASSEMBLY, quantity=D("1"))
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="disassemble",
        to_department=ASSEMBLY.value,
        source_item_id=parent.item_id,
        lines=[
            {
                "item_id": parent.item_id,
                "direction": "out",
                "from_bucket": "production",
                "from_department": ASSEMBLY.value,
                "to_bucket": "none",
                "quantity": D("1"),
                "origin": "direct",
            },
            {
                "item_id": child.item_id,
                "direction": "in",
                "from_bucket": "none",
                "to_bucket": "production",
                "to_department": ASSEMBLY.value,
                "quantity": D("2"),
                "origin": "bom_auto",
            },
        ],
    )
    _issue_bom_auto_token(db_session, batch, batch.bundles[0].lines[1])
    batch.notes = "분해 구성품 재고 부족 확인"

    with pytest.raises(ValueError, match="재고 부족"):
        svc._execute_submission(db_session, requester=requester, batch=batch)

    assert _prod_qty(db_session, parent.item_id) == D("7")
    assert _prod_qty(db_session, child.item_id) == D("1")
    assert db_session.query(StockRequest).count() == 0
    assert db_session.query(TransactionLog).count() == 0


def test_only_custom_bom_bundle_uses_child_only_execution(
    make_bom, make_item, make_location, db_session
):
    """여러 BOM 중 수정한 묶음만 상위를 제외하고, 기본 묶음은 기존 생산을 유지한다."""
    custom_parent = make_item(name="커스텀 묶음 상위", process_type_code="AF")
    custom_child = make_item(name="커스텀 묶음 하위")
    default_parent = make_item(name="기본 묶음 상위", process_type_code="AF")
    default_child = make_item(name="기본 묶음 하위")
    make_bom(custom_parent.item_id, custom_child.item_id, D("2"))
    make_bom(default_parent.item_id, default_child.item_id, D("1"))
    for item, quantity in (
        (custom_parent, D("0")),
        (custom_child, D("10")),
        (default_parent, D("0")),
        (default_child, D("10")),
    ):
        make_location(item.item_id, department=ASSEMBLY, quantity=quantity)
    requester = _make_employee(db_session, department_role="none")
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="produce",
        to_department=ASSEMBLY.value,
        source_item_id=custom_parent.item_id,
        lines=[
            {
                "item_id": custom_parent.item_id,
                "direction": "in",
                "from_bucket": "none",
                "to_bucket": "production",
                "to_department": ASSEMBLY.value,
                "quantity": D("1"),
                "origin": "direct",
            },
            {
                "item_id": custom_child.item_id,
                "direction": "out",
                "from_bucket": "production",
                "from_department": ASSEMBLY.value,
                "to_bucket": "none",
                "quantity": D("3"),
                "origin": "bom_auto",
            },
        ],
    )
    default_bundle = IoBundle(
        bundle_id=uuid.uuid4(),
        batch_id=batch.batch_id,
        source_kind="bom_parent",
        source_item_id=default_parent.item_id,
        title_snapshot="기본 BOM 묶음",
        quantity=D("1"),
        expanded_level=1,
    )
    db_session.add(default_bundle)
    db_session.flush()
    for item, direction, from_bucket, from_department, to_bucket, to_department, origin in (
        (default_parent, "in", "none", None, "production", ASSEMBLY.value, "direct"),
        (default_child, "out", "production", ASSEMBLY.value, "none", None, "bom_auto"),
    ):
        db_session.add(IoLine(
            line_id=uuid.uuid4(),
            bundle_id=default_bundle.bundle_id,
            item_id=item.item_id,
            item_name_snapshot=item.item_name,
            mes_code_snapshot=item.mes_code,
            unit="EA",
            direction=direction,
            from_bucket=from_bucket,
            from_department=from_department,
            to_bucket=to_bucket,
            to_department=to_department,
            quantity=D("1"),
            included=True,
            origin=origin,
            edited=False,
            has_children_snapshot=False,
            shortage=D("0"),
        ))
    db_session.flush()
    db_session.refresh(batch)
    for bundle in batch.bundles:
        for line in bundle.lines:
            if line.origin == "bom_auto":
                _issue_bom_auto_token(db_session, batch, line)

    batch.notes = "커스텀 BOM 하위만 처리"
    svc._execute_submission(db_session, requester=requester, batch=batch)

    request = db_session.query(StockRequest).one()
    requested_item_ids = {line.item_id for line in request.lines}
    assert requested_item_ids == {
        custom_child.item_id,
        default_parent.item_id,
        default_child.item_id,
    }
    custom_parent_line = next(
        line
        for bundle in batch.bundles
        if bundle.source_item_id == custom_parent.item_id
        for line in bundle.lines
        if line.origin == "direct"
    )
    default_parent_line = next(
        line
        for bundle in batch.bundles
        if bundle.source_item_id == default_parent.item_id
        for line in bundle.lines
        if line.origin == "direct"
    )
    assert custom_parent_line.included is False
    assert default_parent_line.included is True
    approver = _make_employee(
        db_session,
        code="MIXED-BOM-APPROVER",
        name="다중 BOM 결재자",
        department_role="primary",
    )
    request.department_approved_by_employee_id = approver.employee_id
    request.department_approved_by_name = approver.name

    svc.execute_batch_after_dept_approval(db_session, request=request, approver=approver)

    assert _prod_qty(db_session, custom_parent.item_id) == D("0")
    assert _prod_qty(db_session, custom_child.item_id) == D("7")
    assert _prod_qty(db_session, default_parent.item_id) == D("1")
    assert _prod_qty(db_session, default_child.item_id) == D("9")


def test_missing_db_bom_child_requires_department_approval(
    make_bom, make_item, make_location, db_session
):
    """payload에 빠진 자동 자재도 현재 DB BOM 기준 결재 우회가 되면 안 된다."""
    present_child = make_item(name="전송된 BOM 자재")
    missing_child = make_item(name="누락된 BOM 자재")
    parent = make_item(name="누락 검증 BOM 결과품", process_type_code="AF")
    make_bom(parent.item_id, present_child.item_id, D("2"))
    make_bom(parent.item_id, missing_child.item_id, D("3"))
    make_location(present_child.item_id, department=ASSEMBLY, quantity=D("10"))
    make_location(parent.item_id, department=ASSEMBLY, quantity=D("0"))
    requester = _make_employee(db_session, department_role="none")
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="produce",
        to_department=ASSEMBLY.value,
        source_item_id=parent.item_id,
        lines=[
            {
                "item_id": parent.item_id,
                "direction": "in",
                "from_bucket": "none",
                "to_bucket": "production",
                "to_department": ASSEMBLY.value,
                "quantity": D("2"),
                "origin": "direct",
            },
            {
                "item_id": present_child.item_id,
                "direction": "out",
                "from_bucket": "production",
                "from_department": ASSEMBLY.value,
                "to_bucket": "none",
                "quantity": D("4"),
                "origin": "bom_auto",
            },
        ],
    )
    batch.notes = "DB BOM 구성 누락"
    _issue_bom_auto_token(db_session, batch, batch.bundles[0].lines[1])

    result = svc._execute_submission(db_session, requester=requester, batch=batch)

    request = db_session.query(StockRequest).one()
    assert result["requires_approval"] is True
    assert request.requires_department_approval is True
    assert db_session.query(TransactionLog).count() == 0


@pytest.mark.parametrize("sub_type", ["produce", "disassemble"])
def test_explicitly_excluded_positive_bom_child_requires_memo_before_submission(
    make_bom, make_item, make_location, db_session, sub_type
):
    """양수 기준 자동 하위를 명시적으로 제외하면 기본 BOM 즉시 처리로 되살아나면 안 된다."""
    parent = make_item(name=f"제외 메모 상위 {sub_type}", process_type_code="AF")
    excluded_child = make_item(name=f"제외 메모 자재 {sub_type}")
    retained_child = make_item(name=f"유지 메모 자재 {sub_type}")
    make_bom(parent.item_id, excluded_child.item_id, D("1"))
    make_bom(parent.item_id, retained_child.item_id, D("1"))
    make_location(parent.item_id, department=ASSEMBLY, quantity=D("7" if sub_type == "disassemble" else "0"))
    make_location(excluded_child.item_id, department=ASSEMBLY, quantity=D("10"))
    make_location(retained_child.item_id, department=ASSEMBLY, quantity=D("10"))
    requester = _make_employee(db_session)
    child_direction = "out" if sub_type == "produce" else "in"
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type=sub_type,
        to_department=ASSEMBLY.value,
        source_item_id=parent.item_id,
        lines=[
            {
                "item_id": parent.item_id,
                "direction": "in" if sub_type == "produce" else "out",
                "from_bucket": "none" if sub_type == "produce" else "production",
                "from_department": None if sub_type == "produce" else ASSEMBLY.value,
                "to_bucket": "production" if sub_type == "produce" else "none",
                "to_department": ASSEMBLY.value if sub_type == "produce" else None,
                "quantity": D("1"),
                "origin": "direct",
            },
            {
                "item_id": excluded_child.item_id,
                "direction": child_direction,
                "from_bucket": "production" if sub_type == "produce" else "none",
                "from_department": ASSEMBLY.value if sub_type == "produce" else None,
                "to_bucket": "none" if sub_type == "produce" else "production",
                "to_department": None if sub_type == "produce" else ASSEMBLY.value,
                "quantity": D("1"),
                "included": False,
                "origin": "bom_auto",
            },
            {
                "item_id": retained_child.item_id,
                "direction": child_direction,
                "from_bucket": "production" if sub_type == "produce" else "none",
                "from_department": ASSEMBLY.value if sub_type == "produce" else None,
                "to_bucket": "none" if sub_type == "produce" else "production",
                "to_department": None if sub_type == "produce" else ASSEMBLY.value,
                "quantity": D("1"),
                "origin": "bom_auto",
            },
        ],
    )
    for line in batch.bundles[0].lines:
        if line.origin == "bom_auto":
            _issue_bom_auto_token(db_session, batch, line)
    batch.notes = " \t "

    with pytest.raises(ValueError, match="메모"):
        svc._execute_submission(db_session, requester=requester, batch=batch)

    assert next(line for line in batch.bundles[0].lines if line.item_id == excluded_child.item_id).included is False
    assert db_session.query(StockRequest).count() == 0
    assert db_session.query(TransactionLog).count() == 0


@pytest.mark.parametrize("sub_type", ["produce", "disassemble"])
def test_explicitly_excluded_positive_bom_child_creates_department_approval_without_child_effect(
    make_bom, make_item, make_location, db_session, sub_type
):
    """명시적 제외는 유효 메모로 결재 요청을 만들되 제외 자재를 effect에 넣지 않는다."""
    parent = make_item(name=f"제외 결재 상위 {sub_type}", process_type_code="AF")
    excluded_child = make_item(name=f"제외 결재 자재 {sub_type}")
    retained_child = make_item(name=f"유지 결재 자재 {sub_type}")
    make_bom(parent.item_id, excluded_child.item_id, D("1"))
    make_bom(parent.item_id, retained_child.item_id, D("1"))
    make_location(parent.item_id, department=ASSEMBLY, quantity=D("7" if sub_type == "disassemble" else "0"))
    make_location(excluded_child.item_id, department=ASSEMBLY, quantity=D("10"))
    make_location(retained_child.item_id, department=ASSEMBLY, quantity=D("10"))
    requester = _make_employee(db_session)
    child_direction = "out" if sub_type == "produce" else "in"
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type=sub_type,
        to_department=ASSEMBLY.value,
        source_item_id=parent.item_id,
        lines=[
            {
                "item_id": parent.item_id,
                "direction": "in" if sub_type == "produce" else "out",
                "from_bucket": "none" if sub_type == "produce" else "production",
                "from_department": None if sub_type == "produce" else ASSEMBLY.value,
                "to_bucket": "production" if sub_type == "produce" else "none",
                "to_department": ASSEMBLY.value if sub_type == "produce" else None,
                "quantity": D("1"),
                "origin": "direct",
            },
            {
                "item_id": excluded_child.item_id,
                "direction": child_direction,
                "from_bucket": "production" if sub_type == "produce" else "none",
                "from_department": ASSEMBLY.value if sub_type == "produce" else None,
                "to_bucket": "none" if sub_type == "produce" else "production",
                "to_department": None if sub_type == "produce" else ASSEMBLY.value,
                "quantity": D("1"),
                "included": False,
                "origin": "bom_auto",
            },
            {
                "item_id": retained_child.item_id,
                "direction": child_direction,
                "from_bucket": "production" if sub_type == "produce" else "none",
                "from_department": ASSEMBLY.value if sub_type == "produce" else None,
                "to_bucket": "none" if sub_type == "produce" else "production",
                "to_department": None if sub_type == "produce" else ASSEMBLY.value,
                "quantity": D("1"),
                "origin": "bom_auto",
            },
        ],
    )
    for line in batch.bundles[0].lines:
        if line.origin == "bom_auto":
            _issue_bom_auto_token(db_session, batch, line)
    batch.notes = "양수 BOM 자재 제외"

    result = svc._execute_submission(db_session, requester=requester, batch=batch)

    request = db_session.query(StockRequest).one()
    assert result["requires_approval"] is True
    assert request.requires_department_approval is True
    assert [line.item_id for line in request.lines] == [retained_child.item_id]
    assert _prod_qty(db_session, parent.item_id) == D("7" if sub_type == "disassemble" else "0")
    assert _prod_qty(db_session, excluded_child.item_id) == D("10")
    assert _prod_qty(db_session, retained_child.item_id) == D("10")
    assert db_session.query(TransactionLog).count() == 0


def test_stale_disassemble_bom_child_with_valid_server_token_creates_department_approval(
    make_bom, make_item, make_location, db_session
):
    """미리보기 뒤 DB 관계가 삭제된 자동 자재는 유효 서명일 때만 커스텀 결재로 보낸다."""
    parent = make_item(name="stale 분해 상위", process_type_code="AF")
    child = make_item(name="stale 분해 하위")
    make_bom(parent.item_id, child.item_id, D("1"))
    make_location(parent.item_id, department=ASSEMBLY, quantity=D("7"))
    make_location(child.item_id, department=ASSEMBLY, quantity=D("10"))
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="disassemble",
        to_department=ASSEMBLY.value,
        source_item_id=parent.item_id,
        lines=[
            {
                "item_id": parent.item_id,
                "direction": "out",
                "from_bucket": "production",
                "from_department": ASSEMBLY.value,
                "to_bucket": "none",
                "quantity": D("1"),
                "origin": "direct",
            },
            {
                "item_id": child.item_id,
                "direction": "in",
                "from_bucket": "none",
                "to_bucket": "production",
                "to_department": ASSEMBLY.value,
                "quantity": D("1"),
                "origin": "bom_auto",
            },
        ],
    )
    child_line = batch.bundles[0].lines[1]
    _issue_bom_auto_token(db_session, batch, child_line)
    db_session.query(BOM).filter(
        BOM.parent_item_id == parent.item_id,
        BOM.child_item_id == child.item_id,
    ).delete(synchronize_session=False)
    batch.notes = "미리보기 뒤 구성 변경"

    result = svc._execute_submission(db_session, requester=requester, batch=batch)

    request = db_session.query(StockRequest).one()
    assert result["requires_approval"] is True
    assert request.requires_department_approval is True
    assert [line.item_id for line in request.lines] == [child.item_id]
    assert _prod_qty(db_session, parent.item_id) == D("7")
    assert _prod_qty(db_session, child.item_id) == D("10")
    assert db_session.query(TransactionLog).count() == 0


@pytest.mark.parametrize("sub_type", ["produce", "disassemble"])
@pytest.mark.parametrize("self_approved", [False, True])
@pytest.mark.parametrize("child_change", ["excluded", "zero"])
def test_custom_bom_with_only_excluded_or_zero_child_creates_no_effect_department_approval(
    make_bom, make_item, make_location, db_session, sub_type, self_approved, child_change
):
    """단일 자동 하위의 제외·0수량은 안전한 상위 참조 요청으로 결재 대기를 남긴다."""
    parent = make_item(name=f"무반영 결재 상위 {sub_type} {child_change}", process_type_code="AF")
    child = make_item(name=f"무반영 결재 하위 {sub_type} {child_change}")
    make_bom(parent.item_id, child.item_id, D("1"))
    make_location(parent.item_id, department=ASSEMBLY, quantity=D("7" if sub_type == "disassemble" else "0"))
    make_location(child.item_id, department=ASSEMBLY, quantity=D("10"))
    requester = _make_employee(
        db_session,
        department_role="primary" if self_approved else "none",
    )
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type=sub_type,
        to_department=ASSEMBLY.value,
        source_item_id=parent.item_id,
        lines=[
            {
                "item_id": parent.item_id,
                "direction": "in" if sub_type == "produce" else "out",
                "from_bucket": "none" if sub_type == "produce" else "production",
                "from_department": None if sub_type == "produce" else ASSEMBLY.value,
                "to_bucket": "production" if sub_type == "produce" else "none",
                "to_department": ASSEMBLY.value if sub_type == "produce" else None,
                "quantity": D("1"),
                "origin": "direct",
            },
            {
                "item_id": child.item_id,
                "direction": "out" if sub_type == "produce" else "in",
                "from_bucket": "production" if sub_type == "produce" else "none",
                "from_department": ASSEMBLY.value if sub_type == "produce" else None,
                "to_bucket": "none" if sub_type == "produce" else "production",
                "to_department": None if sub_type == "produce" else ASSEMBLY.value,
                "quantity": D("0" if child_change == "zero" else "1"),
                "included": child_change == "zero",
                "origin": "bom_auto",
            },
        ],
    )
    child_line = batch.bundles[0].lines[1]
    _issue_bom_auto_token(db_session, batch, child_line)
    batch.notes = "구성품 전체 제외"

    result = svc._execute_submission(db_session, requester=requester, batch=batch)

    request = db_session.query(StockRequest).one()
    assert result["requires_approval"] is True
    assert request.requires_department_approval is True
    assert len(request.lines) == 1
    assert request.lines[0].operation_line_id == batch.bundles[0].lines[0].line_id
    assert _prod_qty(db_session, parent.item_id) == D("7" if sub_type == "disassemble" else "0")
    assert _prod_qty(db_session, child.item_id) == D("10")
    assert db_session.query(TransactionLog).count() == 0

    if self_approved:
        assert batch.status == "completed"
        assert request.status == StockRequestStatusEnum.COMPLETED
        return

    assert batch.status in {"submitted", "reserved"}

    approver = _make_employee(
        db_session,
        code=f"NO-EFFECT-{sub_type}",
        name="무반영 결재자",
        department_role="primary",
    )
    request.department_approved_by_employee_id = approver.employee_id
    request.department_approved_by_name = approver.name
    svc.execute_batch_after_dept_approval(db_session, request=request, approver=approver)

    assert batch.status == "completed"
    assert request.status == StockRequestStatusEnum.COMPLETED
    assert _prod_qty(db_session, parent.item_id) == D("7" if sub_type == "disassemble" else "0")
    assert _prod_qty(db_session, child.item_id) == D("10")
    assert db_session.query(TransactionLog).count() == 0


def test_zero_bom_parent_resets_saved_auto_children_before_submission(
    make_bom, make_item, make_location, db_session
):
    """부모 0이면 조작된 자동 자식 수량·포함·edited 상태를 서버가 초기화한다."""
    child_item = make_item(name="0 부모 자동 자식")
    parent = make_item(name="0 부모 BOM 결과품", process_type_code="AF")
    make_bom(parent.item_id, child_item.item_id, D("2"))
    make_location(parent.item_id, department=ASSEMBLY, quantity=D("0"))
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="produce",
        to_department=ASSEMBLY.value,
        source_item_id=parent.item_id,
        lines=[
            {
                "item_id": parent.item_id,
                "direction": "in",
                "from_bucket": "none",
                "to_bucket": "production",
                "to_department": ASSEMBLY.value,
                "quantity": D("0"),
                "included": False,
                "origin": "direct",
            },
            {
                "item_id": child_item.item_id,
                "direction": "out",
                "from_bucket": "production",
                "from_department": ASSEMBLY.value,
                "to_bucket": "none",
                "quantity": D("3"),
                "included": True,
                "origin": "bom_auto",
            },
        ],
    )
    child = batch.bundles[0].lines[1]
    child.edited = True
    _issue_bom_auto_token(db_session, batch, child)

    svc._execute_submission(db_session, requester=requester, batch=batch)

    assert child.quantity == D("0")
    assert child.included is False
    assert child.edited is False
    assert db_session.query(TransactionLog).count() == 0


def test_process_bom_bundle_without_direct_parent_is_rejected_without_inventory_effects(
    make_bom, make_item, make_location, db_session
):
    """상위 결과 라인이 빠진 BOM 묶음은 결재 대기가 아니라 제출 자체를 거부한다."""
    child_item = make_item(name="상위 누락 BOM 자식")
    parent = make_item(name="상위 누락 BOM 결과품", process_type_code="AF")
    make_bom(parent.item_id, child_item.item_id, D("2"))
    make_location(child_item.item_id, department=ASSEMBLY, quantity=D("10"))
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="produce",
        to_department=ASSEMBLY.value,
        source_item_id=parent.item_id,
        lines=[
            {
                "item_id": child_item.item_id,
                "direction": "out",
                "from_bucket": "production",
                "from_department": ASSEMBLY.value,
                "to_bucket": "none",
                "quantity": D("2"),
                "origin": "bom_auto",
            },
        ],
    )
    _issue_bom_auto_token(db_session, batch, batch.bundles[0].lines[0])

    with pytest.raises(ValueError, match="BOM 상위 결과 라인"):
        svc._execute_submission(db_session, requester=requester, batch=batch)

    assert _prod_qty(db_session, child_item.item_id) == D("10")
    assert db_session.query(StockRequest).count() == 0
    assert db_session.query(TransactionLog).count() == 0


def test_execute_submission_skips_flagged_bom_component_but_keeps_result_inventory(
    make_bom, make_item, db_session
):
    component = make_item(name="재고 미반영 BOM 자재")
    component.bom_stock_exempt = True
    result_item = make_item(name="생산 결과품", process_type_code="AF")
    make_bom(result_item.item_id, component.item_id, D("2"))
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="produce",
        to_department=ASSEMBLY.value,
        source_item_id=result_item.item_id,
        lines=[
            {
                "item_id": component.item_id,
                "direction": "out",
                "from_bucket": "production",
                "from_department": ASSEMBLY.value,
                "to_bucket": "none",
                "quantity": D("2"),
                "origin": "bom_auto",
            },
            {
                "item_id": result_item.item_id,
                "direction": "in",
                "from_bucket": "none",
                "to_bucket": "production",
                "to_department": ASSEMBLY.value,
                "quantity": D("1"),
                "origin": "direct",
            },
        ],
    )
    _issue_bom_auto_token(
        db_session,
        batch,
        next(line for line in batch.bundles[0].lines if line.item_id == component.item_id),
    )

    result = svc._execute_submission(db_session, requester=requester, batch=batch)

    component_line = next(line for line in batch.bundles[0].lines if line.item_id == component.item_id)
    assert result["status"] == "completed"
    assert component_line.bom_stock_exempt is True
    assert component_line.included is False
    assert component_line.exclusion_note == "BOM 재고 미반영"
    assert _prod_qty(db_session, component.item_id) == D("0")
    assert _prod_qty(db_session, result_item.item_id) == D("1")
    assert [log.item_id for log in db_session.query(TransactionLog).all()] == [result_item.item_id]


def test_execute_submission_keeps_flagged_line_without_matching_bom_relation(
    make_item, make_location, db_session
):
    """재고 미반영 품목의 direct BOM-auto 특례는 BOM 관계 없이 재고를 건드리지 않는다."""
    component = make_item(name="수동 처리 대상")
    unrelated_parent = make_item(name="무관한 부모", process_type_code="AF")
    component.bom_stock_exempt = True
    make_location(component.item_id, department=ASSEMBLY, quantity=D("2"))
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="produce",
        to_department=ASSEMBLY.value,
        source_item_id=unrelated_parent.item_id,
        source_kind="direct_item",
        lines=[
            {
                "item_id": component.item_id,
                "direction": "out",
                "from_bucket": "production",
                "from_department": ASSEMBLY.value,
                "to_bucket": "none",
                "quantity": D("2"),
                "origin": "bom_auto",
            }
        ],
    )

    svc._execute_submission(db_session, requester=requester, batch=batch)

    line = _single_line(batch)
    assert line.bom_stock_exempt is True
    assert line.included is False
    assert _prod_qty(db_session, component.item_id) == D("2")
    assert db_session.query(TransactionLog).count() == 0


def test_execute_submission_keeps_flagged_line_without_server_issued_bom_token(
    make_bom, make_item, make_location, db_session
):
    """재고 미반영 품목의 direct BOM-auto 특례는 서버 BOM 토큰 없이도 재고를 건드리지 않는다."""
    component = make_item(name="토큰 없는 수동 BOM 형태 자재")
    parent = make_item(name="토큰 없는 수동 BOM 형태 부모", process_type_code="AF")
    component.bom_stock_exempt = True
    make_bom(parent.item_id, component.item_id, D("2"))
    make_location(component.item_id, department=ASSEMBLY, quantity=D("2"))
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="produce",
        to_department=ASSEMBLY.value,
        source_item_id=parent.item_id,
        source_kind="direct_item",
        lines=[
            {
                "item_id": component.item_id,
                "direction": "out",
                "from_bucket": "production",
                "from_department": ASSEMBLY.value,
                "to_bucket": "none",
                "quantity": D("2"),
                "origin": "bom_auto",
            }
        ],
    )

    svc._execute_submission(db_session, requester=requester, batch=batch)

    line = _single_line(batch)
    assert line.bom_stock_exempt is True
    assert line.included is False
    assert _prod_qty(db_session, component.item_id) == D("2")
    assert db_session.query(TransactionLog).count() == 0


def test_execute_batch_after_dept_approval_applies_inventory(
    make_item, make_location, db_session
):
    """부서 결재 통과 후 실행: 재고 반영 + batch completed."""
    item = make_item(name="결재후실행")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("0"))
    requester = _make_employee(db_session, department_role="none")
    approver = _make_employee(db_session, code="APPR01", name="결재자",
                              department_role="primary")
    # 부서 결재 대기 상태의 batch + 연결된 StockRequest 구성.
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="adjust_in",
        lines=[{"item_id": item.item_id, "direction": "adjust",
                "from_bucket": "none", "to_bucket": "production",
                "to_department": ASSEMBLY, "quantity": D("5"), "origin": "adjust_in"}],
    )
    request = StockRequest(
        request_id=uuid.uuid4(),
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department=requester.department.value,
        request_type=svc.StockRequestTypeEnum.MANUAL_ADJUSTMENT,
        request_code="SR-TEST-MANUAL-ADJUST",
        status=StockRequestStatusEnum.SUBMITTED,
        requires_warehouse_approval=False,
        requires_department_approval=True,
        department_approved_by_employee_id=approver.employee_id,
        department_approved_by_name=approver.name,
        operation_batch_id=batch.batch_id,
    )
    db_session.add(request)
    db_session.flush()

    svc.execute_batch_after_dept_approval(db_session, request=request, approver=approver)

    assert batch.status == "completed"
    assert batch.completed_at is not None
    assert _prod_qty(db_session, item.item_id) == D("5")
    log = db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).one()
    assert log.transaction_type == TransactionTypeEnum.ADJUST
    assert log.reference_no == request.request_code
    mapped = _batch_name_map(db_session, {batch.batch_id})[batch.batch_id]
    assert mapped.approver_name == approver.name
    # operator_name 은 승인자 기준으로 기록.
    assert log.produced_by == approver.name


def test_execute_batch_after_dept_approval_preserves_bom_stock_exempt_snapshot(
    make_bom, make_item, db_session
):
    """결재 대기 배치는 이후 품목 설정이 바뀌어도 제출 당시 스냅샷으로 처리한다."""
    component = make_item(name="결재 대기 BOM 자재")
    component.bom_stock_exempt = True
    result_item = make_item(name="결재 대기 결과품", process_type_code="AF")
    make_bom(result_item.item_id, component.item_id, D("2"))
    requester = _make_employee(db_session)
    approver = _make_employee(
        db_session,
        code="APPR-SNAPSHOT",
        name="스냅샷결재자",
        department_role="primary",
    )
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="produce",
        status="reserved",
        to_department=ASSEMBLY.value,
        source_item_id=result_item.item_id,
        lines=[
            {
                "item_id": component.item_id,
                "direction": "out",
                "from_bucket": "production",
                "from_department": ASSEMBLY.value,
                "to_bucket": "none",
                "quantity": D("2"),
                "origin": "bom_auto",
                "included": False,
            },
            {
                "item_id": result_item.item_id,
                "direction": "in",
                "from_bucket": "none",
                "to_bucket": "production",
                "to_department": ASSEMBLY.value,
                "quantity": D("1"),
                "origin": "direct",
            },
        ],
    )
    component_line = next(
        line for line in batch.bundles[0].lines if line.item_id == component.item_id
    )
    component_line.bom_stock_exempt = True
    component_line.exclusion_note = "BOM 재고 미반영"
    _issue_bom_auto_token(db_session, batch, component_line)
    request = StockRequest(
        request_id=uuid.uuid4(),
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department=requester.department.value,
        request_type=svc.StockRequestTypeEnum.MANUAL_ADJUSTMENT,
        request_code="SR-BOM-SNAPSHOT",
        status=StockRequestStatusEnum.RESERVED,
        requires_warehouse_approval=False,
        requires_department_approval=True,
        department_approved_by_employee_id=approver.employee_id,
        department_approved_by_name=approver.name,
        operation_batch_id=batch.batch_id,
    )
    db_session.add(request)
    db_session.flush()

    component.bom_stock_exempt = False
    db_session.flush()

    svc.execute_batch_after_dept_approval(db_session, request=request, approver=approver)

    assert batch.status == "completed"
    assert component_line.bom_stock_exempt is True
    assert component_line.included is False
    assert _prod_qty(db_session, component.item_id) == D("0")
    assert _prod_qty(db_session, result_item.item_id) == D("1")
    assert [log.item_id for log in db_session.query(TransactionLog).all()] == [result_item.item_id]


def test_shipping_linked_department_approval_is_read_only(
    make_item, make_location, db_session
):
    """과거 출하 연결 결재는 상태와 무관하게 재고를 다시 반영하지 않는다."""
    pf_item = make_item(name="출하 연결 결재 PF", process_type_code="PF")
    make_location(pf_item.item_id, department=ASSEMBLY, quantity=D("0"))
    requester = _make_employee(db_session, department_role="none")
    approver = _make_employee(
        db_session,
        code="SHIP-APPR",
        name="출하 결재자",
        department_role="primary",
    )
    shipping_request = ShippingRequest(
        base_pf_item_id=pf_item.item_id,
        status=ShippingRequestStatusEnum.PREPARED,
    )
    db_session.add(shipping_request)
    db_session.flush()
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="produce",
        to_department=ASSEMBLY.value,
        lines=[
            {
                "item_id": pf_item.item_id,
                "direction": "in",
                "from_bucket": "none",
                "to_bucket": "production",
                "to_department": ASSEMBLY.value,
                "quantity": D("1"),
                "origin": "manual",
            }
        ],
    )
    batch.shipping_request_id = shipping_request.request_id
    request = StockRequest(
        request_id=uuid.uuid4(),
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department=requester.department.value,
        request_type=svc.StockRequestTypeEnum.MANUAL_ADJUSTMENT,
        request_code="SR-SHIP-PREP-STALE",
        status=StockRequestStatusEnum.SUBMITTED,
        requires_warehouse_approval=False,
        requires_department_approval=True,
        department_approved_by_employee_id=approver.employee_id,
        department_approved_by_name=approver.name,
        operation_batch_id=batch.batch_id,
    )
    db_session.add(request)
    db_session.flush()

    with pytest.raises(ValueError, match="조회만"):
        svc.execute_batch_after_dept_approval(
            db_session,
            request=request,
            approver=approver,
        )

    assert batch.stock_request_id is None
    assert batch.reference_no is None
    assert _prod_qty(db_session, pf_item.item_id) == D("0")
    assert db_session.query(TransactionLog).count() == 0


def test_execute_batch_after_dept_approval_missing_batch_raises(db_session):
    """operation_batch_id 미연결 요청 → ValueError."""
    requester = _make_employee(db_session)
    request = StockRequest(
        request_id=uuid.uuid4(),
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department=requester.department.value,
        request_type=svc.StockRequestTypeEnum.MANUAL_ADJUSTMENT,
        request_code="SR-TEST-MANUAL-ADJUST",
        status=StockRequestStatusEnum.SUBMITTED,
        requires_warehouse_approval=False,
        requires_department_approval=True,
        operation_batch_id=None,
    )
    db_session.add(request)
    db_session.flush()
    with pytest.raises(ValueError, match="배치가 연결되지 않은"):
        svc.execute_batch_after_dept_approval(db_session, request=request, approver=requester)


# ──────────────────────────── submit_existing_draft (공개 진입점) ────────────────────────────


def test_submit_existing_draft_completes_immediate(make_item, db_session):
    """draft 재제출: 새 batch 없이 기존 라인 즉시 실행 → completed."""
    item = make_item(name="임시저장", warehouse_qty=D("0"))
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="receive_supplier",
        work_type="receive",
        status="draft",
        lines=[{"item_id": item.item_id, "direction": "in", "from_bucket": "none",
                "to_bucket": "warehouse", "quantity": D("7")}],
    )
    db_session.flush()

    result = svc.submit_existing_draft(
        db_session,
        batch_id=batch.batch_id,
        requester_employee_id=requester.employee_id,
    )

    assert result["status"] == "completed"
    assert _warehouse_qty(db_session, item.item_id) == D("7")
    assert db_session.query(IoBatch).count() == 1


def test_submit_existing_draft_applies_current_bom_stock_exempt_setting(
    make_bom, make_item, db_session
):
    component = make_item(name="초안의 BOM 자재")
    parent = make_item(name="초안의 BOM 부모", process_type_code="AF")
    make_bom(parent.item_id, component.item_id, D("2"))
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        work_type="warehouse_io",
        sub_type="warehouse_to_dept",
        status="draft",
        to_department=ASSEMBLY.value,
        source_item_id=parent.item_id,
        lines=[
            {
                "item_id": component.item_id,
                "direction": "move",
                "from_bucket": "warehouse",
                "to_bucket": "production",
                "to_department": ASSEMBLY.value,
                "quantity": D("2"),
                "origin": "bom_auto",
            }
        ],
    )
    _issue_bom_auto_token(db_session, batch, _single_line(batch))
    component.bom_stock_exempt = True
    db_session.flush()

    result = svc.submit_existing_draft(
        db_session,
        batch_id=batch.batch_id,
        requester_employee_id=requester.employee_id,
    )

    line = _single_line(batch)
    assert result["status"] == "completed"
    assert result["message"] == "BOM 재고 미반영 품목만 포함되어 재고 변동 없이 처리되었습니다."
    assert batch.requires_approval is False
    assert line.bom_stock_exempt is True
    assert line.included is False
    assert db_session.query(StockRequest).count() == 0
    assert db_session.query(TransactionLog).count() == 0


def test_submit_existing_draft_wrong_owner_raises(make_item, db_session):
    """타인 draft 제출 시 PermissionError."""
    item = make_item(name="남의초안", warehouse_qty=D("0"))
    owner = _make_employee(db_session, code="OWN01", name="주인")
    other = _make_employee(db_session, code="OTH01", name="타인")
    batch = _build_batch(
        db_session,
        requester=owner,
        sub_type="receive_supplier",
        work_type="receive",
        status="draft",
        lines=[{"item_id": item.item_id, "direction": "in", "from_bucket": "none",
                "to_bucket": "warehouse", "quantity": D("3")}],
    )
    db_session.flush()
    with pytest.raises(PermissionError):
        svc.submit_existing_draft(
            db_session,
            batch_id=batch.batch_id,
            requester_employee_id=other.employee_id,
        )


def test_submit_existing_draft_non_draft_status_raises(make_item, db_session):
    """draft 가 아닌 batch 재제출 시 ValueError."""
    item = make_item(name="이미제출", warehouse_qty=D("0"))
    requester = _make_employee(db_session)
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="receive_supplier",
        work_type="receive",
        status="completed",
        lines=[{"item_id": item.item_id, "direction": "in", "from_bucket": "none",
                "to_bucket": "warehouse", "quantity": D("3")}],
    )
    db_session.flush()
    with pytest.raises(ValueError, match="임시저장 상태가 아닙니다"):
        svc.submit_existing_draft(
            db_session,
            batch_id=batch.batch_id,
            requester_employee_id=requester.employee_id,
        )
