#!/usr/bin/env python3
"""개발 DB의 실제 서비스 경로로 입출고 내역 검증 이력을 만든다.

기본 실행은 후보만 찾는 dry-run 이다. 실제 반영은 ``--apply``가 필요하다.
생성 로그에는 ``[HISTORY-DEMO]`` 표식을 남겨 입출고 내역에서 검색할 수 있다.
"""

from __future__ import annotations

import argparse
import sys
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal
from app.models import (
    BOM,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    IoBatch,
    IoBundle,
    IoLine,
    Item,
    LocationStatusEnum,
    RequestBucketEnum,
    ShippingRequest,
    StockRequest,
    StockRequestTypeEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.schemas import ProductionReceiptRequest
from app.services import inv_effect, inventory as inventory_svc, shipping as shipping_svc, stock_requests
from app.services import io_dispatch
from app.services.bom import explode_bom, merge_requirements
from app.services.dept_adjustment import submit_normal_disassemble
from app.services.inv_calc import _sync_total
from app.services.production_receipt import execute_production_receipt


DEMO_TAG = "[HISTORY-DEMO]"
DEMO_QUANTITY = Decimal("1")
DEMO_REASON_CATEGORY = "기타"


@dataclass(frozen=True)
class ShowcasePlan:
    actor: Employee
    general_item: Item
    production_parent: Item
    conversion_source: Item
    conversion_target: Item
    shipping_pf: Item


@dataclass(frozen=True)
class ShowcaseResult:
    marker: str
    log_ids: list[uuid.UUID]
    transaction_types: list[str]


@dataclass(frozen=True)
class ShowcaseCleanupResult:
    marker: str
    log_count: int
    batch_count: int
    stock_request_count: int
    shipping_request_count: int


def _location_qty(db, item_id: uuid.UUID, department: DepartmentEnum, status: LocationStatusEnum) -> Decimal:
    row = (
        db.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == department,
            InventoryLocation.status == status,
        )
        .first()
    )
    return Decimal(str(row.quantity or 0)) if row else Decimal("0")


def _item_department(item: Item) -> DepartmentEnum:
    return inventory_svc.department_for_item(item)


def _active_admin(db) -> Employee:
    actor = (
        db.query(Employee)
        .filter(
            Employee.is_active.is_(True),
            Employee.level == EmployeeLevelEnum.ADMIN,
        )
        .order_by(Employee.display_order, Employee.employee_code)
        .first()
    )
    if actor is None:
        raise RuntimeError("[HISTORY-DEMO] 활성 관리자 직원이 필요합니다.")
    return actor


def _find_general_item(db) -> Item:
    row = (
        db.query(Item)
        .join(Inventory, Inventory.item_id == Item.item_id)
        .filter(Inventory.warehouse_qty >= Decimal("5"))
        .order_by(Inventory.warehouse_qty.desc(), Item.item_name)
        .first()
    )
    if row is None:
        raise RuntimeError("[HISTORY-DEMO] 창고 재고 5 EA 이상인 품목이 필요합니다.")
    return row


def _find_production_parent(db) -> Item:
    parent_ids = (
        db.query(BOM.parent_item_id)
        .distinct()
        .order_by(BOM.parent_item_id)
        .all()
    )
    for (parent_id,) in parent_ids:
        parent = db.query(Item).filter(Item.item_id == parent_id).first()
        if parent is None:
            continue
        requirements = merge_requirements(explode_bom(db, parent.item_id, DEMO_QUANTITY))
        if requirements and all(
            _location_qty(db, item_id, _item_department(db.query(Item).filter(Item.item_id == item_id).one()), LocationStatusEnum.PRODUCTION)
            >= quantity
            for item_id, quantity in requirements.items()
        ):
            return parent
    raise RuntimeError("[HISTORY-DEMO] 생산 가능한 BOM 품목을 찾지 못했습니다.")


def _find_conversion_pair(db) -> tuple[Item, Item]:
    rows = (
        db.query(Item)
        .filter(Item.process_type_code.in_(("PA", "AF", "AA")))
        .join(BOM, BOM.parent_item_id == Item.item_id)
        .distinct()
        .order_by(Item.process_type_code, Item.item_name)
        .all()
    )
    for source in rows:
        for target in rows:
            if source.item_id == target.item_id or source.process_type_code != target.process_type_code:
                continue
            try:
                preview = shipping_svc.component_change_preview_independent(
                    db, source.item_id, target.item_id, int(DEMO_QUANTITY), "BOM"
                )
            except shipping_svc.ShippingError:
                continue
            if preview["executable"]:
                return source, target
    raise RuntimeError("[HISTORY-DEMO] 실행 가능한 품목 전환 쌍을 찾지 못했습니다.")


