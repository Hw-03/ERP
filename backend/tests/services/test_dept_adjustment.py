"""services/dept_adjustment.py 단위 테스트."""

from __future__ import annotations

import inspect
from contextlib import contextmanager
from decimal import Decimal

import pytest
from sqlalchemy import text

from app.models import (
    DepartmentEnum,
    DefectInventoryMovement,
    DefectQuarantineRecord,
    DeptAdjSubTypeEnum,
    Employee,
    EmployeeLevelEnum,
    InventoryOperation,
    InventoryOperationRoleEnum,
    LocationStatusEnum,
    SystemSetting,
    TransactionLog,
)
from app.services import dept_adjustment as svc
from app.services import inventory as inv_svc
from app.services.pin_auth import hash_pin

D = Decimal
ASSEMBLY = DepartmentEnum.ASSEMBLY


@pytest.mark.parametrize(
    "mutation",
    [
        svc.submit_adjustment,
        svc.submit_defective_disassemble,
        svc.submit_normal_disassemble,
    ],
)
def test_public_mutation_service_requires_employee_actor(mutation) -> None:
    parameters = inspect.signature(mutation).parameters

    assert "actor" in parameters
    assert parameters["actor"].default is inspect.Parameter.empty
    assert "operator_name" not in parameters
    assert "producer_employee_id" not in parameters
    assert "actor_employee_id" not in parameters


def _service_actor(db_session) -> Employee:
    actor = (
        db_session.query(Employee)
        .filter(Employee.employee_code == "DEPT-SVC")
        .first()
    )
    if actor is not None:
        return actor
    actor = Employee(
        employee_code="DEPT-SVC",
        name="서버 조정자",
        role=f"{ASSEMBLY.value}/staff",
        department=ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        display_order=0,
        is_active=True,
        pin_hash=hash_pin("2468"),
        pin_requires_change=False,
    )
    db_session.add(actor)
    db_session.flush()
    return actor


def test_public_mutation_services_reject_missing_or_non_employee_actor(
    db_session, make_item
) -> None:
    item = make_item(name="actor-required-adjustment")
    line = svc.AdjLine(
        item_id=item.item_id,
        direction="in",
        quantity=D("1"),
        department=ASSEMBLY,
    )

    with pytest.raises(TypeError):
        svc.submit_adjustment(db_session, DeptAdjSubTypeEnum.CORRECTION, [line])
    with pytest.raises(TypeError, match="Employee"):
        svc.submit_adjustment(
            db_session,
            DeptAdjSubTypeEnum.CORRECTION,
            [line],
            actor="spoof",
        )
    with pytest.raises(TypeError):
        svc.submit_adjustment(
            db_session,
            DeptAdjSubTypeEnum.CORRECTION,
            [line],
            actor=_service_actor(db_session),
            operator_name="spoof",
        )

    rework_kwargs = {
        "reason_category": "actor contract",
        "reason_memo": "no mutation",
    }
    with pytest.raises(TypeError):
        svc.submit_defective_disassemble(
            db_session,
            item.item_id,
            D("1"),
            ASSEMBLY,
            [],
            **rework_kwargs,
        )
    with pytest.raises(TypeError, match="Employee"):
        svc.submit_defective_disassemble(
            db_session,
            item.item_id,
            D("1"),
            ASSEMBLY,
            [],
            actor="spoof",
            **rework_kwargs,
        )
    with pytest.raises(TypeError):
        svc.submit_normal_disassemble(
            db_session,
            item.item_id,
            D("1"),
            "production",
            ASSEMBLY,
            [],
            **rework_kwargs,
        )
    with pytest.raises(TypeError, match="Employee"):
        svc.submit_normal_disassemble(
            db_session,
            item.item_id,
            D("1"),
            "production",
            ASSEMBLY,
            [],
            actor="spoof",
            **rework_kwargs,
        )


# ──────────────────────────── helpers ────────────────────────────

def _prod_qty(db_session, item_id, dept=ASSEMBLY) -> Decimal:
    from app.models import InventoryLocation
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
    from app.models import InventoryLocation
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


