"""재고·취소 원장의 불변식을 변경 없이 진단한다."""

from __future__ import annotations

import hashlib
from collections import Counter, defaultdict
from datetime import datetime
from decimal import Decimal
from typing import Iterable, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    DefectInventoryMovement,
    DefectQuarantineRecord,
    HandoverDoc,
    Inventory,
    InventoryLocation,
    InventoryOperation,
    InventoryOperationEffect,
    InventoryOperationEffectKindEnum,
    InventoryOperationKindEnum,
    IoBatch,
    Item,
    LocationStatusEnum,
    ShippingAllocation,
    ShippingRequest,
    StockRequest,
    StockRequestLine,
    TransactionLog,
    WarehouseAngle,
    WarehouseBox,
    WarehouseBoxItem,
    WarehouseSpecialZone,
    WarehouseSpecialZoneItem,
    WarehouseUnplacedItem,
)
from app.schemas.inventory_integrity import (
    InventoryIntegrityCheck,
    InventoryIntegrityCategory,
    InventoryIntegrityIssue,
    InventoryIntegrityResponse,
)
from app.services.inventory_integrity_engine import (
    IntegrityFinding,
    InventoryIntegritySnapshot,
    InventoryState,
    LocationState,
    OperationEvidenceState,
    OperationState,
    ShippingAllocationState,
    ShippingRequestState,
    StockRequestLineState,
    StockRequestState,
    TransactionEffectState,
    WarehouseBoxState,
    WarehousePlacementState,
    evaluate_inventory_integrity,
)
from app.services.inventory_operations import cutover_at
from app.services.weekly_report_contract import (
    FINISHED_CODES,
    WeeklyActivityClassificationError,
    classify_inventory_activity,
)


CATEGORIES: tuple[InventoryIntegrityCategory, ...] = (
    "DEFECT_STOCK_MISMATCH",
    "PARTIAL_CANCELLATION",
    "WORKFLOW_STATE_RESIDUE",
    "SHIPPING_ALLOCATION_MISMATCH",
    "DUPLICATE_REVERSAL",
    "WEEKLY_UNCLASSIFIED_EFFECT",
)


def _quantity_text(value: object) -> str:
    quantity = Decimal(str(value or 0))
    if quantity == quantity.to_integral_value():
        return str(int(quantity))
    return format(quantity.normalize(), "f")


def _problem_id(category: str, *parts: object) -> str:
    """변하지 않는 원인 키로 같은 문제에 같은 식별자를 부여한다."""
    source = "|".join([category, *(str(part) for part in parts)])
    digest = hashlib.sha256(source.encode("utf-8")).hexdigest()[:16].upper()
    return f"INT-{digest}"


def _issue(
    *,
    category: str,
    identity: Iterable[object],
    title: str,
    description: str,
    cause_ids: Iterable[object],
    current_value: str,
    expected_value: str,
    repairable: bool,
) -> InventoryIntegrityIssue:
    return InventoryIntegrityIssue(
        problem_id=_problem_id(category, *identity),
        category=category,
        title=title,
        description=description,
        cause_ids=[str(value) for value in cause_ids],
        current_value=current_value,
        expected_value=expected_value,
        repairable=repairable,
    )