def _find_shipping_pf(db) -> Item:
    rows = (
        db.query(Item)
        .filter(Item.process_type_code == "PF")
        .join(BOM, BOM.parent_item_id == Item.item_id)
        .distinct()
        .order_by(Item.item_name)
        .all()
    )
    for pf in rows:
        pa_children = (
            db.query(Item)
            .join(BOM, BOM.child_item_id == Item.item_id)
            .filter(BOM.parent_item_id == pf.item_id, Item.process_type_code == "PA")
            .all()
        )
        if any(_location_qty(db, pa.item_id, DepartmentEnum.SHIPPING, LocationStatusEnum.PRODUCTION) >= DEMO_QUANTITY for pa in pa_children):
            return pf
    raise RuntimeError("[HISTORY-DEMO] 출하 가능한 PF 품목을 찾지 못했습니다.")


def build_showcase_plan(db) -> ShowcasePlan:
    """DB를 변경하지 않고 모든 실제 업무 흐름의 후보를 고른다."""
    actor = _active_admin(db)
    source, target = _find_conversion_pair(db)
    return ShowcasePlan(
        actor=actor,
        general_item=_find_general_item(db),
        production_parent=_find_production_parent(db),
        conversion_source=source,
        conversion_target=target,
        shipping_pf=_find_shipping_pf(db),
    )


def _new_batch(db, plan: ShowcasePlan, marker: str, label: str, source_item: Item) -> tuple[IoBatch, IoBundle]:
    batch = IoBatch(
        work_type="history_demo",
        sub_type=label,
        status="draft",
        requester_employee_id=plan.actor.employee_id,
        requester_name=plan.actor.name,
        requester_department=plan.actor.department,
        reference_no=marker,
        notes=f"{marker} {label}",
        client_request_id=f"history-demo-{uuid.uuid4()}",
    )
    db.add(batch)
    db.flush()
    bundle = IoBundle(
        batch_id=batch.batch_id,
        source_kind="single",
        source_item_id=source_item.item_id,
        title_snapshot=source_item.item_name,
        quantity=DEMO_QUANTITY,
        expanded_level=1,
    )
    db.add(bundle)
    db.flush()
    return batch, bundle


def _run_io_line(
    db,
    plan: ShowcasePlan,
    marker: str,
    label: str,
    item: Item,
    *,
    direction: str,
    from_bucket: str,
    to_bucket: str,
    from_department: DepartmentEnum | None = None,
    to_department: DepartmentEnum | None = None,
) -> None:
    batch, bundle = _new_batch(db, plan, marker, label, item)
    line = IoLine(
        bundle_id=bundle.bundle_id,
        item_id=item.item_id,
        item_name_snapshot=item.item_name,
        mes_code_snapshot=item.mes_code,
        unit=item.unit or "EA",
        direction=direction,
        from_bucket=from_bucket,
        from_department=from_department.value if from_department else None,
        to_bucket=to_bucket,
        to_department=to_department.value if to_department else None,
        quantity=DEMO_QUANTITY,
        origin="history_demo",
    )
    db.add(line)
    db.flush()
    io_dispatch._apply_line(db, batch=batch, line=line, requester=plan.actor)
    batch.status = "completed"
    batch.completed_at = datetime.now(UTC).replace(tzinfo=None)
    db.flush()


def _run_basic_io(db, plan: ShowcasePlan, marker: str) -> None:
    item = plan.general_item
    assembly = DepartmentEnum.ASSEMBLY
    shipping = DepartmentEnum.SHIPPING
    _run_io_line(db, plan, marker, "supplier_receive", item, direction="in", from_bucket="none", to_bucket="warehouse")
    _run_io_line(db, plan, marker, "warehouse_ship", item, direction="out", from_bucket="warehouse", to_bucket="none")
    _run_io_line(db, plan, marker, "warehouse_to_dept", item, direction="move", from_bucket="warehouse", to_bucket="production", to_department=assembly)
    _run_io_line(db, plan, marker, "dept_to_warehouse", item, direction="move", from_bucket="production", to_bucket="warehouse", from_department=assembly)
    _run_io_line(db, plan, marker, "warehouse_to_dept_again", item, direction="move", from_bucket="warehouse", to_bucket="production", to_department=assembly)
    _run_io_line(db, plan, marker, "dept_transfer", item, direction="move", from_bucket="production", to_bucket="production", from_department=assembly, to_department=shipping)
    _run_io_line(db, plan, marker, "adjust_in", item, direction="adjust", from_bucket="none", to_bucket="production", to_department=assembly)
    _run_io_line(db, plan, marker, "adjust_out", item, direction="adjust", from_bucket="production", to_bucket="none", from_department=assembly)