def _tx_types(db_session) -> list[str]:
    from app.models import TransactionLog
    return [r.transaction_type.value for r in db_session.query(TransactionLog).all()]


def _enable_operation_ledger(db_session) -> None:
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.commit()


def test_rework_disassemble_prelocks_parent_and_recursive_children_before_mutation(
    make_item, make_location, db_session, monkeypatch
):
    parent = make_item(name="rework-lock-parent", process_type_code="AF")
    branch = make_item(name="rework-lock-branch", process_type_code="AR")
    normal = make_item(name="rework-lock-normal", process_type_code="TR")
    defective = make_item(name="rework-lock-defective", process_type_code="HR")
    scrap = make_item(name="rework-lock-scrap", process_type_code="VR")
    make_location(parent.item_id, department=ASSEMBLY, quantity=D("1"))
    parent_inventory = inv_svc._get_or_create_inventory(db_session, parent.item_id)
    parent_inventory.quantity = D("1")
    decisions = [
        {
            "item_id": str(branch.item_id),
            "qty": "1",
            "children": [
                {"item_id": str(normal.item_id), "qty": "1", "normal_qty": "1"},
                {"item_id": str(defective.item_id), "qty": "1", "defective_qty": "1"},
                {"item_id": str(scrap.item_id), "qty": "1", "scrap_qty": "1"},
            ],
        }
    ]
    expected_ids = sorted(
        {parent.item_id, branch.item_id, normal.item_id, defective.item_id, scrap.item_id}
    )
    events = []
    real_lock = svc.inventory_svc._ensure_and_lock_inventories
    real_scrap = svc.inventory_svc._scrap_normal

    def ensure_and_lock(db, item_ids):
        events.append(("lock", item_ids))
        return real_lock(db, item_ids)

    def scrap_normal(*args, **kwargs):
        events.append(("parent", args[1]))
        return real_scrap(*args, **kwargs)

    monkeypatch.setattr(
        svc.inventory_svc,
        "_ensure_and_lock_inventories",
        ensure_and_lock,
    )
    monkeypatch.setattr(svc.inventory_svc, "_scrap_normal", scrap_normal)

    svc.submit_normal_disassemble(
        db_session,
        parent.item_id,
        D("1"),
        "production",
        ASSEMBLY,
        decisions,
        reason_category="test",
        reason_memo="lock order",
        actor=_service_actor(db_session),
    )

    assert events[0] == ("lock", expected_ids)


def test_normal_rework_records_one_operation_with_explicit_line_roles(
    make_item, make_location, db_session
):
    parent = make_item(name="원장 재작업 부모", process_type_code="AF")
    normal = make_item(name="정상 회수 자식", process_type_code="TR")
    defective = make_item(name="불량 회수 자식", process_type_code="HR")
    scrap = make_item(name="폐기 자식", process_type_code="VR")
    make_location(parent.item_id, department=ASSEMBLY, quantity=D("1"))
    inv_svc._get_or_create_inventory(db_session, parent.item_id).quantity = D("1")
    _enable_operation_ledger(db_session)

    result = svc.submit_normal_disassemble(
        db_session,
        parent.item_id,
        D("1"),
        "production",
        ASSEMBLY,
        [
            {"item_id": normal.item_id, "qty": D("1"), "normal_qty": D("1")},
            {
                "item_id": defective.item_id,
                "qty": D("1"),
                "defective_qty": D("1"),
            },
            {"item_id": scrap.item_id, "qty": D("1"), "scrap_qty": D("1")},
        ],
        reason_category="재작업",
        reason_memo="역할 검증",
        actor=_service_actor(db_session),
    )

    operation = db_session.query(InventoryOperation).one()
    logs = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.reference_no == result["batch_ref"])
        .order_by(TransactionLog.created_at)
        .all()
    )
    assert {log.operation_id for log in logs} == {operation.operation_id}
    assert [log.operation_role for log in logs] == [
        InventoryOperationRoleEnum.REWORK_PARENT_NORMAL,
        InventoryOperationRoleEnum.REWORK_CHILD_NORMAL,
        InventoryOperationRoleEnum.REWORK_CHILD_DEFECTIVE,
        InventoryOperationRoleEnum.REWORK_CHILD_SCRAP,
    ]
    movement = db_session.query(DefectInventoryMovement).one()
    assert movement.item_id == defective.item_id
    assert movement.quantity_delta == D("1")
    assert movement.operation_id == operation.operation_id


