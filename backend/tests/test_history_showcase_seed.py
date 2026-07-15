from __future__ import annotations

import importlib.util
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from unittest.mock import Mock

from sqlalchemy import event

from app.models import DepartmentEnum, Employee, EmployeeLevelEnum, InventoryLocation, LocationStatusEnum


SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "dev" / "seed_history_showcase.py"


def _load_showcase_module():
    spec = importlib.util.spec_from_file_location("history_showcase_seed", SCRIPT_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_showcase_dry_run_selects_real_workflow_candidates(db_session, make_item, make_location, make_bom):
    module = _load_showcase_module()

    actor = Employee(
        employee_code="DEMO-ADMIN",
        name="검증 관리자",
        role="관리자",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.ADMIN,
        is_active=True,
    )
    db_session.add(actor)

    raw = make_item(name="검증 일반 자재", process_type_code="AR", warehouse_qty=Decimal("20"))
    component_a = make_item(name="검증 구성품 A", process_type_code="AR", warehouse_qty=Decimal("20"))
    component_b = make_item(name="검증 구성품 B", process_type_code="AR", warehouse_qty=Decimal("20"))
    source_pa = make_item(name="검증 기존 PA", process_type_code="PA", warehouse_qty=Decimal("0"))
    target_pa = make_item(name="검증 변경 PA", process_type_code="PA", warehouse_qty=Decimal("0"))
    shipping_pf = make_item(name="검증 출하 PF", process_type_code="PF", warehouse_qty=Decimal("0"))

    make_bom(source_pa.item_id, component_a.item_id, Decimal("1"))
    make_bom(target_pa.item_id, component_b.item_id, Decimal("1"))
    make_bom(shipping_pf.item_id, target_pa.item_id, Decimal("1"))
    make_location(component_a.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("10"))
    make_location(component_b.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("10"))
    make_location(source_pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("10"))
    make_location(target_pa.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("10"))
    make_location(shipping_pf.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("10"))
    db_session.commit()

    plan = module.build_showcase_plan(db_session)

    assert plan.actor.employee_id == actor.employee_id
    assert plan.general_item.inventory.warehouse_qty >= Decimal("5")
    assert plan.production_parent.item_id in {source_pa.item_id, target_pa.item_id, shipping_pf.item_id}
    assert plan.conversion_source.item_id == source_pa.item_id
    assert plan.conversion_target.item_id == target_pa.item_id
    assert plan.shipping_pf.item_id == shipping_pf.item_id


def test_showcase_apply_rolls_back_everything_when_a_late_step_fails(db_session, make_item, make_location, make_bom, monkeypatch):
    module = _load_showcase_module()

    actor = Employee(
        employee_code="DEMO-ADMIN",
        name="검증 관리자",
        role="관리자",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.ADMIN,
        is_active=True,
    )
    db_session.add(actor)
    raw = make_item(name="롤백 일반 자재", process_type_code="AR", warehouse_qty=Decimal("20"))
    component_a = make_item(name="롤백 구성품 A", process_type_code="AR", warehouse_qty=Decimal("20"))
    component_b = make_item(name="롤백 구성품 B", process_type_code="AR", warehouse_qty=Decimal("20"))
    source_pa = make_item(name="롤백 기존 PA", process_type_code="PA", warehouse_qty=Decimal("0"))
    target_pa = make_item(name="롤백 변경 PA", process_type_code="PA", warehouse_qty=Decimal("0"))
    shipping_pf = make_item(name="롤백 출하 PF", process_type_code="PF", warehouse_qty=Decimal("0"))
    make_bom(source_pa.item_id, component_a.item_id, Decimal("1"))
    make_bom(target_pa.item_id, component_b.item_id, Decimal("1"))
    make_bom(shipping_pf.item_id, target_pa.item_id, Decimal("1"))
    for item in (component_a, component_b):
        make_location(item.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("10"))
    for item in (source_pa, target_pa, shipping_pf):
        make_location(item.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("10"))
    db_session.commit()

    before = db_session.query(InventoryLocation).filter(InventoryLocation.item_id == raw.item_id).count()
    monkeypatch.setattr(module, "_run_shipping", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("late failure")))
    count_commit = Mock()
    count_rollback = Mock()

    event.listen(db_session, "after_commit", count_commit)
    event.listen(db_session, "after_rollback", count_rollback)

    try:
        try:
            module.apply_showcase(db_session, marker="[HISTORY-DEMO][ROLLBACK]")
        except RuntimeError as exc:
            assert str(exc) == "late failure"
        else:
            raise AssertionError("late failure must escape apply_showcase")
    finally:
        event.remove(db_session, "after_commit", count_commit)
        event.remove(db_session, "after_rollback", count_rollback)

    assert count_commit.call_count == 0
    assert count_rollback.call_count == 1
    assert db_session.query(InventoryLocation).filter(InventoryLocation.item_id == raw.item_id).count() == before
    assert db_session.query(module.TransactionLog).filter(module.TransactionLog.reference_no.like("%ROLLBACK%")).count() == 0