def _run_production(db, plan: ShowcasePlan, marker: str) -> None:
    execute_production_receipt(
        db,
        ProductionReceiptRequest(
            item_id=plan.production_parent.item_id,
            quantity=1,
            reference_no=marker,
            produced_by=plan.actor.name,
            notes=f"{marker} BOM 생산",
        ),
        plan.production_parent,
        plan.actor.name,
        plan.actor.employee_id,
    )


def _run_conversion(db, plan: ShowcasePlan, marker: str) -> None:
    result = shipping_svc.execute_component_change_independent(
        db,
        plan.conversion_source.item_id,
        plan.conversion_target.item_id,
        1,
        memo=f"{marker} 품목 전환",
        requested_mode="BOM",
        requester_name=plan.actor.name,
        requester_employee_id=plan.actor.employee_id,
    )
    for log in result["transactions"]:
        log.notes = f"{log.notes or ''} {marker}".strip()


def _run_shipping(db, plan: ShowcasePlan, marker: str) -> None:
    request = shipping_svc.create_request(
        db,
        {
            "base_pf_item_id": plan.shipping_pf.item_id,
            "request_quantity": 1,
            "requested_by_name": plan.actor.name,
            "notes": f"{marker} 출하",
        },
    )
    shipping_svc.send_to_prep(db, request.request_id)
    shipping_svc.prepare_complete(db, request.request_id)
    shipping_svc.pickup_complete(db, request.request_id)
    logs = db.query(TransactionLog).filter(TransactionLog.shipping_request_id == request.request_id).all()
    for log in logs:
        log.notes = f"{log.notes or ''} {marker}".strip()


def _run_stock_request(
    db,
    plan: ShowcasePlan,
    marker: str,
    request_type: StockRequestTypeEnum,
    item: Item,
    *,
    from_bucket: RequestBucketEnum,
    to_bucket: RequestBucketEnum,
    from_department: DepartmentEnum | None = None,
    to_department: DepartmentEnum | None = None,
    notes: str | None = None,
) -> None:
    stock_requests.create_request(
        db,
        requester=plan.actor,
        request_type=request_type,
        lines_input=[
            stock_requests.LineInput(
                item_id=item.item_id,
                quantity=DEMO_QUANTITY,
                from_bucket=from_bucket,
                from_department=from_department,
                to_bucket=to_bucket,
                to_department=to_department,
            )
        ],
        reference_no=marker,
        notes=notes or marker,
        client_request_id=f"history-demo-{uuid.uuid4()}",
        reason_category=DEMO_REASON_CATEGORY,
        reason_memo=marker,
    )


def _run_unquarantine(db, plan: ShowcasePlan, marker: str, item: Item, department: DepartmentEnum) -> None:
    cells_before = inv_effect.snapshot_cells(db, item.item_id)
    before = inventory_svc.get_or_create_inventory(db, item.item_id).quantity
    inventory_svc.unmark_defective(
        db,
        item.item_id,
        DEMO_QUANTITY,
        department,
        inventory_svc.ReasonContext(category=DEMO_REASON_CATEGORY, memo=marker, actor=plan.actor.name),
    )
    db.flush()
    after = inventory_svc.get_or_create_inventory(db, item.item_id).quantity
    db.add(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.UNMARK_DEFECTIVE,
            quantity_change=Decimal("0"),
            quantity_before=before,
            quantity_after=after,
            produced_by=plan.actor.name,
            producer_employee_id=plan.actor.employee_id,
            reference_no=marker,
            notes=f"{marker} 정상 복귀",
            reason_category=DEMO_REASON_CATEGORY,
            reason_memo=marker,
            department=department.value,
            inventory_effect=inv_effect.capture_effect(db, item.item_id, cells_before),
        )
    )
    db.flush()


