"""입출고 탭 2.0 orchestration service.

This layer keeps the new UX context (bundle/auto lines/excluded lines) while
delegating actual stock movement to the existing inventory and stock request
services.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional, Sequence

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    DepartmentEnum,
    Employee,
    InventoryLocation,
    IoBatch,
    IoBundle,
    IoLine,
    Item,
    LocationStatusEnum,
    RequestBucketEnum,
    ShipPackage,
    StockRequest,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services import bom as bom_svc
from app.services import inventory as inventory_svc
from app.services import stock_requests as stock_request_svc


WORK_TYPES = {"receive", "warehouse_io", "process", "ship", "defect"}
APPROVAL_SUB_TYPES = {"warehouse_to_dept", "dept_to_warehouse", "defect_quarantine"}
# 출하 권한 fallback 이름 set — warehouse_role(primary/deputy) / level=admin 외 추가 허용자.
# 운영 환경에선 SHIPPING_ALLOWED_NAMES 환경변수("이름1,이름2")로 override 가능.
# (TODO 후속: 권한 테이블/role 기반으로 완전 전환)
SHIPPING_ALLOWED_NAMES = {
    name.strip()
    for name in os.getenv("SHIPPING_ALLOWED_NAMES", "김건호,이필욱").split(",")
    if name.strip()
}


def _d(value) -> Decimal:
    return Decimal(str(value or "0"))


def _new_id() -> uuid.UUID:
    return uuid.uuid4()


def _enum_value(value) -> Optional[str]:
    if value is None:
        return None
    return getattr(value, "value", value)


def _get_item(db: Session, item_id: uuid.UUID) -> Item:
    item = db.query(Item).filter(Item.item_id == item_id).first()
    if item is None:
        raise ValueError(f"품목을 찾을 수 없습니다: {item_id}")
    return item


def _has_children(db: Session, item_id: uuid.UUID) -> bool:
    from app.models import BOM

    return (
        db.query(func.count(BOM.bom_id))
        .filter(BOM.parent_item_id == item_id)
        .scalar()
        or 0
    ) > 0


def _bucket_available(
    db: Session,
    *,
    item_id: uuid.UUID,
    bucket: str,
    department: Optional[str],
) -> Decimal:
    if bucket == "warehouse":
        inv = inventory_svc.get_or_create_inventory(db, item_id)
        return _d(inv.warehouse_qty) - _d(inv.pending_quantity)
    if bucket == "production" and department:
        loc = (
            db.query(InventoryLocation)
            .filter(
                InventoryLocation.item_id == item_id,
                InventoryLocation.department == department,
                InventoryLocation.status == LocationStatusEnum.PRODUCTION,
            )
            .first()
        )
        return _d(loc.quantity) if loc else Decimal("0")
    if bucket == "defective" and department:
        loc = (
            db.query(InventoryLocation)
            .filter(
                InventoryLocation.item_id == item_id,
                InventoryLocation.department == department,
                InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
            )
            .first()
        )
        return _d(loc.quantity) if loc else Decimal("0")
    return Decimal("0")


def _default_production_dept(item: Item, fallback: Optional[str]) -> str:
    if fallback:
        return fallback
    mapped = inventory_svc.dept_for_process_type(item.process_type_code)
    return _enum_value(mapped) or DepartmentEnum.ASSEMBLY.value


def _line_dict(
    db: Session,
    *,
    item: Item,
    quantity: Decimal,
    direction: str,
    from_bucket: str,
    from_department: Optional[str],
    to_bucket: str,
    to_department: Optional[str],
    origin: str,
    bom_expected: Optional[Decimal] = None,
    included: bool = True,
    edited: bool = False,
    exclusion_note: Optional[str] = None,
) -> dict:
    shortage = Decimal("0")
    if from_bucket != "none":
        available = _bucket_available(
            db,
            item_id=item.item_id,
            bucket=from_bucket,
            department=from_department,
        )
        shortage = max(Decimal("0"), quantity - available)
    return {
        "line_id": _new_id(),
        "item_id": item.item_id,
        "item_name": item.item_name,
        "erp_code": item.erp_code,
        "unit": item.unit,
        "direction": direction,
        "from_bucket": from_bucket,
        "from_department": from_department,
        "to_bucket": to_bucket,
        "to_department": to_department,
        "quantity": quantity,
        "bom_expected": bom_expected,
        "included": included,
        "origin": origin,
        "edited": edited,
        "has_children": _has_children(db, item.item_id),
        "shortage": shortage,
        "exclusion_note": exclusion_note,
    }


def _route_for_sub_type(
    sub_type: str,
    *,
    item: Item,
    from_department: Optional[str],
    to_department: Optional[str],
    role: str = "component",
) -> tuple[str, str, Optional[str], str, Optional[str]]:
    if sub_type == "receive_supplier":
        return ("in", "none", None, "warehouse", None)
    if sub_type == "warehouse_to_dept":
        return ("move", "warehouse", None, "production", to_department)
    if sub_type == "dept_to_warehouse":
        return ("move", "production", from_department, "warehouse", None)
    if sub_type == "produce":
        dept = _default_production_dept(item, to_department or from_department)
        if role == "result":
            return ("in", "none", None, "production", dept)
        return ("out", "production", dept, "none", None)
    if sub_type == "disassemble":
        dept = _default_production_dept(item, from_department or to_department)
        if role == "result":
            return ("out", "production", dept, "none", None)
        return ("in", "none", None, "production", dept)
    if sub_type == "dept_transfer":
        return ("move", "production", from_department, "production", to_department)
    if sub_type == "adjust":
        dept = _default_production_dept(item, to_department or from_department)
        return ("adjust", "none", None, "production", dept)
    if sub_type == "ship":
        return ("out", "production", DepartmentEnum.SHIPPING.value, "none", None)
    if sub_type == "defect_quarantine":
        target = to_department or from_department or DepartmentEnum.ASSEMBLY.value
        return ("defective", "warehouse", None, "defective", target)
    if sub_type == "supplier_return":
        source = from_department or to_department or DepartmentEnum.ASSEMBLY.value
        return ("out", "defective", source, "none", None)
    raise ValueError(f"지원하지 않는 세부 작업입니다: {sub_type}")


def _direct_item_bundle(
    db: Session,
    *,
    item: Item,
    quantity: Decimal,
    work_type: str,
    sub_type: str,
    from_department: Optional[str],
    to_department: Optional[str],
    source_kind: str = "direct_item",
) -> dict:
    children = bom_svc.direct_children(db, item.item_id)
    should_expand = (
        source_kind != "manual"
        and children
        and (
            sub_type in {"warehouse_to_dept", "dept_to_warehouse", "dept_transfer"}
            or sub_type in {"produce", "disassemble"}
        )
    )
    bundle = {
        "bundle_id": _new_id(),
        "source_kind": "bom_parent" if should_expand else source_kind,
        "title": item.item_name,
        "source_item_id": item.item_id,
        "package_id": None,
        "quantity": quantity,
        "expanded_level": 1,
        "lines": [],
    }

    if sub_type == "produce":
        for child_id, per_unit_qty in children:
            child = _get_item(db, child_id)
            required = _d(per_unit_qty) * quantity
            route = _route_for_sub_type(
                sub_type,
                item=child,
                from_department=from_department,
                to_department=to_department,
                role="component",
            )
            bundle["lines"].append(
                _line_dict(
                    db,
                    item=child,
                    quantity=required,
                    direction=route[0],
                    from_bucket=route[1],
                    from_department=route[2],
                    to_bucket=route[3],
                    to_department=route[4],
                    origin="bom_auto",
                    bom_expected=required,
                )
            )
        route = _route_for_sub_type(
            sub_type,
            item=item,
            from_department=from_department,
            to_department=to_department,
            role="result",
        )
        bundle["lines"].append(
            _line_dict(
                db,
                item=item,
                quantity=quantity,
                direction=route[0],
                from_bucket=route[1],
                from_department=route[2],
                to_bucket=route[3],
                to_department=route[4],
                origin="direct",
            )
        )
        return bundle

    if sub_type == "disassemble":
        route = _route_for_sub_type(
            sub_type,
            item=item,
            from_department=from_department,
            to_department=to_department,
            role="result",
        )
        bundle["lines"].append(
            _line_dict(
                db,
                item=item,
                quantity=quantity,
                direction=route[0],
                from_bucket=route[1],
                from_department=route[2],
                to_bucket=route[3],
                to_department=route[4],
                origin="direct",
            )
        )
        for child_id, per_unit_qty in children:
            child = _get_item(db, child_id)
            recovered = _d(per_unit_qty) * quantity
            route = _route_for_sub_type(
                sub_type,
                item=child,
                from_department=from_department,
                to_department=to_department,
                role="component",
            )
            bundle["lines"].append(
                _line_dict(
                    db,
                    item=child,
                    quantity=recovered,
                    direction=route[0],
                    from_bucket=route[1],
                    from_department=route[2],
                    to_bucket=route[3],
                    to_department=route[4],
                    origin="bom_auto",
                    bom_expected=recovered,
                    exclusion_note="회수 안 됨",
                )
            )
        return bundle

    if should_expand:
        for child_id, per_unit_qty in children:
            child = _get_item(db, child_id)
            required = _d(per_unit_qty) * quantity
            route = _route_for_sub_type(
                sub_type,
                item=child,
                from_department=from_department,
                to_department=to_department,
            )
            bundle["lines"].append(
                _line_dict(
                    db,
                    item=child,
                    quantity=required,
                    direction=route[0],
                    from_bucket=route[1],
                    from_department=route[2],
                    to_bucket=route[3],
                    to_department=route[4],
                    origin="bom_auto",
                    bom_expected=required,
                )
            )
        return bundle

    route = _route_for_sub_type(
        sub_type,
        item=item,
        from_department=from_department,
        to_department=to_department,
    )
    bundle["lines"].append(
        _line_dict(
            db,
            item=item,
            quantity=quantity,
            direction=route[0],
            from_bucket=route[1],
            from_department=route[2],
            to_bucket=route[3],
            to_department=route[4],
            origin="manual" if source_kind == "manual" else "direct",
        )
    )
    return bundle


def _package_bundle(
    db: Session,
    *,
    package: ShipPackage,
    quantity: Decimal,
) -> dict:
    bundle = {
        "bundle_id": _new_id(),
        "source_kind": "ship_package",
        "title": package.name,
        "source_item_id": None,
        "package_id": package.package_id,
        "quantity": quantity,
        "expanded_level": 1,
        "lines": [],
    }
    for package_item in package.items:
        item = package_item.item
        qty = _d(package_item.quantity) * quantity
        route = _route_for_sub_type(
            "ship",
            item=item,
            from_department=None,
            to_department=None,
        )
        bundle["lines"].append(
            _line_dict(
                db,
                item=item,
                quantity=qty,
                direction=route[0],
                from_bucket=route[1],
                from_department=route[2],
                to_bucket=route[3],
                to_department=route[4],
                origin="package_auto",
                bom_expected=qty,
            )
        )
    return bundle


def preview(
    db: Session,
    *,
    work_type: str,
    sub_type: str,
    targets: Sequence,
    from_department: Optional[str] = None,
    to_department: Optional[str] = None,
) -> dict:
    if work_type not in WORK_TYPES:
        raise ValueError(f"지원하지 않는 작업 유형입니다: {work_type}")
    bundles: list[dict] = []
    for target in targets:
        source_kind = getattr(target, "source_kind", "direct_item")
        qty = _d(getattr(target, "quantity", Decimal("1")))
        if source_kind == "ship_package" or getattr(target, "package_id", None):
            package_id = getattr(target, "package_id", None)
            package = db.query(ShipPackage).filter(ShipPackage.package_id == package_id).first()
            if package is None:
                raise ValueError(f"출하 패키지를 찾을 수 없습니다: {package_id}")
            bundles.append(_package_bundle(db, package=package, quantity=qty))
            continue

        item_id = getattr(target, "item_id", None)
        if item_id is None:
            raise ValueError("품목 선택 정보가 없습니다.")
        item = _get_item(db, item_id)
        bundles.append(
            _direct_item_bundle(
                db,
                item=item,
                quantity=qty,
                work_type=work_type,
                sub_type=sub_type,
                from_department=from_department,
                to_department=to_department,
                source_kind=source_kind,
            )
        )
    return {
        "work_type": work_type,
        "sub_type": sub_type,
        "requires_approval": sub_type in APPROVAL_SUB_TYPES,
        "bundles": bundles,
    }


def _batch_to_payload(batch: IoBatch) -> dict:
    return {
        "batch_id": batch.batch_id,
        "work_type": batch.work_type,
        "sub_type": batch.sub_type,
        "status": batch.status,
        "requester_employee_id": batch.requester_employee_id,
        "requester_name": batch.requester_name,
        "requester_department": batch.requester_department,
        "from_department": batch.from_department,
        "to_department": batch.to_department,
        "requires_approval": batch.requires_approval,
        "stock_request_id": batch.stock_request_id,
        "reference_no": batch.reference_no,
        "notes": batch.notes,
        "created_at": batch.created_at,
        "updated_at": batch.updated_at,
        "submitted_at": batch.submitted_at,
        "completed_at": batch.completed_at,
        "bundles": [
            {
                "bundle_id": bundle.bundle_id,
                "source_kind": bundle.source_kind,
                "title": bundle.title_snapshot,
                "source_item_id": bundle.source_item_id,
                "package_id": bundle.package_id,
                "quantity": bundle.quantity,
                "expanded_level": bundle.expanded_level,
                "lines": [
                    {
                        "line_id": line.line_id,
                        "item_id": line.item_id,
                        "item_name": line.item_name_snapshot,
                        "erp_code": line.erp_code_snapshot,
                        "unit": line.unit,
                        "direction": line.direction,
                        "from_bucket": line.from_bucket,
                        "from_department": line.from_department,
                        "to_bucket": line.to_bucket,
                        "to_department": line.to_department,
                        "quantity": line.quantity,
                        "bom_expected": line.bom_expected,
                        "included": line.included,
                        "origin": line.origin,
                        "edited": line.edited,
                        "has_children": line.has_children_snapshot,
                        "shortage": line.shortage,
                        "exclusion_note": line.exclusion_note,
                    }
                    for line in bundle.lines
                ],
            }
            for bundle in batch.bundles
        ],
    }


def _persist_batch(
    db: Session,
    *,
    requester: Employee,
    payload,
    status: str,
    submitted_at: Optional[datetime] = None,
) -> IoBatch:
    now = datetime.utcnow()
    batch = IoBatch(
        batch_id=_new_id(),
        work_type=payload.work_type,
        sub_type=payload.sub_type,
        status=status,
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department=_enum_value(requester.department) or "",
        from_department=payload.from_department,
        to_department=payload.to_department,
        requires_approval=payload.sub_type in APPROVAL_SUB_TYPES,
        reference_no=payload.reference_no,
        notes=payload.notes,
        submitted_at=submitted_at,
        created_at=now,
        updated_at=now,
    )
    db.add(batch)
    db.flush()

    for incoming_bundle in payload.bundles:
        bundle = IoBundle(
            bundle_id=incoming_bundle.bundle_id,
            batch_id=batch.batch_id,
            source_kind=incoming_bundle.source_kind,
            source_item_id=incoming_bundle.source_item_id,
            package_id=incoming_bundle.package_id,
            title_snapshot=incoming_bundle.title,
            quantity=incoming_bundle.quantity,
            expanded_level=incoming_bundle.expanded_level,
        )
        db.add(bundle)
        db.flush()
        for incoming_line in incoming_bundle.lines:
            db.add(
                IoLine(
                    line_id=incoming_line.line_id,
                    bundle_id=bundle.bundle_id,
                    item_id=incoming_line.item_id,
                    item_name_snapshot=incoming_line.item_name,
                    erp_code_snapshot=incoming_line.erp_code,
                    unit=incoming_line.unit,
                    direction=incoming_line.direction,
                    from_bucket=incoming_line.from_bucket,
                    from_department=incoming_line.from_department,
                    to_bucket=incoming_line.to_bucket,
                    to_department=incoming_line.to_department,
                    quantity=incoming_line.quantity,
                    bom_expected=incoming_line.bom_expected,
                    included=incoming_line.included,
                    origin=incoming_line.origin,
                    edited=incoming_line.edited,
                    has_children_snapshot=incoming_line.has_children,
                    shortage=incoming_line.shortage,
                    exclusion_note=incoming_line.exclusion_note,
                )
            )
    db.flush()
    db.refresh(batch)
    return batch


def _load_requester(db: Session, employee_id: uuid.UUID) -> Employee:
    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if employee is None:
        raise ValueError("요청자 직원을 찾을 수 없습니다.")
    if not bool(employee.is_active):
        raise PermissionError("비활성 직원은 입출고 작업을 제출할 수 없습니다.")
    return employee


def save_draft(db: Session, payload) -> dict:
    requester = _load_requester(db, payload.requester_employee_id)
    existing = (
        db.query(IoBatch)
        .filter(
            IoBatch.requester_employee_id == requester.employee_id,
            IoBatch.work_type == payload.work_type,
            IoBatch.sub_type == payload.sub_type,
            IoBatch.status == "draft",
        )
        .first()
    )
    if existing is not None:
        db.delete(existing)
        db.flush()
    batch = _persist_batch(db, requester=requester, payload=payload, status="draft")
    return _batch_to_payload(batch)


def get_draft(
    db: Session,
    *,
    requester_employee_id: uuid.UUID,
    work_type: str,
    sub_type: Optional[str] = None,
) -> Optional[dict]:
    query = db.query(IoBatch).filter(
        IoBatch.requester_employee_id == requester_employee_id,
        IoBatch.work_type == work_type,
        IoBatch.status == "draft",
    )
    if sub_type:
        query = query.filter(IoBatch.sub_type == sub_type)
    batch = query.order_by(IoBatch.updated_at.desc()).first()
    return _batch_to_payload(batch) if batch else None


def list_drafts(db: Session, *, requester_employee_id: uuid.UUID) -> list[dict]:
    rows = (
        db.query(IoBatch)
        .filter(
            IoBatch.requester_employee_id == requester_employee_id,
            IoBatch.status == "draft",
        )
        .order_by(IoBatch.updated_at.desc())
        .all()
    )
    return [_batch_to_payload(row) for row in rows]


def delete_draft(db: Session, *, batch_id: uuid.UUID, requester_employee_id: uuid.UUID) -> None:
    batch = db.query(IoBatch).filter(IoBatch.batch_id == batch_id).first()
    if batch is None:
        raise ValueError("임시저장 작업을 찾을 수 없습니다.")
    if batch.requester_employee_id != requester_employee_id:
        raise PermissionError("본인 임시저장 작업만 삭제할 수 있습니다.")
    if batch.status != "draft":
        raise ValueError("임시저장 상태가 아닙니다.")
    db.delete(batch)
    db.flush()


def _included_lines(batch: IoBatch) -> list[IoLine]:
    return [line for bundle in batch.bundles for line in bundle.lines if line.included]


def _validate_included_lines(db: Session, lines: Sequence[IoLine]) -> None:
    if not lines:
        raise ValueError("실제 반영할 품목이 없습니다.")
    needed: dict[tuple[str, Optional[str], uuid.UUID], Decimal] = {}
    for line in lines:
        qty = _d(line.quantity)
        if qty <= 0:
            raise ValueError("체크된 라인의 수량은 0보다 커야 합니다.")
        if line.from_bucket == "none":
            continue
        key = (line.from_bucket, line.from_department, line.item_id)
        needed[key] = needed.get(key, Decimal("0")) + qty
    for (bucket, department, item_id), qty in needed.items():
        available = _bucket_available(db, item_id=item_id, bucket=bucket, department=department)
        if available < qty:
            item = _get_item(db, item_id)
            raise ValueError(
                f"재고 부족: {item.item_name} / 가능 {available} / 요청 {qty}"
            )


def _stock_request_type(sub_type: str) -> StockRequestTypeEnum:
    if sub_type == "warehouse_to_dept":
        return StockRequestTypeEnum.WAREHOUSE_TO_DEPT
    if sub_type == "dept_to_warehouse":
        return StockRequestTypeEnum.DEPT_TO_WAREHOUSE
    if sub_type == "defect_quarantine":
        return StockRequestTypeEnum.MARK_DEFECTIVE_WH
    raise ValueError(f"승인 요청으로 처리할 수 없는 작업입니다: {sub_type}")


def _request_bucket(value: str) -> RequestBucketEnum:
    return RequestBucketEnum(value)


def _link_stock_request(db: Session, *, batch: IoBatch, request: StockRequest, lines: Sequence[IoLine]) -> None:
    request.operation_batch_id = batch.batch_id
    batch.stock_request_id = request.request_id
    batch.requires_approval = request.requires_warehouse_approval
    if request.status == StockRequestStatusEnum.COMPLETED:
        batch.status = "completed"
        batch.completed_at = request.completed_at or datetime.utcnow()
    elif request.status == StockRequestStatusEnum.RESERVED:
        batch.status = "reserved"
    else:
        batch.status = "submitted"

    included_by_order = list(lines)
    for request_line, io_line in zip(request.lines, included_by_order):
        request_line.operation_line_id = io_line.line_id

    if request.request_code:
        db.query(TransactionLog).filter(
            TransactionLog.reference_no == request.request_code,
            TransactionLog.operation_batch_id.is_(None),
        ).update(
            {TransactionLog.operation_batch_id: batch.batch_id},
            synchronize_session=False,
        )
    db.flush()


def _submit_approval(db: Session, *, requester: Employee, batch: IoBatch) -> None:
    lines = _included_lines(batch)
    _validate_included_lines(db, lines)
    inputs = [
        stock_request_svc.LineInput(
            item_id=line.item_id,
            quantity=line.quantity,
            from_bucket=_request_bucket(line.from_bucket),
            from_department=line.from_department,
            to_bucket=_request_bucket(line.to_bucket),
            to_department=line.to_department,
        )
        for line in lines
    ]
    request = stock_request_svc.create_request(
        db,
        requester=requester,
        request_type=_stock_request_type(batch.sub_type),
        lines_input=inputs,
        reference_no=batch.reference_no,
        notes=batch.notes,
    )
    _link_stock_request(db, batch=batch, request=request, lines=lines)


def _log_immediate(
    db: Session,
    *,
    batch: IoBatch,
    line: IoLine,
    tx_type: TransactionTypeEnum,
    quantity_change: Decimal,
    before: Decimal,
    after: Decimal,
    operator_name: str,
) -> None:
    db.add(
        TransactionLog(
            item_id=line.item_id,
            transaction_type=tx_type,
            quantity_change=quantity_change,
            quantity_before=before,
            quantity_after=after,
            transfer_qty=line.quantity if line.direction == "move" else None,
            reference_no=batch.reference_no or str(batch.batch_id)[:8],
            produced_by=operator_name,
            notes=f"입출고 2.0 즉시 처리: {batch.work_type}/{batch.sub_type}",
            operation_batch_id=batch.batch_id,
        )
    )


def _apply_line(db: Session, *, batch: IoBatch, line: IoLine, requester: Employee) -> None:
    qty = _d(line.quantity)
    inv = inventory_svc.get_or_create_inventory(db, line.item_id)
    before = _d(inv.quantity)
    tx_type = TransactionTypeEnum.ADJUST
    quantity_change = Decimal("0")

    if line.direction == "in":
        bucket = "production" if line.to_bucket == "production" else "warehouse"
        inventory_svc.receive_confirmed(
            db,
            line.item_id,
            qty,
            bucket=bucket,
            dept=line.to_department,
        )
        tx_type = TransactionTypeEnum.PRODUCE if bucket == "production" else TransactionTypeEnum.RECEIVE
        quantity_change = qty
    elif line.direction == "out":
        if line.from_bucket == "warehouse":
            inventory_svc.consume_warehouse(db, line.item_id, qty)
            tx_type = TransactionTypeEnum.SHIP
        elif line.from_bucket == "defective":
            inventory_svc.return_to_supplier(db, line.item_id, qty, line.from_department)
            tx_type = TransactionTypeEnum.SUPPLIER_RETURN
        else:
            inventory_svc.consume_from_department(db, line.item_id, qty, line.from_department)
            tx_type = TransactionTypeEnum.SHIP if batch.sub_type == "ship" else TransactionTypeEnum.BACKFLUSH
        quantity_change = -qty
    elif line.direction == "move":
        if line.from_bucket == "production" and line.to_bucket == "production":
            inventory_svc.transfer_between_departments(
                db, line.item_id, qty, line.from_department, line.to_department
            )
            tx_type = TransactionTypeEnum.TRANSFER_DEPT
        elif line.from_bucket == "warehouse":
            inventory_svc.transfer_to_production(db, line.item_id, qty, line.to_department)
            tx_type = TransactionTypeEnum.TRANSFER_TO_PROD
        else:
            inventory_svc.transfer_to_warehouse(db, line.item_id, qty, line.from_department)
            tx_type = TransactionTypeEnum.TRANSFER_TO_WH
    elif line.direction == "defective":
        inventory_svc.mark_defective(
            db,
            line.item_id,
            qty,
            source=line.from_bucket,
            source_dept=line.from_department,
            target_dept=line.to_department,
        )
        tx_type = TransactionTypeEnum.MARK_DEFECTIVE
    elif line.direction == "adjust":
        inventory_svc.receive_confirmed(
            db,
            line.item_id,
            qty,
            bucket="production" if line.to_bucket == "production" else "warehouse",
            dept=line.to_department,
        )
        tx_type = TransactionTypeEnum.ADJUST
        quantity_change = qty
    else:
        raise ValueError(f"지원하지 않는 라인 방향입니다: {line.direction}")

    db.flush()
    inv = inventory_svc.get_or_create_inventory(db, line.item_id)
    after = _d(inv.quantity)
    _log_immediate(
        db,
        batch=batch,
        line=line,
        tx_type=tx_type,
        quantity_change=quantity_change,
        before=before,
        after=after,
        operator_name=requester.name,
    )


def _can_ship(requester: Employee) -> bool:
    role = (requester.warehouse_role or "none").lower()
    level = getattr(getattr(requester, "level", None), "value", requester.level)
    return requester.name in SHIPPING_ALLOWED_NAMES or role in {"primary", "deputy"} or level == "admin"


def _submit_immediate(db: Session, *, requester: Employee, batch: IoBatch) -> None:
    if batch.sub_type == "ship" and not _can_ship(requester):
        raise PermissionError("출하 작업 권한이 없습니다.")
    lines = _included_lines(batch)
    _validate_included_lines(db, lines)
    for line in sorted(lines, key=lambda line: 0 if line.direction == "out" else 1):
        _apply_line(db, batch=batch, line=line, requester=requester)
    now = datetime.utcnow()
    batch.status = "completed"
    batch.completed_at = now
    batch.updated_at = now
    db.flush()


def _execute_submission(db: Session, *, requester: Employee, batch: IoBatch) -> dict:
    try:
        if batch.sub_type in APPROVAL_SUB_TYPES:
            _submit_approval(db, requester=requester, batch=batch)
        else:
            _submit_immediate(db, requester=requester, batch=batch)
    except Exception:
        batch.status = "failed"
        db.flush()
        raise

    message = "승인 요청이 생성되었습니다." if batch.status in {"submitted", "reserved"} else "입출고가 반영되었습니다."
    return {
        "batch": _batch_to_payload(batch),
        "status": batch.status,
        "requires_approval": batch.requires_approval,
        "stock_request_id": batch.stock_request_id,
        "message": message,
    }


def submit(db: Session, payload) -> dict:
    requester = _load_requester(db, payload.requester_employee_id)
    batch = _persist_batch(
        db,
        requester=requester,
        payload=payload,
        status="submitted",
        submitted_at=datetime.utcnow(),
    )
    return _execute_submission(db, requester=requester, batch=batch)


def submit_existing_draft(
    db: Session,
    *,
    batch_id: uuid.UUID,
    requester_employee_id: uuid.UUID,
) -> dict:
    """저장된 draft를 재제출. 새 batch 생성 없이 기존 라인을 그대로 실행."""
    batch = db.query(IoBatch).filter(IoBatch.batch_id == batch_id).first()
    if batch is None:
        raise ValueError("작업 묶음을 찾을 수 없습니다.")
    if batch.requester_employee_id != requester_employee_id:
        raise PermissionError("본인 임시저장 작업만 제출할 수 있습니다.")
    if batch.status != "draft":
        raise ValueError("임시저장 상태가 아닙니다.")
    requester = _load_requester(db, requester_employee_id)
    batch.status = "submitted"
    batch.submitted_at = datetime.utcnow()
    db.flush()
    return _execute_submission(db, requester=requester, batch=batch)


def get_batch(db: Session, *, batch_id: uuid.UUID) -> Optional[dict]:
    batch = db.query(IoBatch).filter(IoBatch.batch_id == batch_id).first()
    return _batch_to_payload(batch) if batch else None


def sync_batch_from_stock_request(db: Session, request: StockRequest) -> None:
    batch_id = getattr(request, "operation_batch_id", None)
    if not batch_id:
        return
    batch = db.query(IoBatch).filter(IoBatch.batch_id == batch_id).first()
    if batch is None:
        return
    if request.status == StockRequestStatusEnum.COMPLETED:
        batch.status = "completed"
        batch.completed_at = request.completed_at or datetime.utcnow()
    elif request.status == StockRequestStatusEnum.REJECTED:
        batch.status = "rejected"
    elif request.status == StockRequestStatusEnum.CANCELLED:
        batch.status = "cancelled"
    elif request.status == StockRequestStatusEnum.FAILED_APPROVAL:
        batch.status = "failed"
    elif request.status == StockRequestStatusEnum.RESERVED:
        batch.status = "reserved"
    else:
        batch.status = "submitted"
    batch.updated_at = datetime.utcnow()
    db.flush()