def test_normal_rework_skips_flagged_bom_leaf_inventory(
    make_item, make_bom, make_location, db_session
):
    parent = make_item(name="재작업 부모", process_type_code="AF")
    child = make_item(name="재작업 미반영 자재", process_type_code="AR")
    child.bom_stock_exempt = True
    make_bom(parent.item_id, child.item_id, D("1"))
    make_location(parent.item_id, department=ASSEMBLY, quantity=D("1"))
    inv_svc._get_or_create_inventory(db_session, parent.item_id).quantity = D("1")
    db_session.flush()
    template_child = next(
        line
        for line in svc.build_disassembly_template(db_session, parent.item_id, D("1"))
        if line.item_id == child.item_id
    )

    result = svc.submit_normal_disassemble(
        db_session,
        parent.item_id,
        D("1"),
        "production",
        ASSEMBLY,
        [
            {
                "item_id": str(child.item_id),
                "qty": "1",
                "normal_qty": "1",
                "bom_auto_token": template_child.bom_auto_token,
            }
        ],
        reason_category="재작업",
        reason_memo="BOM 재고 미반영",
        actor=_service_actor(db_session),
    )

    assert result["child_log_ids"] == []
    assert _prod_qty(db_session, parent.item_id) == D("0")
    assert _prod_qty(db_session, child.item_id) == D("0")
    assert [log.item_id for log in db_session.query(TransactionLog).all()] == [parent.item_id]


def test_normal_rework_keeps_flagged_bom_leaf_without_server_template_token(
    make_item, make_bom, make_location, db_session
):
    """정상 재작업의 수동 결정은 BOM 품목과 같아도 재고를 반영한다."""
    parent = make_item(name="수동 재작업 BOM 부모", process_type_code="AF")
    child = make_item(name="수동 재작업 BOM 자재", process_type_code="AR")
    child.bom_stock_exempt = True
    make_bom(parent.item_id, child.item_id, D("1"))
    make_location(parent.item_id, department=ASSEMBLY, quantity=D("1"))
    inv_svc._get_or_create_inventory(db_session, parent.item_id).quantity = D("1")
    db_session.flush()

    result = svc.submit_normal_disassemble(
        db_session,
        parent.item_id,
        D("1"),
        "production",
        ASSEMBLY,
        [
            {
                "item_id": str(child.item_id),
                "qty": "1",
                "normal_qty": "1",
            }
        ],
        reason_category="재작업",
        reason_memo="수동 결정",
        actor=_service_actor(db_session),
    )

    assert len(result["child_log_ids"]) == 1
    assert _prod_qty(db_session, child.item_id) == D("1")
    assert [log.item_id for log in db_session.query(TransactionLog).all()] == [parent.item_id, child.item_id]


def test_normal_rework_keeps_flagged_non_bom_decision_inventory(
    make_item, make_location, db_session
):
    """재작업 결정에만 포함된 수동 품목은 BOM 미반영 설정이어도 정상 반영한다."""
    parent = make_item(name="수동 재작업 부모", process_type_code="AF")
    child = make_item(name="수동 재작업 품목", process_type_code="AR")
    child.bom_stock_exempt = True
    make_location(parent.item_id, department=ASSEMBLY, quantity=D("1"))
    inv_svc._get_or_create_inventory(db_session, parent.item_id).quantity = D("1")
    db_session.flush()

    result = svc.submit_normal_disassemble(
        db_session,
        parent.item_id,
        D("1"),
        "production",
        ASSEMBLY,
        [
            {
                "item_id": str(child.item_id),
                "qty": "1",
                "normal_qty": "1",
            }
        ],
        reason_category="재작업",
        reason_memo="수동 품목",
        actor=_service_actor(db_session),
    )

    assert len(result["child_log_ids"]) == 1
    assert _prod_qty(db_session, child.item_id) == D("1")
    assert [log.item_id for log in db_session.query(TransactionLog).all()] == [parent.item_id, child.item_id]