def _run_defects(db, plan: ShowcasePlan, marker: str) -> None:
    item = plan.general_item
    assembly = DepartmentEnum.ASSEMBLY
    _run_io_line(db, plan, marker, "defect_quarantine", item, direction="defective", from_bucket="warehouse", to_bucket="defective", to_department=assembly)
    _run_unquarantine(db, plan, marker, item, assembly)
    _run_io_line(db, plan, marker, "defect_quarantine_scrap", item, direction="defective", from_bucket="warehouse", to_bucket="defective", to_department=assembly)
    _run_stock_request(db, plan, marker, StockRequestTypeEnum.DEFECT_SCRAP, item, from_bucket=RequestBucketEnum.DEFECTIVE, to_bucket=RequestBucketEnum.NONE, from_department=assembly)
    _run_io_line(db, plan, marker, "defect_quarantine_return", item, direction="defective", from_bucket="warehouse", to_bucket="defective", to_department=assembly)
    _run_stock_request(db, plan, marker, StockRequestTypeEnum.DEFECT_RETURN, item, from_bucket=RequestBucketEnum.DEFECTIVE, to_bucket=RequestBucketEnum.NONE, from_department=assembly)
    _run_stock_request(db, plan, marker, StockRequestTypeEnum.SCRAP_NORMAL, item, from_bucket=RequestBucketEnum.WAREHOUSE, to_bucket=RequestBucketEnum.NONE)
    _run_stock_request(db, plan, marker, StockRequestTypeEnum.RETURN_NORMAL, item, from_bucket=RequestBucketEnum.WAREHOUSE, to_bucket=RequestBucketEnum.NONE)

    parent = plan.production_parent
    children = merge_requirements(explode_bom(db, parent.item_id, DEMO_QUANTITY))
    child_decisions = [
        {"item_id": str(item_id), "qty": "1", "normal_qty": "1", "defective_qty": "0", "scrap_qty": "0"}
        for item_id in children
    ]
    submit_normal_disassemble(
        db,
        parent.item_id,
        DEMO_QUANTITY,
        "production",
        _item_department(parent),
        child_decisions,
        reason_category=DEMO_REASON_CATEGORY,
        reason_memo=marker,
        actor=plan.actor.name,
        actor_employee_id=plan.actor.employee_id,
    )


def apply_showcase(db, marker: str | None = None) -> ShowcaseResult:
    """모든 시나리오를 실행한다. 실패하면 호출자에게 예외를 전달하기 전 롤백한다."""
    marker = marker or f"{DEMO_TAG}[{datetime.now(UTC):%Y%m%d-%H%M%S}]"
    try:
        plan = build_showcase_plan(db)
        previous_log_ids = {row.log_id for row in db.query(TransactionLog.log_id).all()}
        _run_basic_io(db, plan, marker)
        _run_production(db, plan, marker)
        _run_conversion(db, plan, marker)
        _run_shipping(db, plan, marker)
        _run_defects(db, plan, marker)
        logs = (
            db.query(TransactionLog)
            .filter(~TransactionLog.log_id.in_(previous_log_ids))
            .order_by(TransactionLog.created_at, TransactionLog.log_id)
            .all()
        )
        for log in logs:
            if marker not in (log.reference_no or ""):
                log.reference_no = f"{marker} | {log.reference_no}" if log.reference_no else marker
            if marker not in (log.notes or ""):
                log.notes = f"{log.notes or ''} {marker}".strip()
        db.flush()
        return ShowcaseResult(
            marker=marker,
            log_ids=[log.log_id for log in logs],
            transaction_types=sorted({log.transaction_type.value for log in logs}),
        )
    except Exception:
        db.rollback()
        raise


def _marker_logs(db, marker: str) -> list[TransactionLog]:
    return (
        db.query(TransactionLog)
        .filter(
            TransactionLog.reference_no.contains(marker)
            | TransactionLog.notes.contains(marker)
            | TransactionLog.reason_memo.contains(marker)
            | TransactionLog.reason_category.contains(marker)
        )
        .order_by(TransactionLog.created_at.desc(), TransactionLog.log_id.desc())
        .all()
    )