def test_showcase_apply_creates_searchable_real_inventory_history(db_session, make_item, make_location, make_bom):
    module = _load_showcase_module()
    actor = Employee(
        employee_code="SHOWCASE-ADMIN",
        name="이력 검증 관리자",
        role="관리자",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.ADMIN,
        is_active=True,
    )
    db_session.add(actor)
    raw = make_item(name="실행 일반 자재", process_type_code="AR", warehouse_qty=Decimal("30"))
    component_a = make_item(name="실행 구성품 A", process_type_code="AR", warehouse_qty=Decimal("30"))
    component_b = make_item(name="실행 구성품 B", process_type_code="AR", warehouse_qty=Decimal("30"))
    source_pa = make_item(name="실행 기존 PA", process_type_code="PA", warehouse_qty=Decimal("0"))
    target_pa = make_item(name="실행 변경 PA", process_type_code="PA", warehouse_qty=Decimal("0"))
    shipping_pf = make_item(name="실행 출하 PF", process_type_code="PF", warehouse_qty=Decimal("0"))
    make_bom(source_pa.item_id, component_a.item_id, Decimal("1"))
    make_bom(target_pa.item_id, component_b.item_id, Decimal("1"))
    make_bom(shipping_pf.item_id, target_pa.item_id, Decimal("1"))
    for item in (component_a, component_b):
        make_location(item.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("20"))
    for item in (source_pa, target_pa, shipping_pf):
        make_location(item.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("20"))
    db_session.commit()

    count_commit = Mock()
    count_rollback = Mock()

    event.listen(db_session, "after_commit", count_commit)
    event.listen(db_session, "after_rollback", count_rollback)
    try:
        result = module.apply_showcase(db_session, marker="[HISTORY-DEMO][TEST]")
    finally:
        event.remove(db_session, "after_commit", count_commit)
        event.remove(db_session, "after_rollback", count_rollback)

    assert count_commit.call_count == 1
    assert count_rollback.call_count == 0
    expected = {
        "RECEIVE", "SHIP", "ADJUST", "BACKFLUSH", "PRODUCE", "DISASSEMBLE",
        "TRANSFER_TO_PROD", "TRANSFER_TO_WH", "TRANSFER_DEPT", "MARK_DEFECTIVE",
        "UNMARK_DEFECTIVE", "DEFECT_SCRAP", "SUPPLIER_RETURN",
    }
    assert expected <= set(result.transaction_types)
    logs = db_session.query(module.TransactionLog).filter(
        (module.TransactionLog.reference_no == result.marker)
        | module.TransactionLog.notes.contains(result.marker)
    ).all()
    assert logs
    assert all(log.inventory_effect is not None for log in logs)
    assert all(result.marker in (log.reference_no or "") for log in logs)


def test_showcase_remove_restores_inventory_and_deletes_marked_records(db_session, make_item, make_location, make_bom):
    module = _load_showcase_module()
    actor = Employee(
        employee_code="REMOVE-SHOWCASE-ADMIN",
        name="쇼케이스 정리 관리자",
        role="관리자",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.ADMIN,
        is_active=True,
    )
    db_session.add(actor)
    raw = make_item(name="정리 일반 자재", process_type_code="AR", warehouse_qty=Decimal("30"))
    component_a = make_item(name="정리 구성품 A", process_type_code="AR", warehouse_qty=Decimal("30"))
    component_b = make_item(name="정리 구성품 B", process_type_code="AR", warehouse_qty=Decimal("30"))
    source_pa = make_item(name="정리 기존 PA", process_type_code="PA", warehouse_qty=Decimal("0"))
    target_pa = make_item(name="정리 변경 PA", process_type_code="PA", warehouse_qty=Decimal("0"))
    shipping_pf = make_item(name="정리 출하 PF", process_type_code="PF", warehouse_qty=Decimal("0"))
    make_bom(source_pa.item_id, component_a.item_id, Decimal("1"))
    make_bom(target_pa.item_id, component_b.item_id, Decimal("1"))
    make_bom(shipping_pf.item_id, target_pa.item_id, Decimal("1"))
    for item in (component_a, component_b):
        make_location(item.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("20"))
    for item in (source_pa, target_pa, shipping_pf):
        make_location(item.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("20"))
    db_session.commit()

    before_cells = {
        item.item_id: module.inv_effect.snapshot_cells(db_session, item.item_id)
        for item in db_session.query(module.Item).all()
    }
    marker = "[HISTORY-DEMO][REMOVE-TEST]"
    module.apply_showcase(db_session, marker=marker)

    reason_only_log = (
        db_session.query(module.TransactionLog)
        .filter(
            module.TransactionLog.reference_no.contains(marker),
            module.TransactionLog.operation_batch_id.is_(None),
            module.TransactionLog.shipping_request_id.is_(None),
        )
        .first()
    )
    assert reason_only_log is not None
    reason_only_log.reference_no = "reason-only-showcase-log"
    reason_only_log.notes = "[rework:normal_child]"
    reason_only_log.reason_memo = marker
    db_session.flush()

    removed = module.remove_showcase(db_session, marker)

    assert removed.log_count > 0
    assert db_session.query(module.TransactionLog).filter(
        module.TransactionLog.reference_no.contains(marker)
        | module.TransactionLog.notes.contains(marker)
        | module.TransactionLog.reason_memo.contains(marker)
        | module.TransactionLog.reason_category.contains(marker)
    ).count() == 0
    assert db_session.query(module.IoBatch).filter(module.IoBatch.reference_no.contains(marker)).count() == 0
    assert db_session.query(module.StockRequest).filter(module.StockRequest.reference_no.contains(marker)).count() == 0
    assert db_session.query(module.ShippingRequest).filter(module.ShippingRequest.notes.contains(marker)).count() == 0
    assert {
        item_id: module.inv_effect.snapshot_cells(db_session, item_id)
        for item_id in before_cells
    } == before_cells