# ──────────────────────────── 템플릿 빌더 ────────────────────────────

def test_production_template_basic(make_item, make_bom, db_session):
    parent = make_item(name="AF", process_type_code="AF")
    child_b = make_item(name="AR", process_type_code="AR")
    child_c = make_item(name="AA", process_type_code="AA")
    make_bom(parent.item_id, child_b.item_id, D("2"))
    make_bom(parent.item_id, child_c.item_id, D("1"))

    lines = svc.build_production_template(db_session, parent.item_id, D("3"))

    # 구성품 out, 결과품 in
    out_lines = [line for line in lines if line.direction == "out"]
    in_lines = [line for line in lines if line.direction == "in"]
    assert len(out_lines) == 2
    assert len(in_lines) == 1
    assert in_lines[0].item_id == parent.item_id
    assert in_lines[0].quantity == D("3")

    qty_map = {line.item_id: line.quantity for line in out_lines}
    assert qty_map[child_b.item_id] == D("6")
    assert qty_map[child_c.item_id] == D("3")


def test_production_template_no_bom(make_item, db_session):
    item = make_item(name="X")
    lines = svc.build_production_template(db_session, item.item_id, D("1"))
    # BOM 없어도 결과품 in 라인은 생성됨
    assert len(lines) == 1
    assert lines[0].direction == "in"
    assert lines[0].item_id == item.item_id


def test_disassembly_template_basic(make_item, make_bom, db_session):
    parent = make_item(name="AF")
    child = make_item(name="AR")
    make_bom(parent.item_id, child.item_id, D("3"))

    lines = svc.build_disassembly_template(db_session, parent.item_id, D("2"))

    out_lines = [line for line in lines if line.direction == "out"]
    in_lines = [line for line in lines if line.direction == "in"]
    assert len(out_lines) == 1
    assert out_lines[0].item_id == parent.item_id
    assert out_lines[0].quantity == D("2")
    assert len(in_lines) == 1
    assert in_lines[0].quantity == D("6")
    assert in_lines[0].bom_expected == D("6")


def test_expand_component(make_item, make_bom, db_session):
    """2단계 BOM: A→B, B→C. B를 전개하면 C 라인 반환."""
    a = make_item(name="A")
    b = make_item(name="B")
    c = make_item(name="C")
    make_bom(a.item_id, b.item_id, D("1"))
    make_bom(b.item_id, c.item_id, D("4"))

    lines = svc.expand_component(db_session, b.item_id, D("2"), ASSEMBLY, direction="out")
    assert len(lines) == 1
    assert lines[0].item_id == c.item_id
    assert lines[0].quantity == D("8")
    assert lines[0].direction == "out"


def test_expand_component_no_children_raises(make_item, db_session):
    item = make_item(name="leaf")
    with pytest.raises(ValueError):
        svc.expand_component(db_session, item.item_id, D("1"), ASSEMBLY)


# ──────────────────────────── submit 처리 ────────────────────────────

def test_submit_production(make_item, make_location, db_session):
    """생산: 결과품 +, 구성품 -, TransactionLog 확인."""
    result = make_item(name="AF", process_type_code="AF")
    comp_b = make_item(name="AR", process_type_code="AR")
    comp_c = make_item(name="AA", process_type_code="AA")

    make_location(comp_b.item_id, department=ASSEMBLY, quantity=D("10"))
    make_location(comp_c.item_id, department=ASSEMBLY, quantity=D("5"))

    lines = [
        svc.AdjLine(item_id=comp_b.item_id, direction="out", quantity=D("4"), department=ASSEMBLY),
        svc.AdjLine(item_id=comp_c.item_id, direction="out", quantity=D("2"), department=ASSEMBLY),
        svc.AdjLine(item_id=result.item_id, direction="in",  quantity=D("1"), department=ASSEMBLY),
    ]

    actor = _service_actor(db_session)
    log_ids = svc.submit_adjustment(
        db_session,
        DeptAdjSubTypeEnum.PRODUCTION,
        lines,
        actor=actor,
    )
    db_session.commit()

    assert len(log_ids) == 3
    assert _prod_qty(db_session, comp_b.item_id) == D("6")
    assert _prod_qty(db_session, comp_c.item_id) == D("3")
    assert _prod_qty(db_session, result.item_id) == D("1")

    types = _tx_types(db_session)
    assert types.count("BACKFLUSH") == 2
    assert types.count("PRODUCE") == 1
    assert {
        log.department for log in db_session.query(TransactionLog).all()
    } == {ASSEMBLY.value}
    assert {
        (log.produced_by, log.producer_employee_id)
        for log in db_session.query(TransactionLog).all()
    } == {(actor.name, actor.employee_id)}
    assert {log.log_id for log in db_session.query(TransactionLog).all()} == set(log_ids)