def _defect_stock_issues(db: Session) -> list[InventoryIntegrityIssue]:
    physical = {
        (str(item_id), str(department)): Decimal(str(quantity or 0))
        for item_id, department, quantity in (
            db.query(
                InventoryLocation.item_id,
                InventoryLocation.department,
                func.sum(InventoryLocation.quantity),
            )
            .filter(InventoryLocation.status == LocationStatusEnum.DEFECTIVE)
            .group_by(InventoryLocation.item_id, InventoryLocation.department)
            .all()
        )
    }
    records_by_key: dict[tuple[str, str], list[DefectQuarantineRecord]] = defaultdict(list)
    for record in db.query(DefectQuarantineRecord).all():
        records_by_key[(str(record.item_id), str(record.department))].append(record)

    issues: list[InventoryIntegrityIssue] = []
    for item_id, department in sorted(set(physical) | set(records_by_key)):
        physical_quantity = physical.get((item_id, department), Decimal("0"))
        records = records_by_key.get((item_id, department), [])
        ledger_quantity = sum(
            (Decimal(str(record.remaining_quantity or 0)) for record in records),
            Decimal("0"),
        )
        if physical_quantity == ledger_quantity:
            continue
        record_ids = sorted(str(record.record_id) for record in records)
        issues.append(
            _issue(
                category="DEFECT_STOCK_MISMATCH",
                identity=(item_id, department),
                title="불량 원장과 실제 불량재고 불일치",
                description=f"{department}의 품목별 불량 위치 수량과 활성 불량 원장 합계가 다릅니다.",
                cause_ids=(item_id, department, *record_ids),
                current_value=(
                    f"불량 위치 {_quantity_text(physical_quantity)} EA / "
                    f"활성 불량 원장 {_quantity_text(ledger_quantity)} EA"
                ),
                expected_value="불량 위치와 활성 불량 원장을 같은 수량으로 정정",
                repairable=False,
            )
        )

    movement_totals = {
        str(record_id): Decimal(str(quantity or 0))
        for record_id, quantity in (
            db.query(
                DefectInventoryMovement.record_id,
                func.sum(DefectInventoryMovement.quantity_delta),
            )
            .group_by(DefectInventoryMovement.record_id)
            .all()
        )
    }
    for record_id, movement_total in sorted(movement_totals.items()):
        record = db.get(DefectQuarantineRecord, record_id)
        if record is None:
            continue
        remaining = Decimal(str(record.remaining_quantity or 0))
        if remaining == movement_total:
            continue
        issues.append(
            _issue(
                category="DEFECT_STOCK_MISMATCH",
                identity=("movement", record_id),
                title="불량 이동 원장 투영값 불일치",
                description="append-only 불량 이동 합계와 격리 건의 잔량 투영값이 다릅니다.",
                cause_ids=(record_id,),
                current_value=(
                    f"격리 잔량 {_quantity_text(remaining)} EA / "
                    f"이동 합계 {_quantity_text(movement_total)} EA"
                ),
                expected_value="불량 이동 합계와 격리 잔량을 같은 수량으로 정정",
                repairable=False,
            )
        )
    return issues


def _reversal_log_is_valid(original: TransactionLog, reversal: TransactionLog) -> bool:
    return (
        reversal.item_id == original.item_id
        and reversal.transaction_type == original.transaction_type
        and Decimal(str(reversal.quantity_change or 0))
        == -Decimal(str(original.quantity_change or 0))
        and reversal.operation_role == original.operation_role
    )


def _reversal_movement_is_valid(
    original: DefectInventoryMovement,
    reversal: DefectInventoryMovement,
) -> bool:
    return (
        reversal.record_id == original.record_id
        and reversal.item_id == original.item_id
        and reversal.department == original.department
        and Decimal(str(reversal.quantity_delta or 0))
        == -Decimal(str(original.quantity_delta or 0))
    )


