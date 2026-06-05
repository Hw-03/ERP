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
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    IoBatch,
    IoBundle,
    IoLine,
    LocationStatusEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services import io_dispatch as svc
from app.services.pin_auth import DEFAULT_PIN_HASH

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
        source_kind="bom_parent",
        source_item_id=None,
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
    assert request.status != StockRequestStatusEnum.COMPLETED
    assert batch.status != "completed"
    assert _prod_qty(db_session, item.item_id) == D("0")
    assert db_session.query(TransactionLog).count() == 0


# ──────────────────── execute_batch_after_dept_approval ────────────────────


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
        status=StockRequestStatusEnum.SUBMITTED,
        requires_warehouse_approval=False,
        requires_department_approval=True,
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
    # operator_name 은 승인자 기준으로 기록.
    assert log.produced_by == approver.name


def test_execute_batch_after_dept_approval_missing_batch_raises(db_session):
    """operation_batch_id 미연결 요청 → ValueError."""
    requester = _make_employee(db_session)
    request = StockRequest(
        request_id=uuid.uuid4(),
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department=requester.department.value,
        request_type=svc.StockRequestTypeEnum.MANUAL_ADJUSTMENT,
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