def test_submit_production_records_one_operation_and_bom_roles(
    make_item, make_location, db_session
):
    result = make_item(name="원장 생산 결과", process_type_code="AF")
    component = make_item(name="원장 생산 자재", process_type_code="AR")
    make_location(component.item_id, department=ASSEMBLY, quantity=D("2"))
    _enable_operation_ledger(db_session)

    svc.submit_adjustment(
        db_session,
        DeptAdjSubTypeEnum.PRODUCTION,
        [
            svc.AdjLine(
                item_id=component.item_id,
                direction="out",
                quantity=D("2"),
                department=ASSEMBLY,
            ),
            svc.AdjLine(
                item_id=result.item_id,
                direction="in",
                quantity=D("1"),
                department=ASSEMBLY,
            ),
        ],
        actor=_service_actor(db_session),
    )

    operation = db_session.query(InventoryOperation).one()
    logs = db_session.query(TransactionLog).order_by(TransactionLog.created_at).all()
    assert {log.operation_id for log in logs} == {operation.operation_id}
    assert [log.operation_role for log in logs] == [
        InventoryOperationRoleEnum.COMPONENT_INPUT,
        InventoryOperationRoleEnum.PRODUCT_OUTPUT,
    ]


@pytest.mark.parametrize(
    ("direction", "quantity"),
    [("scrap", D("1")), ("unknown", D("1")), ("in", D("0"))],
)
def test_submit_validates_all_lines_before_transaction(
    direction, quantity, make_item, db_session, monkeypatch
):
    item = make_item(name=f"invalid-{direction}")
    entered_transaction = False

    @contextmanager
    def transaction_probe(_db):
        nonlocal entered_transaction
        entered_transaction = True
        yield

    monkeypatch.setattr(svc, "transactional", transaction_probe)

    with pytest.raises(ValueError, match="direction|수량"):
        svc.submit_adjustment(
            db_session,
            DeptAdjSubTypeEnum.CORRECTION,
            [
                svc.AdjLine(
                    item_id=item.item_id,
                    direction=direction,
                    quantity=quantity,
                    department=ASSEMBLY,
                )
            ],
            actor=_service_actor(db_session),
        )

    assert entered_transaction is False


def test_submit_mixed_valid_and_invalid_lines_has_no_sql_side_effects(
    make_item, make_location, db_session
):
    item = make_item(name="mixed-invalid")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("10"))
    db_session.commit()
    params = {"item_id": item.item_id.hex}
    before = (
        db_session.execute(
            text("SELECT quantity FROM inventory_locations WHERE item_id = :item_id"),
            params,
        ).scalar_one(),
        db_session.execute(text("SELECT COUNT(*) FROM transaction_logs")).scalar_one(),
    )

    error = None
    try:
        svc.submit_adjustment(
            db_session,
            DeptAdjSubTypeEnum.CORRECTION,
            [
                svc.AdjLine(
                    item_id=item.item_id,
                    direction="out",
                    quantity=D("3"),
                    department=ASSEMBLY,
                ),
                svc.AdjLine(
                    item_id=item.item_id,
                    direction="unknown",
                    quantity=D("1"),
                    department=ASSEMBLY,
                ),
            ],
            actor=_service_actor(db_session),
        )
    except ValueError as exc:
        error = exc

    db_session.expire_all()
    after = (
        db_session.execute(
            text("SELECT quantity FROM inventory_locations WHERE item_id = :item_id"),
            params,
        ).scalar_one(),
        db_session.execute(text("SELECT COUNT(*) FROM transaction_logs")).scalar_one(),
    )
    assert after == before == (10, 0)
    assert error is not None