def _partial_cancellation_issues(db: Session) -> list[InventoryIntegrityIssue]:
    issues: list[InventoryIntegrityIssue] = []
    cancellations = (
        db.query(InventoryOperation)
        .filter(InventoryOperation.kind == InventoryOperationKindEnum.CANCELLATION)
        .all()
    )
    for cancellation in cancellations:
        original = db.get(InventoryOperation, cancellation.reverses_operation_id)
        if original is None:
            issues.append(
                _issue(
                    category="PARTIAL_CANCELLATION",
                    identity=(cancellation.operation_id, "missing-original"),
                    title="원 작업이 없는 취소 작업",
                    description="취소 작업이 참조하는 원 작업을 찾을 수 없습니다.",
                    cause_ids=(cancellation.operation_id,),
                    current_value="원 작업 없음",
                    expected_value="유효한 원 작업과 완전한 역전 묶음",
                    repairable=False,
                )
            )
            continue

        original_logs = db.query(TransactionLog).filter(
            TransactionLog.operation_id == original.operation_id
        ).all()
        reversal_logs = db.query(TransactionLog).filter(
            TransactionLog.operation_id == cancellation.operation_id
        ).all()
        original_movements = db.query(DefectInventoryMovement).filter(
            DefectInventoryMovement.operation_id == original.operation_id
        ).all()
        reversal_movements = db.query(DefectInventoryMovement).filter(
            DefectInventoryMovement.operation_id == cancellation.operation_id
        ).all()
        original_effects = db.query(InventoryOperationEffect).filter(
            InventoryOperationEffect.operation_id == original.operation_id
        ).all()
        reversal_effects = db.query(InventoryOperationEffect).filter(
            InventoryOperationEffect.operation_id == cancellation.operation_id
        ).all()

        reversal_log_by_source = {str(row.reverses_log_id): row for row in reversal_logs}
        reversal_movement_by_source = {
            str(row.reverses_movement_id): row for row in reversal_movements
        }
        reversal_effect_by_source = {
            str(row.reverses_effect_id): row for row in reversal_effects
        }
        bad_log_ids = [
            str(row.log_id)
            for row in original_logs
            if (match := reversal_log_by_source.get(str(row.log_id))) is None
            or not _reversal_log_is_valid(row, match)
        ]
        bad_movement_ids = [
            str(row.movement_id)
            for row in original_movements
            if (match := reversal_movement_by_source.get(str(row.movement_id))) is None
            or not _reversal_movement_is_valid(row, match)
        ]
        bad_effect_ids = [
            str(row.effect_id)
            for row in original_effects
            if reversal_effect_by_source.get(str(row.effect_id)) is None
        ]
        unexpected_rows = (
            max(0, len(reversal_logs) - len(original_logs))
            + max(0, len(reversal_movements) - len(original_movements))
            + max(0, len(reversal_effects) - len(original_effects))
        )
        if not (bad_log_ids or bad_movement_ids or bad_effect_ids or unexpected_rows):
            continue
        issues.append(
            _issue(
                category="PARTIAL_CANCELLATION",
                identity=(original.operation_id, cancellation.operation_id),
                title="취소 역전 묶음 불완전",
                description="원 작업의 재고·불량·업무 효과가 모두 정확히 반대로 기록되지 않았습니다.",
                cause_ids=(
                    original.operation_id,
                    cancellation.operation_id,
                    *bad_log_ids,
                    *bad_movement_ids,
                    *bad_effect_ids,
                ),
                current_value=(
                    f"재고 {len(reversal_logs)}/{len(original_logs)}, "
                    f"불량 {len(reversal_movements)}/{len(original_movements)}, "
                    f"업무 {len(reversal_effects)}/{len(original_effects)}"
                ),
                expected_value="원 작업의 모든 효과마다 정확히 한 개의 반대 역전 기록",
                repairable=False,
            )
        )
    return issues


def _subject_status(db: Session, subject_type: str, subject_id: str) -> Optional[str]:
    model_by_type = {
        "HandoverDoc": HandoverDoc,
        "ShippingRequest": ShippingRequest,
        "StockRequest": StockRequest,
        "IoBatch": IoBatch,
    }
    model = model_by_type.get(subject_type)
    if model is None:
        return None
    subject = db.get(model, subject_id)
    if subject is None:
        return None
    return str(getattr(subject.status, "value", subject.status))


