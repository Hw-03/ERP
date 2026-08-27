"""불량 처리 허브 API — Phase 2 백엔드.

엔드포인트:
  GET  /api/defects/locations    활성 건별 격리 기록 목록
  GET  /api/defects/kpi          KPI 카드 (격리중/1년이상)
  POST /api/defects/quarantine   격리 (mark_defective 래퍼)
  POST /api/defects/unquarantine 정상 복귀 (unmark_defective 래퍼)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import List, Literal, Optional

from fastapi import Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.verified_actor import (
    VerifiedActor,
    VerifiedActorRouter,
    ensure_actor_employee_id,
)
from app.models import (
    BOM,
    DepartmentEnum,
    DefectQuarantineMemoRevision,
    DefectQuarantineRecord,
    DefectQuarantineReconstruction,
    InventoryLocation,
    Item,
    LocationStatusEnum,
    StockRequestLine,
    StockRequestStatusEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.routers._errors import ErrorCode, http_error
from app.services import rate_limit
from app.services import defect_actions as defect_actions_svc
from app.services.pin_auth import validate_pin
from app._evt import emit as _evt_emit
from app.repositories import item_repository

router = VerifiedActorRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class DefectLocationItem(BaseModel):
    record_id: uuid.UUID
    item_id: uuid.UUID
    item_name: str
    mes_code: Optional[str]
    department: str
    quantity: Decimal
    original_quantity: Decimal
    pending_quantity: Decimal = Decimal("0")
    available_quantity: Decimal
    defective_at: Optional[datetime]
    reason_category: Optional[str]
    reason_memo: Optional[str]
    quarantined_by: Optional[str]
    quarantined_by_employee_id: Optional[uuid.UUID]
    is_legacy: bool = False
    legacy_origin: Optional[Literal["aggregate", "reconstructed"]] = None
    # BOM 자식 보유 여부. 프론트 격리 처리 액션에서 "재작업" 옵션 노출 조건.
    has_bom: bool = False


class DefectKpi(BaseModel):
    quarantined: int
    over_one_year: int


class QuarantineRequest(BaseModel):
    item_id: uuid.UUID
    qty: Decimal
    source: str                          # "warehouse" | "production"
    source_dept: Optional[str] = None
    target_dept: str
    reason_category: Optional[str] = None
    reason_memo: str
    actor_employee_id: uuid.UUID
    client_request_id: Optional[str] = None


class UnquarantineRequest(BaseModel):
    record_id: Optional[uuid.UUID] = None
    item_id: uuid.UUID
    qty: Decimal
    dept: str
    reason_category: Optional[str] = None
    reason_memo: Optional[str] = None
    actor_employee_id: uuid.UUID


class DefectActionResult(BaseModel):
    item_id: uuid.UUID
    quantity: Decimal
    message: str


class DefectMemoUpdateRequest(BaseModel):
    memo: str
    actor_employee_id: uuid.UUID
    pin: str


class DefectMemoUpdateResult(BaseModel):
    memo: str
    changed: bool


class DefectMemoRevisionItem(BaseModel):
    revision_id: uuid.UUID
    previous_memo: Optional[str]
    next_memo: Optional[str]
    edited_by_employee_id: Optional[uuid.UUID]
    edited_by_name: str
    edited_at: datetime
    is_initial: bool


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _dept_enum(dept_str: str) -> DepartmentEnum:
    """문자열 → DepartmentEnum 변환. 실패 시 ValueError."""
    try:
        return DepartmentEnum(dept_str)
    except ValueError:
        raise ValueError(f"알 수 없는 부서: {dept_str}")


def _sum_inventory_effect(
    log: TransactionLog,
    *,
    scope: str,
    department: Optional[str] = None,
    status: Optional[str] = None,
) -> Optional[Decimal]:
    """검증 가능한 재고 효과만 합산하며, 손상된 효과는 멱등 성공으로 인정하지 않는다."""
    effect = log.inventory_effect
    if not isinstance(effect, list):
        return None

    total = Decimal("0")
    for cell in effect:
        if not isinstance(cell, dict):
            return None
        if cell.get("scope") != scope:
            continue
        if department is not None and cell.get("department") != department:
            continue
        if status is not None and cell.get("status") != status:
            continue
        try:
            total += Decimal(str(cell["delta"]))
        except (InvalidOperation, KeyError, TypeError, ValueError):
            return None
    return total


def _matches_quarantine_request(log: TransactionLog, payload: QuarantineRequest) -> bool:
    """멱등 키가 같은 격리 로그가 현재 요청과 같은 업무 명령인지 검증한다."""
    if (
        log.transaction_type != TransactionTypeEnum.MARK_DEFECTIVE
        or log.item_id != payload.item_id
        or log.department != payload.target_dept
        or log.producer_employee_id != payload.actor_employee_id
        or log.reason_category != payload.reason_category
        or (log.reason_memo or "") != (payload.reason_memo or "")
    ):
        return False

    target_delta = _sum_inventory_effect(
        log,
        scope="location",
        department=payload.target_dept,
        status=LocationStatusEnum.DEFECTIVE.value,
    )
    if target_delta != payload.qty:
        return False

    if payload.source == "warehouse":
        source_delta = _sum_inventory_effect(log, scope="warehouse")
    elif payload.source == "production" and payload.source_dept:
        source_delta = _sum_inventory_effect(
            log,
            scope="location",
            department=payload.source_dept,
            status=LocationStatusEnum.PRODUCTION.value,
        )
    else:
        return False
    return source_delta == -payload.qty


def _find_client_request_log(db: Session, client_request_id: str) -> Optional[TransactionLog]:
    """고유 멱등 키에 해당하는 거래를 현재 DB 상태에서 다시 읽는다."""
    return (
        db.query(TransactionLog)
        .filter(TransactionLog.client_request_id == client_request_id)
        .first()
    )


# ---------------------------------------------------------------------------
# GET /api/defects/locations
# ---------------------------------------------------------------------------


@router.get("/locations", response_model=List[DefectLocationItem])
def list_defect_locations(
    department: Optional[str] = Query(None, description="부서 필터 (없으면 전체)"),
    db: Session = Depends(get_db),
):
    """남은 수량이 있는 격리 기록을 격리 건 단위로 반환한다."""
    q = (
        db.query(DefectQuarantineRecord, Item)
        .join(Item, Item.item_id == DefectQuarantineRecord.item_id)
        .filter(DefectQuarantineRecord.remaining_quantity > 0)
    )
    if department:
        q = q.filter(DefectQuarantineRecord.department == department)

    record_rows = q.order_by(DefectQuarantineRecord.quarantined_at.asc()).all()
    record_ids = [record.record_id for record, _ in record_rows]
    reconstructed_record_ids = {
        row[0]
        for row in (
            db.query(DefectQuarantineReconstruction.child_record_id)
            .filter(DefectQuarantineReconstruction.child_record_id.in_(record_ids))
            .all()
            if record_ids
            else []
        )
    }
    pending_by_record = {
        record_id: Decimal(str(quantity or 0))
        for record_id, quantity in (
            db.query(
                StockRequestLine.defect_quarantine_record_id,
                func.sum(StockRequestLine.quantity),
            )
            .filter(
                StockRequestLine.defect_quarantine_record_id.in_(record_ids),
                StockRequestLine.status == StockRequestStatusEnum.RESERVED,
            )
            .group_by(StockRequestLine.defect_quarantine_record_id)
            .all()
            if record_ids
            else []
        )
    }

    # 배포 중 마이그레이션 전 상태나 오래된 테스트 데이터처럼 격리 위치만 있고
    # 건별 원장이 없는 경우에도 조회가 끊기지 않도록 읽기 전용 기존 합산 행을 제공한다.
    covered_pairs = {
        (record.item_id, str(record.department)) for record, _ in record_rows
    }
    location_q = (
        db.query(InventoryLocation, Item)
        .join(Item, Item.item_id == InventoryLocation.item_id)
        .filter(
            InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
            InventoryLocation.quantity > 0,
        )
    )
    if department:
        location_q = location_q.filter(InventoryLocation.department == department)
    fallback_rows = [
        (location, item)
        for location, item in location_q.all()
        if (location.item_id, str(location.department)) not in covered_pairs
    ]

    # BOM 자식 보유 item_id 집합 일괄 조회 — 격리 처리 "재작업" 옵션 노출 조건.
    item_ids = {record.item_id for record, _ in record_rows}
    item_ids.update(location.item_id for location, _ in fallback_rows)
    bom_items = set(
        row[0]
        for row in (
            db.query(BOM.parent_item_id).filter(BOM.parent_item_id.in_(item_ids)).distinct().all()
        )
    ) if item_ids else set()

    last_log_by_item_dept: dict[tuple[uuid.UUID, str], TransactionLog] = {}
    fallback_item_ids = {location.item_id for location, _ in fallback_rows}
    if fallback_item_ids:
        for log in (
            db.query(TransactionLog)
            .filter(
                TransactionLog.item_id.in_(fallback_item_ids),
                TransactionLog.transaction_type == TransactionTypeEnum.MARK_DEFECTIVE,
                TransactionLog.cancelled.is_(False),
            )
            .order_by(TransactionLog.created_at.desc())
            .all()
        ):
            if not log.department:
                continue
            last_log_by_item_dept.setdefault((log.item_id, str(log.department)), log)

    result: List[DefectLocationItem] = []
    for record, item in record_rows:
        pending_quantity = pending_by_record.get(record.record_id, Decimal("0"))
        result.append(
            DefectLocationItem(
                record_id=record.record_id,
                item_id=item.item_id,
                item_name=item.item_name,
                mes_code=item.mes_code,
                department=record.department,
                quantity=record.remaining_quantity,
                original_quantity=record.original_quantity,
                pending_quantity=pending_quantity,
                available_quantity=max(
                    Decimal("0"), record.remaining_quantity - pending_quantity
                ),
                defective_at=record.quarantined_at,
                reason_category=record.reason_category,
                reason_memo=record.current_memo,
                quarantined_by=record.quarantined_by_name,
                quarantined_by_employee_id=record.quarantined_by_employee_id,
                is_legacy=record.is_legacy,
                legacy_origin=(
                    "reconstructed"
                    if record.record_id in reconstructed_record_ids
                    else ("aggregate" if record.is_legacy else None)
                ),
                has_bom=item.item_id in bom_items,
            )
        )

    for location, item in fallback_rows:
        last_log = last_log_by_item_dept.get(
            (location.item_id, str(location.department))
        )
        pending_quantity = location.pending_quantity or Decimal("0")
        result.append(
            DefectLocationItem(
                record_id=location.location_id,
                item_id=item.item_id,
                item_name=item.item_name,
                mes_code=item.mes_code,
                department=location.department,
                quantity=location.quantity,
                original_quantity=location.quantity,
                pending_quantity=pending_quantity,
                available_quantity=max(Decimal("0"), location.quantity - pending_quantity),
                defective_at=location.defective_at,
                reason_category=last_log.reason_category if last_log else None,
                reason_memo=last_log.reason_memo if last_log else None,
                quarantined_by=last_log.produced_by if last_log else None,
                quarantined_by_employee_id=(
                    last_log.producer_employee_id if last_log else None
                ),
                is_legacy=True,
                legacy_origin="aggregate",
                has_bom=item.item_id in bom_items,
            )
        )
    return result


# ---------------------------------------------------------------------------
# GET /api/defects/kpi
# ---------------------------------------------------------------------------


@router.get("/kpi", response_model=DefectKpi)
def get_defect_kpi(db: Session = Depends(get_db)):
    """KPI 카드 2개:
    - quarantined: 남은 수량이 있는 격리 기록 수
    - over_one_year: 격리 시각이 365일을 넘긴 활성 기록 수
    """
    now = datetime.utcnow()
    one_year_ago = now - timedelta(days=365)

    quarantined = (
        db.query(func.count(DefectQuarantineRecord.record_id))
        .filter(
            DefectQuarantineRecord.remaining_quantity > 0,
        )
        .scalar()
        or 0
    )

    over_one_year = (
        db.query(func.count(DefectQuarantineRecord.record_id))
        .filter(
            DefectQuarantineRecord.remaining_quantity > 0,
            DefectQuarantineRecord.quarantined_at <= one_year_ago,
        )
        .scalar()
        or 0
    )

    return DefectKpi(
        quarantined=quarantined,
        over_one_year=over_one_year,
    )


# ---------------------------------------------------------------------------
# GET/PUT /api/defects/records/{record_id}/memo
# ---------------------------------------------------------------------------


@router.get(
    "/records/{record_id}/memo-history",
    response_model=List[DefectMemoRevisionItem],
)
def get_defect_memo_history(
    record_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """최초 등록부터 현재까지 격리 메모의 전후 값을 시간순으로 반환한다."""
    record = db.get(DefectQuarantineRecord, record_id)
    if record is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "격리 기록을 찾을 수 없습니다.")

    return (
        db.query(DefectQuarantineMemoRevision)
        .filter(DefectQuarantineMemoRevision.record_id == record.record_id)
        .order_by(
            DefectQuarantineMemoRevision.edited_at.asc(),
            DefectQuarantineMemoRevision.revision_id.asc(),
        )
        .all()
    )


@router.put(
    "/records/{record_id}/memo",
    response_model=DefectMemoUpdateResult,
)
def update_defect_memo(
    record_id: uuid.UUID,
    payload: DefectMemoUpdateRequest,
    http_request: Request,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
):
    """PIN으로 확인한 직원이 격리 메모를 수정하고 변경 전후를 보존한다."""
    record = db.get(DefectQuarantineRecord, record_id)
    if record is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "격리 기록을 찾을 수 없습니다.")

    ensure_actor_employee_id(actor, payload.actor_employee_id)

    validate_pin(payload.pin)
    try:
        pin_is_valid = rate_limit.verify_operator_pin(actor, payload.pin, http_request)
    except rate_limit.OperatorPinRateLimitExceeded as exc:
        raise http_error(
            429,
            ErrorCode.TOO_MANY_REQUESTS,
            str(exc),
        )
    if not pin_is_valid:
        raise http_error(
            403,
            ErrorCode.FORBIDDEN,
            "PIN이 올바르지 않습니다.",
        )

    if record.current_memo == payload.memo:
        return DefectMemoUpdateResult(memo=payload.memo, changed=False)

    previous_memo = record.current_memo
    record.current_memo = payload.memo
    db.add(
        DefectQuarantineMemoRevision(
            record_id=record.record_id,
            previous_memo=previous_memo,
            next_memo=payload.memo,
            edited_by_employee_id=actor.employee_id,
            edited_by_name=actor.name,
            is_initial=False,
        )
    )
    db.commit()
    _evt_emit(
        "defect_memo_edit",
        request=http_request,
        record_id=str(record.record_id),
    )
    return DefectMemoUpdateResult(memo=payload.memo, changed=True)


# ---------------------------------------------------------------------------
# POST /api/defects/quarantine
# ---------------------------------------------------------------------------


@router.post("/quarantine", response_model=DefectActionResult)
def quarantine(
    payload: QuarantineRequest,
    http_request: Request,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
):
    """격리 (즉시, 결재 없음). mark_defective 래퍼 + defective_at 채움."""
    ensure_actor_employee_id(actor, payload.actor_employee_id)
    payload = payload.model_copy(update={"actor_employee_id": actor.employee_id})

    # 멱등성: 동일 키뿐 아니라 같은 격리 명령임이 확인될 때만 성공으로 재사용한다.
    if payload.client_request_id:
        existing = _find_client_request_log(db, payload.client_request_id)
        if existing:
            if _matches_quarantine_request(existing, payload):
                return DefectActionResult(item_id=payload.item_id, quantity=payload.qty, message="격리 완료")
            raise http_error(409, ErrorCode.CONFLICT, "이미 다른 요청에 사용된 요청 식별자입니다.")

    item = item_repository.get(db, payload.item_id)
    if item is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")

    try:
        target_dept = _dept_enum(payload.target_dept)
        source_dept = _dept_enum(payload.source_dept) if payload.source_dept else None
    except ValueError as exc:
        raise http_error(422, ErrorCode.VALIDATION_ERROR, str(exc))

    try:
        defect_actions_svc.quarantine_inventory(
            db,
            item_id=payload.item_id,
            qty=payload.qty,
            source=payload.source,
            target_dept=target_dept,
            source_dept=source_dept,
            actor=actor,
            reason_category=payload.reason_category,
            reason_memo=payload.reason_memo,
            client_request_id=payload.client_request_id,
        )
    except ValueError as exc:
        raise http_error(422, ErrorCode.VALIDATION_ERROR, str(exc))
    except IntegrityError:
        if payload.client_request_id:
            # application service의 transactional()이 실패를 rollback한 뒤이므로,
            # 식별 맵을 비우고 경합 승자의 커밋 결과를 새로 확인한다.
            db.expire_all()
            existing = _find_client_request_log(db, payload.client_request_id)
            if existing is not None and _matches_quarantine_request(existing, payload):
                return DefectActionResult(item_id=payload.item_id, quantity=payload.qty, message="격리 완료")
        raise http_error(409, ErrorCode.CONFLICT, "격리 처리 중 충돌이 발생했습니다.")
    _evt_emit(
        "defect_mark",
        request=http_request,
        item=item.mes_code,
        qty=str(payload.qty),
        source=payload.source,
        target_dept=payload.target_dept,
        reason=payload.reason_category,
    )
    return DefectActionResult(
        item_id=payload.item_id,
        quantity=payload.qty,
        message="격리 완료",
    )


# ---------------------------------------------------------------------------
# POST /api/defects/unquarantine
# ---------------------------------------------------------------------------


@router.post("/unquarantine", response_model=DefectActionResult)
def unquarantine(
    payload: UnquarantineRequest,
    http_request: Request,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
):
    """정상 복귀 (즉시, 결재 없음). unmark_defective 래퍼."""
    ensure_actor_employee_id(actor, payload.actor_employee_id)
    payload = payload.model_copy(update={"actor_employee_id": actor.employee_id})

    item = item_repository.get(db, payload.item_id)
    if item is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")

    try:
        dept = _dept_enum(payload.dept)
    except ValueError as exc:
        raise http_error(422, ErrorCode.VALIDATION_ERROR, str(exc))

    try:
        defect_actions_svc.unquarantine_inventory(
            db,
            record_id=payload.record_id,
            item_id=payload.item_id,
            qty=payload.qty,
            dept=dept,
            actor=actor,
            reason_category=payload.reason_category,
            reason_memo=payload.reason_memo,
        )
    except ValueError as exc:
        raise http_error(422, ErrorCode.VALIDATION_ERROR, str(exc))
    _evt_emit(
        "defect_unmark",
        request=http_request,
        item=item.mes_code,
        qty=str(payload.qty),
        dept=payload.dept,
        reason=payload.reason_category,
    )
    return DefectActionResult(
        item_id=payload.item_id,
        quantity=payload.qty,
        message="정상 복귀 완료",
    )