def test_submit_rolls_back_when_created_log_count_mismatches_lines(
    make_item, make_location, db_session, monkeypatch
):
    item = make_item(name="log-count-mismatch")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("10"))
    db_session.commit()
    real_apply = svc._apply_adjustment

    def omit_last_line(db, sub_type, lines, **kwargs):
        return real_apply(db, sub_type, lines[:-1], **kwargs)

    monkeypatch.setattr(svc, "_apply_adjustment", omit_last_line)
    params = {"item_id": item.item_id.hex}
    before = (
        db_session.execute(
            text("SELECT quantity FROM inventory_locations WHERE item_id = :item_id"),
            params,
        ).scalar_one(),
        db_session.execute(text("SELECT COUNT(*) FROM transaction_logs")).scalar_one(),
    )

    error = None
    try:
        svc.submit_adjustment(
            db_session,
            DeptAdjSubTypeEnum.CORRECTION,
            [
                svc.AdjLine(
                    item_id=item.item_id,
                    direction="out",
                    quantity=D("2"),
                    department=ASSEMBLY,
                ),
                svc.AdjLine(
                    item_id=item.item_id,
                    direction="out",
                    quantity=D("1"),
                    department=ASSEMBLY,
                ),
            ],
            actor=_service_actor(db_session),
        )
    except RuntimeError as exc:
        error = exc

    db_session.expire_all()
    after = (
        db_session.execute(
            text("SELECT quantity FROM inventory_locations WHERE item_id = :item_id"),
            params,
        ).scalar_one(),
        db_session.execute(text("SELECT COUNT(*) FROM transaction_logs")).scalar_one(),
    )
    assert after == before == (10, 0)
    assert error is not None
    assert "로그 수" in str(error)


def test_submit_rolls_back_inventory_when_ledger_capture_fails(
    make_item, make_location, db_session, monkeypatch
):
    item = make_item(name="rollback", process_type_code="AR")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("5"))
    db_session.commit()

    def fail_capture(*_args, **_kwargs):
        raise RuntimeError("ledger failure")

    monkeypatch.setattr(svc.inv_effect, "_capture_effect", fail_capture)

    with pytest.raises(RuntimeError, match="ledger failure"):
        svc.submit_adjustment(
            db_session,
            DeptAdjSubTypeEnum.CORRECTION,
            [
                svc.AdjLine(
                    item_id=item.item_id,
                    direction="out",
                    quantity=D("2"),
                    department=ASSEMBLY,
                )
            ],
            actor=_service_actor(db_session),
        )

    db_session.expire_all()
    assert _prod_qty(db_session, item.item_id) == D("5")
    assert db_session.query(TransactionLog).count() == 0


def test_submit_production_manual_edit(make_item, make_location, db_session):
    """BOM 기대값과 다른 수량으로 제출 시 실입력 기준으로 처리됨."""
    comp = make_item(name="AR")
    result = make_item(name="AF")
    make_location(comp.item_id, department=ASSEMBLY, quantity=D("10"))

    lines = [
        svc.AdjLine(
            item_id=comp.item_id, direction="out", quantity=D("7"),  # bom 기대 2와 다름
            department=ASSEMBLY, bom_expected=D("2")
        ),
        svc.AdjLine(item_id=result.item_id, direction="in", quantity=D("1"), department=ASSEMBLY),
    ]
    svc.submit_adjustment(
        db_session,
        DeptAdjSubTypeEnum.PRODUCTION,
        lines,
        actor=_service_actor(db_session),
    )
    db_session.commit()

    assert _prod_qty(db_session, comp.item_id) == D("3")  # 10 - 7