def _workflow_and_allocation_issues(db: Session) -> list[InventoryIntegrityIssue]:
    issues: list[InventoryIntegrityIssue] = []
    rows = (
        db.query(InventoryOperationEffect)
        .join(
            InventoryOperation,
            InventoryOperation.operation_id == InventoryOperationEffect.operation_id,
        )
        .filter(InventoryOperation.kind == InventoryOperationKindEnum.CANCELLATION)
        .all()
    )
    for effect in rows:
        expected = str((effect.after_state or {}).get("status") or "cancelled")
        if effect.effect_kind == InventoryOperationEffectKindEnum.WORKFLOW:
            current = _subject_status(db, effect.subject_type, effect.subject_id)
            if current == expected:
                continue
            issues.append(
                _issue(
                    category="WORKFLOW_STATE_RESIDUE",
                    identity=(effect.subject_type, effect.subject_id, effect.operation_id),
                    title="취소된 작업의 업무 상태 잔존",
                    description="재고는 취소됐지만 연결 업무가 최종 취소 상태로 닫히지 않았습니다.",
                    cause_ids=(effect.operation_id, effect.effect_id, effect.subject_id),
                    current_value=f"현재 상태 {current or '대상 없음'}",
                    expected_value=f"최종 상태 {expected}",
                    repairable=True,
                )
            )
        elif effect.effect_kind == InventoryOperationEffectKindEnum.ALLOCATION:
            allocation = db.get(ShippingAllocation, effect.subject_id)
            current = allocation.status if allocation is not None else None
            if current == expected:
                continue
            issues.append(
                _issue(
                    category="SHIPPING_ALLOCATION_MISMATCH",
                    identity=(effect.subject_id, effect.operation_id),
                    title="취소된 출하의 배정 상태 불일치",
                    description="취소된 출하 작업에 연결된 재고 배정이 해제되지 않았습니다.",
                    cause_ids=(effect.operation_id, effect.effect_id, effect.subject_id),
                    current_value=f"현재 배정 상태 {current or '대상 없음'}",
                    expected_value=f"배정 상태 {expected}",
                    repairable=True,
                )
            )
    return issues


def _duplicate_reversal_issues(db: Session) -> list[InventoryIntegrityIssue]:
    duplicates = (
        db.query(
            InventoryOperation.reverses_operation_id,
            func.count(InventoryOperation.operation_id),
        )
        .filter(InventoryOperation.reverses_operation_id.isnot(None))
        .group_by(InventoryOperation.reverses_operation_id)
        .having(func.count(InventoryOperation.operation_id) > 1)
        .all()
    )
    return [
        _issue(
            category="DUPLICATE_REVERSAL",
            identity=(original_id,),
            title="동일 작업의 중복 취소",
            description="한 원 작업을 참조하는 취소 작업이 둘 이상 존재합니다.",
            cause_ids=(original_id,),
            current_value=f"취소 작업 {count}건",
            expected_value="취소 작업 1건",
            repairable=False,
        )
        for original_id, count in duplicates
    ]


def _weekly_unclassified_issues(db: Session) -> list[InventoryIntegrityIssue]:
    start_at = cutover_at(db)
    query = db.query(TransactionLog, Item).join(Item, Item.item_id == TransactionLog.item_id)
    if start_at is not None:
        query = query.filter(TransactionLog.created_at >= start_at)

    issues: list[InventoryIntegrityIssue] = []
    for log, item in query.all():
        if item.process_type_code not in FINISHED_CODES:
            continue
        operation = db.get(InventoryOperation, log.operation_id) if log.operation_id else None
        if operation is not None and operation.kind == InventoryOperationKindEnum.CANCELLATION:
            continue
        if log.operation_id is None:
            if start_at is None:
                continue
            reason = "새 원장 활성화 이후 거래에 operation_id가 없습니다."
        else:
            try:
                classify_inventory_activity(log)
            except (WeeklyActivityClassificationError, TypeError, ValueError) as exc:
                reason = str(exc)
            else:
                continue
        issues.append(
            _issue(
                category="WEEKLY_UNCLASSIFIED_EFFECT",
                identity=(log.log_id,),
                title="주간보고 미분류 정상재고 효과",
                description=reason,
                cause_ids=(log.operation_id or "operation_id 없음", log.log_id),
                current_value=(
                    f"{getattr(log.transaction_type, 'value', log.transaction_type)} "
                    f"{_quantity_text(log.quantity_change)} EA"
                ),
                expected_value="생산·입고·출고·불량 중 하나로 검산 가능한 효과",
                repairable=False,
            )
        )
    return issues


def _enum_value(value: object) -> str:
    return str(getattr(value, "value", value))


