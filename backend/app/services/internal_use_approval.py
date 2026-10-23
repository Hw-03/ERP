"""AS·연구 사용출고의 배치 단위 결재 결정과 원자적 실행."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Sequence

from sqlalchemy import or_, text, update
from sqlalchemy.orm import Session

from app.models import (
    DepartmentEnum,
    Employee,
    IoBatch,
    IoLine,
    LocationStatusEnum,
    RequestBucketEnum,
    StockRequest,
    StockRequestStatusEnum,
    TransactionLog,
)
from app.services import inventory_operations as operation_svc
from app.services.io_persist import current_submission_requests, ensure_batch_is_mutable
from app.services.sr_execution import release_reservation


INTERNAL_USE_SUB_TYPE = "internal_use_out"
_APPROVER_ROSTER_LOCK_KEY = 4_153_737_001
_OPEN_STATUSES = {
    StockRequestStatusEnum.RESERVED,
    StockRequestStatusEnum.SUBMITTED,
}
_REJECTED_STATUSES = {
    StockRequestStatusEnum.REJECTED,
    StockRequestStatusEnum.CANCELLED,
    StockRequestStatusEnum.FAILED_APPROVAL,
}
_TERMINAL_BATCH_STATUSES = {
    "completed",
    "partially_completed",
    "rejected",
    "cancelled",
    "failed",
}


class InternalUseSubmissionSettlementError(Exception):
    """신규 사용출고 생성은 보존하되 최종 정산 오류를 commit 뒤 다시 올린다."""

    def __init__(
        self,
        *,
        batch_id: uuid.UUID,
        approver_id: uuid.UUID,
        original: Exception,
    ) -> None:
        super().__init__(str(original))
        self.batch_id = batch_id
        self.approver_id = approver_id
        self.original = original


def approval_kind(request: StockRequest) -> str:
    """상호 배타적인 결재 종류를 반환한다."""
    kinds = [
        kind
        for required, kind in (
            (request.requires_warehouse_approval, "warehouse"),
            (request.requires_department_approval, "department"),
            (request.requires_as_research_approval, "as_research"),
        )
        if required
    ]
    if len(kinds) > 1:
        raise ValueError("결재 요청에 여러 승인 종류가 지정되어 있습니다.")
    return kinds[0] if kinds else "none"


def is_internal_use_request(db: Session, request: StockRequest) -> bool:
    batch_id = request.operation_batch_id
    if batch_id is None:
        return False
    return (
        db.query(IoBatch.batch_id)
        .filter(
            IoBatch.batch_id == batch_id,
            IoBatch.sub_type == INTERNAL_USE_SUB_TYPE,
        )
        .first()
        is not None
    )


def _is_approved(request: StockRequest) -> bool:
    kind = approval_kind(request)
    if kind == "warehouse":
        return request.approved_at is not None
    if kind == "department":
        return request.department_approved_at is not None
    if kind == "as_research":
        return request.as_research_approved_at is not None
    return True


def _is_decided(request: StockRequest) -> bool:
    return request.status in _REJECTED_STATUSES or _is_approved(request)


def lock_approver_roster(db: Session) -> None:
    """승인자 0명 판정과 사용출고 분류를 PostgreSQL transaction 단위로 직렬화한다."""
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        db.execute(
            text("SELECT pg_advisory_xact_lock(:lock_key)"),
            {"lock_key": _APPROVER_ROSTER_LOCK_KEY},
        )


def lock_and_refresh_employee(db: Session, employee_id: uuid.UUID) -> Employee:
    """roster 직렬화 뒤 identity-map을 우회해 직원 최신 권한을 다시 읽는다."""
    lock_approver_roster(db)
    return (
        db.query(Employee)
        .filter(Employee.employee_id == employee_id)
        .populate_existing()
        .one()
    )


def lock_batch_requests(
    db: Session,
    *,
    batch_id: uuid.UUID,
) -> tuple[IoBatch, list[StockRequest]]:
    """항상 batch → 정렬된 requests 순서로 잠가 형제 요청 교착을 막는다."""
    batch_query = db.query(IoBatch).filter(IoBatch.batch_id == batch_id).populate_existing()
    if db.bind is not None and db.bind.dialect.name != "sqlite":
        batch_query = batch_query.with_for_update()
    batch = batch_query.one()
    ensure_batch_is_mutable(batch)

    request_query = (
        db.query(StockRequest)
        .filter(StockRequest.operation_batch_id == batch_id)
        .order_by(StockRequest.request_id.asc())
        .populate_existing()
    )
    if db.bind is not None and db.bind.dialect.name != "sqlite":
        request_query = request_query.with_for_update()
    requests = request_query.all()
    if not requests:
        raise ValueError("연결된 결재 요청을 찾을 수 없습니다.")
    return batch, requests


def _prelock_locations(db: Session, lines: Sequence[IoLine]) -> None:
    """부모 Inventory 잠금 뒤 사용출고 생산 위치를 전역 순서로 잠근다."""
    keys = {
        (line.item_id, department)
        for line in lines
        for bucket, department in (
            (line.from_bucket, line.from_department),
            (line.to_bucket, line.to_department),
        )
        if bucket == "production" and department is not None
    }
    from app.services import inventory as inventory_svc

    for item_id, department in sorted(keys, key=lambda key: (key[0], key[1])):
        inventory_svc._lock_location(
            db,
            item_id,
            DepartmentEnum(department),
            LocationStatusEnum.PRODUCTION,
        )


def prelock_reservation_sources(
    db: Session,
    requests: Sequence[StockRequest],
    *,
    extra_plan: dict | None = None,
) -> None:
    """기존·신규 효과의 모든 부모/셀 이후 allocation을 잠가 교차 위치 교착을 막는다."""
    from app.services import inventory as inventory_svc
    from app.services.sr_execution import (
        _request_department_routing_item_ids,
        _request_inventory_item_ids,
    )
    from app.services.stock_availability import AvailabilityCell, figures_for_cells

    lines = [line for request in requests for line in request.lines]
    item_ids = {line.item_id for line in lines}
    for request in requests:
        # 재작업은 원본 외에 결정 트리의 자식도 첫 셀 잠금 전에 선언해야 한다.
        item_ids.update(_request_inventory_item_ids(db, request, request.lines))
        item_ids.update(_request_department_routing_item_ids(db, request, request.lines))
    cells: set[AvailabilityCell] = set()
    for line in lines:
        for bucket, department in ((line.from_bucket, line.from_department), (line.to_bucket, line.to_department)):
            bucket = RequestBucketEnum(bucket)
            if bucket == RequestBucketEnum.WAREHOUSE:
                cells.add(AvailabilityCell.warehouse(line.item_id))
            elif bucket in (RequestBucketEnum.PRODUCTION, RequestBucketEnum.DEFECTIVE):
                if department is None:
                    raise ValueError(f"{bucket.value} 위치에는 부서가 필요합니다.")
                cells.add(AvailabilityCell.location(line.item_id, department,
                    LocationStatusEnum.PRODUCTION if bucket == RequestBucketEnum.PRODUCTION else LocationStatusEnum.DEFECTIVE))
    batch_ids = {row.operation_batch_id for row in requests if row.operation_batch_id is not None}
    plans = [row.effective_plan for row in db.query(IoBatch).filter(IoBatch.batch_id.in_(batch_ids)).all()]
    plans.append(extra_plan)
    for plan in plans:
        for effect in (plan or {}).get("effects", []):
            item_id = uuid.UUID(effect["item_id"])
            item_ids.add(item_id)
            for endpoint in (effect["from"], effect["to"]):
                if endpoint is None:
                    continue
                cells.add(AvailabilityCell.warehouse(item_id) if endpoint["bucket"] == "warehouse" else
                    AvailabilityCell.location(item_id, endpoint["department"],
                        LocationStatusEnum.DEFECTIVE if endpoint["bucket"] == "defective" else LocationStatusEnum.PRODUCTION))
    inventory_svc.ensure_and_lock_inventories(db, sorted(item_ids))
    for cell in sorted(cells, key=lambda cell: cell.sort_key):
        if cell.department is not None:
            inventory_svc._lock_location(db, cell.item_id, DepartmentEnum(cell.department), cell.status)
    figures_for_cells(db, cells, lock_allocations=True)


def locked_request(
    db: Session,
    request: StockRequest,
) -> tuple[IoBatch, list[StockRequest], StockRequest]:
    batch_id = request.operation_batch_id
    if batch_id is None:
        raise ValueError("연결된 입출고 작업 묶음이 없습니다.")
    batch, requests = lock_batch_requests(db, batch_id=batch_id)
    current = next(
        (row for row in requests if row.request_id == request.request_id),
        None,
    )
    if current is None:
        raise ValueError("요청과 입출고 작업 묶음의 연결 정보가 올바르지 않습니다.")
    return batch, requests, current


def settle_if_decided(
    db: Session,
    *,
    batch: IoBatch,
    requests: Sequence[StockRequest],
    actor: Employee,
) -> bool:
    """반환 모드는 첫 반려에 전체 취소하고 전부 승인 시 한 번 실행하며, 기존 모드는 부분 승인한다."""
    if batch.status in {"completed", "partially_completed", "rejected", "failed", "cancelled"}:
        return False
    requests = current_submission_requests(batch, requests)
    if not requests:
        return False
    batch.reservation_status = "inactive"
    batch.reservation_issue = None
    if any(bundle.internal_use_bom_mode == "parent_with_returns" for bundle in batch.bundles) and any(
        request.status == StockRequestStatusEnum.REJECTED for request in requests
    ):
        # 반려 요청은 호출 경계에서 이미 해제됐으며 형제 예약은 상태를 바꾸기 전에 해제한다.
        for request in requests:
            release_reservation(db, request)

        from app.services import notifications

        now = datetime.utcnow()
        for request in requests:
            if request.status not in _REJECTED_STATUSES:
                request.status = StockRequestStatusEnum.CANCELLED
                request.cancelled_at = now
                for line in request.lines:
                    line.status = StockRequestStatusEnum.CANCELLED
            notifications.mark_approval_request_notifications_read(
                db, request_id=request.request_id,
            )
        batch.status = "rejected"
        batch.completed_at = None
        batch.updated_at = now
        db.flush()
        return True
    if not all(_is_decided(request) for request in requests):
        batch.status = (
            "reserved"
            if any(request.status == StockRequestStatusEnum.RESERVED for request in requests)
            else "submitted"
        )
        batch.completed_at = None
        batch.updated_at = datetime.utcnow()
        return False

    approved_requests = [
        request
        for request in requests
        if request.status not in _REJECTED_STATUSES and _is_approved(request)
    ]
    if not approved_requests:
        batch.status = "rejected"
        batch.completed_at = None
        batch.updated_at = datetime.utcnow()
        return True

    # 물리 실행 없는 반려·미결 결정은 보존하고, 승인 효과를 실행할 때 재검증한다.
    if batch.effective_plan is not None:
        from app.services.io_reservations import validate_saved_plan
        validate_saved_plan(db, batch)

    approved_line_ids = {
        request_line.operation_line_id
        for request in approved_requests
        for request_line in request.lines
        if request_line.operation_line_id is not None
    }
    expected_line_count = sum(len(request.lines) for request in approved_requests)
    if len(approved_line_ids) != expected_line_count:
        raise ValueError("결재 요청과 작업 라인의 연결 정보가 올바르지 않습니다.")
    io_lines = (
        db.query(IoLine)
        .join(IoLine.bundle)
        .filter(IoLine.line_id.in_(approved_line_ids))
        .all()
    )
    if len(io_lines) != len(approved_line_ids):
        raise ValueError("결재 요청에 연결된 작업 라인을 찾을 수 없습니다.")

    from app.services import io_dispatch

    io_dispatch._prelock_line_inventories(db, io_lines)
    _prelock_locations(db, io_lines)
    for request in approved_requests:
        release_reservation(db, request)

    io_dispatch._validate_included_lines(db, io_lines)
    operation = io_dispatch._create_execution_operation(
        db,
        batch=batch,
        actor=actor,
        execution_key="approval-settle",
    )
    requester = (
        db.query(Employee)
        .filter(Employee.employee_id == batch.requester_employee_id)
        .one()
    )
    batch_status_before = batch.status
    request_statuses_before = {
        request.request_id: request.status for request in approved_requests
    }
    for line in sorted(io_lines, key=lambda row: 0 if row.direction == "out" else 1):
        io_dispatch._apply_line(
            db,
            batch=batch,
            line=line,
            requester=requester,
            operation=operation,
        )
    db.flush()
    for request in approved_requests:
        operation_line_ids = [
            line.operation_line_id
            for line in request.lines
            if line.operation_line_id is not None
        ]
        db.query(TransactionLog).filter(
            TransactionLog.operation_line_id.in_(operation_line_ids)
        ).update(
            {TransactionLog.reference_no: request.request_code},
            synchronize_session=False,
        )

    now = datetime.utcnow()
    for request in approved_requests:
        request.status = StockRequestStatusEnum.COMPLETED
        request.completed_at = now
        for request_line in request.lines:
            request_line.status = StockRequestStatusEnum.COMPLETED
        operation_svc.record_effect(
            db,
            operation=operation,
            effect_kind="WORKFLOW",
            subject_type="StockRequest",
            subject_id=request.request_id,
            role="EXECUTION_STATUS",
            before_state={"status": request_statuses_before[request.request_id].value},
            after_state={"status": StockRequestStatusEnum.COMPLETED.value},
        )
    batch.status = (
        "partially_completed"
        if len(approved_requests) != len(requests)
        else "completed"
    )
    batch.completed_at = now
    batch.updated_at = now
    operation_svc.record_effect(
        db,
        operation=operation,
        effect_kind="WORKFLOW",
        subject_type="IoBatch",
        subject_id=batch.batch_id,
        role="EXECUTION_STATUS",
        before_state={"status": batch_status_before},
        after_state={"status": batch.status},
    )
    db.flush()
    return True


def reclassify_undecided_if_no_active_approver(db: Session) -> int:
    """재분류 계약 충돌은 호출자가 먼저 변경한 직원 권한까지 원복한다."""
    from app.services.work_reservation_errors import WorkReservationError

    try:
        return _reclassify_undecided_if_no_active_approver(db)
    except WorkReservationError:
        db.rollback()
        raise


def _reclassify_undecided_if_no_active_approver(db: Session) -> int:
    """마지막 활성 전용 승인자가 사라지면 미결 요청을 부서 결재로 일방향 전환한다."""
    lock_approver_roster(db)
    db.flush()
    active_count = (
        db.query(Employee)
        .filter(
            Employee.as_research_approver.is_(True),
            Employee.is_active == "true",
        )
        .count()
    )
    if active_count:
        return 0

    hints = (
        db.query(StockRequest.request_id, StockRequest.operation_batch_id)
        .filter(
            StockRequest.requires_as_research_approval.is_(True),
            StockRequest.as_research_approved_at.is_(None),
            StockRequest.status.in_(tuple(_OPEN_STATUSES)),
        )
        .all()
    )
    if not hints:
        return 0

    from app.services import notifications
    from app.services.io_effective_plan import build_effective_plan
    from app.services.io_reservations import check_revision, record_event, validate_saved_plan
    from app.services.work_reservation_errors import WorkReservationError

    batch_ids = {row.operation_batch_id for row in hints if row.operation_batch_id is not None}
    batches = db.query(IoBatch).filter(IoBatch.batch_id.in_(batch_ids)).order_by(
        IoBatch.batch_id.asc()).populate_existing().with_for_update().all()
    standalone_ids = {row.request_id for row in hints if row.operation_batch_id is None}
    requests = db.query(StockRequest).filter(or_(
        StockRequest.operation_batch_id.in_(batch_ids), StockRequest.request_id.in_(standalone_ids),
    )).order_by(StockRequest.request_id.asc()).populate_existing().with_for_update().all()
    by_batch = {batch.batch_id: batch for batch in batches}
    targets = [request for request in requests
        if request.requires_as_research_approval and request.as_research_approved_at is None
        and request.status in _OPEN_STATUSES
        and (request.operation_batch_id is None or (
            request.operation_batch_id in by_batch
            and by_batch[request.operation_batch_id].status not in _TERMINAL_BATCH_STATUSES))]
    changed_batch_ids = {request.operation_batch_id for request in targets if request.operation_batch_id is not None}
    for batch in batches:
        if batch.batch_id in changed_batch_ids and batch.effective_plan is not None:
            validate_saved_plan(db, batch)
    for request in targets:
        batch = by_batch.get(request.operation_batch_id)
        request.requires_as_research_approval = False
        request.requires_department_approval = True
        request.approval_department = (batch.to_department if batch is not None else None) or request.requester_department
        notifications.notify_request_arrived(db, request)
    db.flush()
    for batch in batches:
        if batch.batch_id not in changed_batch_ids:
            continue
        if batch.effective_plan is not None:
            plan = build_effective_plan(db, batch)
            # A roster edit cannot authorize different material, quantity, direction or routing.
            if plan["effects"] != batch.effective_plan["effects"]:
                raise WorkReservationError("WORK_PLAN_CHANGED", "승인 분류 외의 작업 구성이 변경되었습니다.")
            batch.effective_plan = {**batch.effective_plan, "fingerprint": plan["fingerprint"]}
        previous_revision = batch.revision
        db.flush()
        result = db.execute(update(IoBatch).where(IoBatch.batch_id == batch.batch_id,
            IoBatch.revision == previous_revision).values(revision=previous_revision + 1,
            updated_at=datetime.utcnow()).execution_options(synchronize_session=False))
        if result.rowcount != 1:
            db.refresh(batch)
            check_revision(batch, previous_revision)
            raise WorkReservationError("WORK_STATE_CONFLICT", "작업이 변경되었습니다.")
        db.refresh(batch)
        record_event(db, batch, "approval_changed", previous_revision, None, "system", "last_as_research_approver_removed")
    db.flush()
    return len(targets)


def mark_batch_failed(
    db: Session,
    *,
    batch_id: uuid.UUID,
    approver: Employee,
    reason: str,
    rejected_request_id: uuid.UUID | None = None,
    rejected_reason: str | None = None,
) -> None:
    """실행 실패를 기록하되 이미 확정된 batch/request 이력은 덮지 않는다."""
    batch, requests = lock_batch_requests(db, batch_id=batch_id)
    if batch.status in _TERMINAL_BATCH_STATUSES or any(
        request.status == StockRequestStatusEnum.COMPLETED for request in requests
    ):
        return
    prelock_reservation_sources(db, requests)
    if rejected_request_id is not None:
        rejected_request = next(
            (request for request in requests if request.request_id == rejected_request_id),
            None,
        )
        if rejected_request is None:
            raise ValueError("실패한 최종 반려 요청을 찾을 수 없습니다.")
        if rejected_request.status not in _REJECTED_STATUSES:
            release_reservation(db, rejected_request)
            now = datetime.utcnow()
            rejected_request.status = StockRequestStatusEnum.REJECTED
            rejected_request.rejected_by_employee_id = approver.employee_id
            rejected_request.rejected_by_name = approver.name
            rejected_request.rejected_at = now
            rejected_request.rejected_reason = rejected_reason
            for line in rejected_request.lines:
                line.status = StockRequestStatusEnum.REJECTED

    failed_requests = [
        request for request in requests if request.status not in _REJECTED_STATUSES
    ]

    from app.services.sr_approval import _release_pending_best_effort

    now = datetime.utcnow()
    for request in failed_requests:
        if request.status == StockRequestStatusEnum.RESERVED:
            _release_pending_best_effort(db, request)
        request.status = StockRequestStatusEnum.FAILED_APPROVAL
        request.rejected_by_employee_id = approver.employee_id
        request.rejected_by_name = approver.name
        request.rejected_at = now
        request.rejected_reason = f"승인 실패: {reason}"
        for line in request.lines:
            line.status = StockRequestStatusEnum.FAILED_APPROVAL
    batch.status = "failed"
    batch.reservation_status = "inactive"
    batch.reservation_issue = None
    batch.completed_at = None
    batch.updated_at = now
    db.flush()