def test_submit_adjustment_skips_flagged_bom_line_but_keeps_result(
    make_bom, make_item, db_session
):
    component = make_item(name="부서 조정 미반영 자재")
    component.bom_stock_exempt = True
    result = make_item(name="부서 조정 결과품", process_type_code="AF")
    make_bom(result.item_id, component.item_id, D("2"))
    db_session.flush()

    log_ids = svc.submit_adjustment(
        db_session,
        DeptAdjSubTypeEnum.PRODUCTION,
        svc.build_production_template(db_session, result.item_id, D("1")),
        actor=_service_actor(db_session),
    )

    assert len(log_ids) == 1
    assert _prod_qty(db_session, component.item_id) == D("0")
    assert _prod_qty(db_session, result.item_id) == D("1")
    assert [log.item_id for log in db_session.query(TransactionLog).all()] == [result.item_id]


def test_submit_adjustment_keeps_flagged_line_without_matching_bom_parent(
    make_item, make_location, db_session
):
    """수동 생산 조정의 bom_expected 입력만으로 재고 반영을 건너뛰지 않는다."""
    component = make_item(name="수동 조정 대상")
    result = make_item(name="무관한 생산 결과품", process_type_code="AF")
    component.bom_stock_exempt = True
    make_location(component.item_id, department=ASSEMBLY, quantity=D("2"))

    log_ids = svc.submit_adjustment(
        db_session,
        DeptAdjSubTypeEnum.PRODUCTION,
        [
            svc.AdjLine(
                item_id=component.item_id,
                direction="out",
                quantity=D("2"),
                department=ASSEMBLY,
                bom_expected=D("2"),
            ),
            svc.AdjLine(
                item_id=result.item_id,
                direction="in",
                quantity=D("1"),
                department=ASSEMBLY,
            ),
        ],
        actor=_service_actor(db_session),
    )

    assert len(log_ids) == 2
    assert _prod_qty(db_session, component.item_id) == D("0")
    assert _prod_qty(db_session, result.item_id) == D("1")
    assert [log.item_id for log in db_session.query(TransactionLog).all()] == [component.item_id, result.item_id]


def test_submit_adjustment_keeps_flagged_bom_shape_without_server_token(
    make_bom, make_item, make_location, db_session
):
    """실제 BOM 수량을 흉내 내도 템플릿 발급 근거 없이는 수동 조정으로 반영한다."""
    component = make_item(name="토큰 없는 부서 수동 자재")
    result = make_item(name="토큰 없는 부서 수동 결과품", process_type_code="AF")
    component.bom_stock_exempt = True
    make_bom(result.item_id, component.item_id, D("2"))
    make_location(component.item_id, department=ASSEMBLY, quantity=D("2"))

    log_ids = svc.submit_adjustment(
        db_session,
        DeptAdjSubTypeEnum.PRODUCTION,
        [
            svc.AdjLine(
                item_id=component.item_id,
                direction="out",
                quantity=D("2"),
                department=ASSEMBLY,
                bom_expected=D("2"),
            ),
            svc.AdjLine(
                item_id=result.item_id,
                direction="in",
                quantity=D("1"),
                department=ASSEMBLY,
            ),
        ],
        actor=_service_actor(db_session),
    )

    assert len(log_ids) == 2
    assert _prod_qty(db_session, component.item_id) == D("0")
    assert _prod_qty(db_session, result.item_id) == D("1")
    assert [log.item_id for log in db_session.query(TransactionLog).all()] == [component.item_id, result.item_id]