def _collect_integrity_snapshot(db: Session) -> InventoryIntegritySnapshot:
    """Read and normalize the database state without mutating it."""
    items = db.query(Item.item_id, Item.deleted_at).all()
    inventories = db.query(Inventory).all()
    locations = db.query(InventoryLocation).all()
    stock_requests = db.query(StockRequest).all()
    stock_request_lines = db.query(StockRequestLine).all()
    shipping_requests = db.query(ShippingRequest).all()
    shipping_allocations = db.query(ShippingAllocation).all()
    angle_ids = {str(row[0]) for row in db.query(WarehouseAngle.id).all()}
    boxes = [
        (str(box_id), str(angle_id))
        for box_id, angle_id in db.query(
            WarehouseBox.box_id,
            WarehouseBox.angle_id,
        ).all()
    ]
    box_ids = {box_id for box_id, _angle_id in boxes}
    zones = {
        str(zone_id): bool(is_active)
        for zone_id, is_active in db.query(
            WarehouseSpecialZone.id,
            WarehouseSpecialZone.is_active,
        ).all()
    }
    box_items = db.query(WarehouseBoxItem).all()
    zone_items = db.query(WarehouseSpecialZoneItem).all()
    unplaced_items = db.query(WarehouseUnplacedItem).all()
    operations = db.query(InventoryOperation).all()
    transactions = db.query(TransactionLog).all()
    operation_effects = db.query(InventoryOperationEffect).all()
    defect_movements = db.query(DefectInventoryMovement).all()

    placements = [
        *(
            WarehousePlacementState(
                row_id=str(row.id),
                item_id=str(row.item_id),
                scope="box",
                quantity=Decimal(str(row.quantity or 0)),
                container_id=str(row.box_id),
                container_exists=str(row.box_id) in box_ids,
            )
            for row in box_items
        ),
        *(
            WarehousePlacementState(
                row_id=str(row.id),
                item_id=str(row.item_id),
                scope="special_zone",
                quantity=Decimal(str(row.quantity or 0)),
                container_id=str(row.zone_id),
                container_exists=str(row.zone_id) in zones,
                active=zones.get(str(row.zone_id), False),
            )
            for row in zone_items
        ),
        *(
            WarehousePlacementState(
                row_id=str(row.id),
                item_id=str(row.item_id),
                scope="unplaced",
                quantity=Decimal(str(row.quantity or 0)),
            )
            for row in unplaced_items
        ),
    ]
    evidence = [
        *(
            OperationEvidenceState(
                evidence_id=str(row.effect_id),
                operation_id=str(row.operation_id),
                kind="operation_effect",
                valid=(
                    isinstance(row.before_state, dict)
                    and isinstance(row.after_state, dict)
                    and bool(row.before_state)
                    and bool(row.after_state)
                    and bool(row.subject_type)
                    and bool(row.subject_id)
                    and bool(row.role)
                ),
            )
            for row in operation_effects
        ),
        *(
            OperationEvidenceState(
                evidence_id=str(row.movement_id),
                operation_id=str(row.operation_id),
                kind="defect_movement",
                valid=Decimal(str(row.quantity_delta or 0)) != 0,
            )
            for row in defect_movements
        ),
    ]
    item_ids = frozenset(str(item_id) for item_id, _deleted_at in items)
    active_item_ids = frozenset(
        str(item_id)
        for item_id, deleted_at in items
        if deleted_at is None
    )
    return InventoryIntegritySnapshot(
        item_ids=item_ids,
        active_item_ids=active_item_ids,
        inventories=tuple(
            InventoryState(
                row_id=str(row.inventory_id),
                item_id=str(row.item_id),
                quantity=Decimal(str(row.quantity or 0)),
                warehouse_quantity=Decimal(str(row.warehouse_qty or 0)),
                pending_quantity=Decimal(str(row.pending_quantity or 0)),
            )
            for row in inventories
        ),
        locations=tuple(
            LocationState(
                row_id=str(row.location_id),
                item_id=str(row.item_id),
                department=_enum_value(row.department),
                status=_enum_value(row.status),
                quantity=Decimal(str(row.quantity or 0)),
                pending_quantity=Decimal(str(row.pending_quantity or 0)),
            )
            for row in locations
        ),
        stock_requests=tuple(
            StockRequestState(
                request_id=str(row.request_id),
                request_code=row.request_code,
                status=_enum_value(row.status),
                created_at=row.created_at,
            )
            for row in stock_requests
        ),
        stock_request_lines=tuple(
            StockRequestLineState(
                line_id=str(row.line_id),
                request_id=str(row.request_id),
                item_id=str(row.item_id),
                status=_enum_value(row.status),
                from_bucket=_enum_value(row.from_bucket),
                from_department=(
                    _enum_value(row.from_department)
                    if row.from_department is not None
                    else None
                ),
                quantity=Decimal(str(row.quantity or 0)),
            )
            for row in stock_request_lines
        ),
        shipping_requests=tuple(
            ShippingRequestState(
                request_id=str(row.request_id),
                status=_enum_value(row.status),
            )
            for row in shipping_requests
        ),
        shipping_allocations=tuple(
            ShippingAllocationState(
                allocation_id=str(row.allocation_id),
                request_id=str(row.request_id),
                item_id=str(row.item_id),
                department=(
                    _enum_value(row.department)
                    if row.department is not None
                    else None
                ),
                status=str(row.status),
                quantity=Decimal(str(row.quantity or 0)),
            )
            for row in shipping_allocations
        ),
        warehouse_boxes=tuple(
            WarehouseBoxState(
                box_id=box_id,
                angle_id=angle_id,
                angle_exists=angle_id in angle_ids,
            )
            for box_id, angle_id in boxes
        ),
        warehouse_placements=tuple(placements),
        operations=tuple(
            OperationState(
                operation_id=str(row.operation_id),
                contract_version=int(row.contract_version or 1),
                effective_at=row.effective_at,
                reverses_operation_id=(
                    str(row.reverses_operation_id)
                    if row.reverses_operation_id is not None
                    else None
                ),
            )
            for row in operations
        ),
        transactions=tuple(
            TransactionEffectState(
                log_id=str(row.log_id),
                item_id=str(row.item_id),
                operation_id=(
                    str(row.operation_id) if row.operation_id is not None else None
                ),
                created_at=row.created_at,
                transaction_type=_enum_value(row.transaction_type),
                operation_role=(
                    _enum_value(row.operation_role)
                    if row.operation_role is not None
                    else None
                ),
                quantity_change=Decimal(str(row.quantity_change or 0)),
                reference_no=row.reference_no,
                notes=row.notes,
                inventory_effect=row.inventory_effect,
            )
            for row in transactions
        ),
        operation_evidence=tuple(evidence),
        cutover_at=cutover_at(db),
        evaluated_at=datetime.utcnow(),
    )