def _combined_effects(logs: list[TransactionLog]) -> tuple[dict[uuid.UUID, list[dict]], set[tuple[uuid.UUID, str, str]]]:
    cells_by_item: dict[uuid.UUID, dict[tuple[str, str, str], int]] = {}
    location_cells: set[tuple[uuid.UUID, str, str]] = set()
    for log in logs:
        cells = cells_by_item.setdefault(log.item_id, {})
        for effect in log.inventory_effect or []:
            scope = effect.get("scope")
            if scope == "location":
                value = str(effect["department"])
                status = str(effect["status"])
                location_cells.add((log.item_id, value, status))
            elif scope == "warehouse_box":
                value = str(effect["box_id"])
                status = ""
            else:
                scope, value, status = "warehouse", "", ""
            key = (scope, value, status)
            cells[key] = cells.get(key, 0) + int(effect["delta"])

    combined: dict[uuid.UUID, list[dict]] = {}
    for item_id, cells in cells_by_item.items():
        entries: list[dict] = []
        for (scope, value, status), delta in cells.items():
            if delta == 0:
                continue
            entry: dict = {"scope": scope, "delta": delta}
            if scope == "location":
                entry.update(department=value, status=status)
            elif scope == "warehouse_box":
                entry["box_id"] = value
            entries.append(entry)
        combined[item_id] = entries
    return combined, location_cells


def remove_showcase(db, marker: str) -> ShowcaseCleanupResult:
    """Remove one marked showcase run and reverse only its recorded inventory effects."""
    if not marker.startswith(DEMO_TAG):
        raise ValueError(f"{DEMO_TAG} marker is required for cleanup.")

    logs = _marker_logs(db, marker)
    if not logs:
        raise ValueError(f"No showcase logs found for marker: {marker}")

    batches = (
        db.query(IoBatch)
        .filter(IoBatch.reference_no.contains(marker) | IoBatch.notes.contains(marker))
        .all()
    )
    stock_requests = (
        db.query(StockRequest)
        .filter(
            StockRequest.reference_no.contains(marker)
            | StockRequest.notes.contains(marker)
            | StockRequest.reason_memo.contains(marker)
        )
        .all()
    )
    shipping_requests = db.query(ShippingRequest).filter(ShippingRequest.notes.contains(marker)).all()
    marked_ids = {log.log_id for log in logs}
    for batch in batches:
        attached = db.query(TransactionLog.log_id).filter(TransactionLog.operation_batch_id == batch.batch_id).all()
        if any(log_id not in marked_ids for (log_id,) in attached):
            raise ValueError(f"Unmarked transaction is attached to showcase batch: {batch.batch_id}")
    for request in shipping_requests:
        attached = db.query(TransactionLog.log_id).filter(TransactionLog.shipping_request_id == request.request_id).all()
        if any(log_id not in marked_ids for (log_id,) in attached):
            raise ValueError(f"Unmarked transaction is attached to showcase shipping request: {request.request_id}")

    effects, location_cells = _combined_effects(logs)
    for item_id, effect in effects.items():
        inv_effect.apply_effect_reverse(db, item_id, effect)
    db.flush()
    for item_id, department, status in location_cells:
        location = (
            db.query(InventoryLocation)
            .filter(
                InventoryLocation.item_id == item_id,
                InventoryLocation.department == department,
                InventoryLocation.status == LocationStatusEnum(status),
                InventoryLocation.quantity == 0,
            )
            .first()
        )
        if location is not None:
            db.delete(location)
    db.flush()
    for item_id in effects:
        inventory = db.query(Inventory).filter(Inventory.item_id == item_id).first()
        if inventory is not None:
            _sync_total(db, inventory)

    for log in logs:
        db.delete(log)
    db.flush()
    for batch in batches:
        db.delete(batch)
    for request in stock_requests:
        db.delete(request)
    for request in shipping_requests:
        db.delete(request)
    db.flush()

    return ShowcaseCleanupResult(
        marker=marker,
        log_count=len(logs),
        batch_count=len(batches),
        stock_request_count=len(stock_requests),
        shipping_request_count=len(shipping_requests),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="입출고 내역 실거래 검증 데이터 생성")
    parser.add_argument("--apply", action="store_true", help="실제 개발 DB에 반영")
    args = parser.parse_args()

    with SessionLocal() as db:
        plan = build_showcase_plan(db)
        print(f"{DEMO_TAG} 실행자: {plan.actor.name} ({plan.actor.employee_code})")
        print(f"일반: {plan.general_item.item_name}")
        print(f"생산: {plan.production_parent.item_name}")
        print(f"품목 전환: {plan.conversion_source.item_name} -> {plan.conversion_target.item_name}")
        print(f"출하: {plan.shipping_pf.item_name}")
        if not args.apply:
            print("dry-run 완료. 실제 반영: python scripts/dev/seed_history_showcase.py --apply")
            return 0
        result = apply_showcase(db)
        db.commit()
        print(f"검색어: {result.marker}")
        print(f"생성 로그: {len(result.log_ids)}건")
        print("거래 유형: " + ", ".join(result.transaction_types))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