def test_submit_disassembly_mixed(make_item, make_location, db_session):
    """분해: out + in + defective 혼합."""
    target = make_item(name="AF")
    b = make_item(name="AR1")
    c = make_item(name="AR2")

    make_location(target.item_id, department=ASSEMBLY, quantity=D("5"))
    make_location(b.item_id, department=ASSEMBLY, quantity=D("0"))
    make_location(c.item_id, department=ASSEMBLY, quantity=D("2"))

    lines = [
        svc.AdjLine(item_id=target.item_id, direction="out",      quantity=D("1"), department=ASSEMBLY),
        svc.AdjLine(item_id=b.item_id,      direction="in",       quantity=D("2"), department=ASSEMBLY),
        svc.AdjLine(item_id=c.item_id,      direction="defective", quantity=D("1"), department=ASSEMBLY),
    ]

    log_ids = svc.submit_adjustment(
        db_session,
        DeptAdjSubTypeEnum.DISASSEMBLY,
        lines,
        actor=_service_actor(db_session),
    )
    db_session.commit()

    assert len(log_ids) == 3
    assert _prod_qty(db_session, target.item_id) == D("4")   # 5 - 1
    assert _prod_qty(db_session, b.item_id)      == D("2")   # 0 + 2
    assert _defective_qty(db_session, c.item_id) == D("1")

    types = _tx_types(db_session)
    assert "DISASSEMBLE" in types
    assert "RECEIVE" in types
    assert "MARK_DEFECTIVE" in types
    record = (
        db_session.query(DefectQuarantineRecord)
        .filter(DefectQuarantineRecord.item_id == c.item_id)
        .one()
    )
    mark_log = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.item_id == c.item_id)
        .one()
    )
    assert record.remaining_quantity == D("1")
    assert mark_log.defect_quarantine_record_id == record.record_id


def test_submit_correction_in_out(make_item, make_location, db_session):
    """수량 보정: 양방향 ADJUST."""
    item_a = make_item(name="A")
    item_b = make_item(name="B")
    make_location(item_b.item_id, department=ASSEMBLY, quantity=D("5"))
    _enable_operation_ledger(db_session)

    lines = [
        svc.AdjLine(item_id=item_a.item_id, direction="in",  quantity=D("3"), department=ASSEMBLY, reason="발견"),
        svc.AdjLine(item_id=item_b.item_id, direction="out", quantity=D("2"), department=ASSEMBLY, reason="누락 확인"),
    ]
    svc.submit_adjustment(
        db_session,
        DeptAdjSubTypeEnum.CORRECTION,
        lines,
        actor=_service_actor(db_session),
    )
    db_session.commit()

    assert _prod_qty(db_session, item_a.item_id) == D("3")
    assert _prod_qty(db_session, item_b.item_id) == D("3")  # 5 - 2

    types = _tx_types(db_session)
    assert types.count("ADJUST") == 2
    assert db_session.query(InventoryOperation).one().display_label == "부서 입출고"


def test_submit_insufficient_stock_raises(make_item, make_location, db_session):
    """부서 재고 부족 시 ValueError."""
    item = make_item(name="X")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("2"))

    lines = [
        svc.AdjLine(item_id=item.item_id, direction="out", quantity=D("5"), department=ASSEMBLY),
    ]
    with pytest.raises(ValueError, match="재고 부족"):
        svc.submit_adjustment(
            db_session,
            DeptAdjSubTypeEnum.CORRECTION,
            lines,
            actor=_service_actor(db_session),
        )


def test_submit_atomicity(make_item, make_location, db_session):
    """2번째 라인 부족 → 전체 롤백: 1번째 품목 재고 원복."""
    item_a = make_item(name="A")
    item_b = make_item(name="B")
    make_location(item_a.item_id, department=ASSEMBLY, quantity=D("10"))
    make_location(item_b.item_id, department=ASSEMBLY, quantity=D("1"))  # 부족
    db_session.commit()  # setup 데이터 커밋 (이후 rollback이 여기까지만 되돌림)

    lines = [
        svc.AdjLine(item_id=item_a.item_id, direction="out", quantity=D("5"), department=ASSEMBLY),
        svc.AdjLine(item_id=item_b.item_id, direction="out", quantity=D("5"), department=ASSEMBLY),
    ]

    with pytest.raises(ValueError):
        svc.submit_adjustment(
            db_session,
            DeptAdjSubTypeEnum.CORRECTION,
            lines,
            actor=_service_actor(db_session),
        )

    db_session.rollback()

    # item_a 재고 원복 확인 (5로 줄었다가 rollback으로 10 복원)
    assert _prod_qty(db_session, item_a.item_id) == D("10")


def test_submit_empty_lines_raises(db_session):
    with pytest.raises(ValueError, match="라인"):
        svc.submit_adjustment(
            db_session,
            DeptAdjSubTypeEnum.CORRECTION,
            [],
            actor=_service_actor(db_session),
        )