def diagnose_inventory_integrity(db: Session) -> InventoryIntegrityResponse:
    """모든 진단기를 읽기 전용으로 실행하고 안정적인 순서로 반환한다."""
    issues = [
        *_defect_stock_issues(db),
        *_partial_cancellation_issues(db),
        *_workflow_and_allocation_issues(db),
        *_duplicate_reversal_issues(db),
        *_weekly_unclassified_issues(db),
    ]
    issues.sort(key=lambda issue: (issue.category, issue.problem_id))
    counts = Counter(issue.category for issue in issues)
    evaluation = evaluate_inventory_integrity(
        _collect_integrity_snapshot(db),
        supplemental_findings=tuple(
            IntegrityFinding(
                check_id=issue.category,
                sample={
                    "problem_id": issue.problem_id,
                    "cause_ids": issue.cause_ids,
                    "current_value": issue.current_value,
                    "expected_value": issue.expected_value,
                },
            )
            for issue in issues
        ),
    )
    return InventoryIntegrityResponse(
        contract=evaluation.contract,
        status=evaluation.status,
        blocking_count=evaluation.blocking_count,
        warning_count=evaluation.warning_count,
        checks=[
            InventoryIntegrityCheck(
                check_id=check.check_id,
                severity=check.severity,
                count=check.count,
                samples=check.samples,
            )
            for check in evaluation.checks
        ],
        generated_at=datetime.utcnow(),
        is_consistent=evaluation.blocking_count == 0,
        issue_count=len(issues),
        category_counts={category: counts[category] for category in CATEGORIES},
        issues=issues,
    )
