"""불량 처리 허브 API — Phase 2 백엔드.

엔드포인트:
  GET  /api/defects/locations    부서·아이템별 DEFECTIVE 목록
  GET  /api/defects/kpi          KPI 카드 (격리중/1년이상/결재대기/오늘처리)
  POST /api/defects/quarantine   격리 (mark_defective 래퍼)
  POST /api/defects/unquarantine 정상 복귀 (unmark_defective 래퍼)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    BOM,
    DepartmentEnum,
    Employee,
    InventoryLocation,
    Item,
    LocationStatusEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.routers._errors import ErrorCode, http_error
from app.services import inventory as inventory_svc
from app.services import inv_effect
from app._evt import emit as _evt_emit
from app._actor import set_actor
from app.repositories import item_repository

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class DefectLocationItem(BaseModel):
    item_id: uuid.UUID
    item_name: str
    mes_code: Optional[str]
    department: str
    quantity: Decimal
    defective_at: Optional[datetime]
    reason_category: Optional[str]
    reason_memo: Optional[str]
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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _dept_enum(dept_str: str) -> DepartmentEnum:
    """문자열 → DepartmentEnum 변환. 실패 시 ValueError."""
    try:
        return DepartmentEnum(dept_str)
    except ValueError:
        raise ValueError(f"알 수 없는 부서: {dept_str}")


# ---------------------------------------------------------------------------
# GET /api/defects/locations
# ---------------------------------------------------------------------------


@router.get("/locations", response_model=List[DefectLocationItem])
def list_defect_locations(
    department: Optional[str] = Query(None, description="부서 필터 (없으면 전체)"),
    db: Session = Depends(get_db),
):
    """DEFECTIVE 상태 InventoryLocation 목록.

    각 (item, department) 조합에 대해 가장 최근 MARK_DEFECTIVE 트랜잭션의 사유를 포함.
    """
    q = (
        db.query(InventoryLocation, Item)
        .join(Item, Item.item_id == InventoryLocation.item_id)
        .filter(InventoryLocation.status == LocationStatusEnum.DEFECTIVE)
        .filter(InventoryLocation.quantity > 0)
    )
    if department:
        q = q.filter(InventoryLocation.department == department)

    rows = q.order_by(InventoryLocation.defective_at.asc().nullsfirst()).all()

    # BOM 자식 보유 item_id 집합 일괄 조회 — 격리 처리 "재작업" 옵션 노출 조건.
    item_ids = {loc.item_id for loc, _ in rows}
    bom_items = set(
        row[0]
        for row in (
            db.query(BOM.parent_item_id).filter(BOM.parent_item_id.in_(item_ids)).distinct().all()
        )
    ) if item_ids else set()

    # item_id 별 최근 MARK_DEFECTIVE 로그 일괄 조회 — N+1 제거.
    # 기존 단건 쿼리와 동일하게 item_id 기준(부서 무관) created_at 내림차순 최신 1건.
    last_log_by_item: dict = {}
    if item_ids:
        for log in (
            db.query(TransactionLog)
            .filter(
                TransactionLog.item_id.in_(item_ids),
                TransactionLog.transaction_type == TransactionTypeEnum.MARK_DEFECTIVE,
            )
            .order_by(TransactionLog.created_at.desc())
            .all()
        ):
            # 내림차순 순회 → 가장 먼저 만난(=최신) 로그만 남김.
            last_log_by_item.setdefault(log.item_id, log)

    result: List[DefectLocationItem] = []
    for loc, item in rows:
        last_log: Optional[TransactionLog] = last_log_by_item.get(loc.item_id)
        result.append(
            DefectLocationItem(
                item_id=item.item_id,
                item_name=item.item_name,
                mes_code=item.mes_code,
                department=loc.department,
                quantity=loc.quantity,
                defective_at=loc.defective_at,
                reason_category=last_log.reason_category if last_log else None,
                reason_memo=last_log.reason_memo if last_log else None,
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
    - quarantined: DEFECTIVE 위치 수 (quantity > 0)
    - over_one_year: defective_at <= now - 365 days
    """
    now = datetime.utcnow()
    one_year_ago = now - timedelta(days=365)

    quarantined = (
        db.query(func.count(InventoryLocation.location_id))
        .filter(
            InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
            InventoryLocation.quantity > 0,
        )
        .scalar()
        or 0
    )

    over_one_year = (
        db.query(func.count(InventoryLocation.location_id))
        .filter(
            InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
            InventoryLocation.quantity > 0,
            InventoryLocation.defective_at <= one_year_ago,
        )
        .scalar()
        or 0
    )

    return DefectKpi(
        quarantined=quarantined,
        over_one_year=over_one_year,
    )


# ---------------------------------------------------------------------------
# POST /api/defects/quarantine
# ---------------------------------------------------------------------------


@router.post("/quarantine", response_model=DefectActionResult)
def quarantine(payload: QuarantineRequest, http_request: Request, db: Session = Depends(get_db)):
    """격리 (즉시, 결재 없음). mark_defective 래퍼 + defective_at 채움."""
    # 멱등성: 동일 client_request_id로 이미 처리된 요청이면 즉시 반환.
    if payload.client_request_id:
        existing = (
            db.query(TransactionLog)
            .filter(TransactionLog.client_request_id == payload.client_request_id)
            .first()
        )
        if existing:
            return DefectActionResult(item_id=payload.item_id, quantity=payload.qty, message="격리 완료")

    actor = db.query(Employee).filter(Employee.employee_id == payload.actor_employee_id).first()
    if actor is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다.")
    set_actor(http_request, actor)

    item = item_repository.get(db, payload.item_id)
    if item is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")

    try:
        target_dept = _dept_enum(payload.target_dept)
        source_dept = _dept_enum(payload.source_dept) if payload.source_dept else None
    except ValueError as exc:
        raise http_error(422, ErrorCode.VALIDATION_ERROR, str(exc))

    inv = inventory_svc.get_or_create_inventory(db, payload.item_id)
    qty_before = inv.quantity or Decimal("0")
    cells_before = inv_effect.snapshot_cells(db, payload.item_id)

    try:
        inventory_svc.mark_defective(
            db,
            payload.item_id,
            payload.qty,
            inventory_svc.DefectSource(
                kind=payload.source,
                target_dept=target_dept,
                source_dept=source_dept,
            ),
        )
    except ValueError as exc:
        raise http_error(422, ErrorCode.VALIDATION_ERROR, str(exc))

    # defective_at 채우기
    from sqlalchemy import update as sa_update
    now = datetime.utcnow()
    db.execute(
        sa_update(InventoryLocation)
        .where(InventoryLocation.item_id == payload.item_id)
        .where(InventoryLocation.department == target_dept)
        .where(InventoryLocation.status == LocationStatusEnum.DEFECTIVE)
        .values(defective_at=now)
        .execution_options(synchronize_session=False)
    )

    # TransactionLog 기록
    db.flush()
    inv = inventory_svc.get_or_create_inventory(db, payload.item_id)
    try:
        db.add(
            TransactionLog(
                item_id=payload.item_id,
                transaction_type=TransactionTypeEnum.MARK_DEFECTIVE,
                quantity_change=Decimal("0"),
                quantity_before=qty_before,
                quantity_after=inv.quantity,
                produced_by=actor.name,
                notes=f"격리: {payload.source} → {payload.target_dept}",
                reason_category=payload.reason_category,
                reason_memo=payload.reason_memo or None,
                client_request_id=payload.client_request_id,
                # String 컬럼엔 enum repr 금지 — .value(한국어) 사용
                department=getattr(target_dept, "value", target_dept),
                inventory_effect=inv_effect.capture_effect(db, payload.item_id, cells_before),
            )
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        if payload.client_request_id:
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
def unquarantine(payload: UnquarantineRequest, http_request: Request, db: Session = Depends(get_db)):
    """정상 복귀 (즉시, 결재 없음). unmark_defective 래퍼."""
    actor = db.query(Employee).filter(Employee.employee_id == payload.actor_employee_id).first()
    if actor is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다.")
    set_actor(http_request, actor)

    item = item_repository.get(db, payload.item_id)
    if item is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")

    try:
        dept = _dept_enum(payload.dept)
    except ValueError as exc:
        raise http_error(422, ErrorCode.VALIDATION_ERROR, str(exc))

    inv = inventory_svc.get_or_create_inventory(db, payload.item_id)
    qty_before = inv.quantity or Decimal("0")
    cells_before = inv_effect.snapshot_cells(db, payload.item_id)

    try:
        inventory_svc.unmark_defective(
            db,
            payload.item_id,
            payload.qty,
            dept,
            inventory_svc.ReasonContext(
                category=payload.reason_category or "",
                memo=payload.reason_memo or "",
                actor=actor.name,
            ),
        )
    except ValueError as exc:
        raise http_error(422, ErrorCode.VALIDATION_ERROR, str(exc))

    db.flush()
    inv = inventory_svc.get_or_create_inventory(db, payload.item_id)
    db.add(
        TransactionLog(
            item_id=payload.item_id,
            transaction_type=TransactionTypeEnum.UNMARK_DEFECTIVE,
            quantity_change=Decimal("0"),
            quantity_before=qty_before,
            quantity_after=inv.quantity,
            produced_by=actor.name,
            notes=f"정상 복귀: {payload.dept}",
            reason_category=payload.reason_category,
            reason_memo=payload.reason_memo or None,
            # String 컬럼엔 enum repr 금지 — .value(한국어) 사용
            department=getattr(dept, "value", dept),
            inventory_effect=inv_effect.capture_effect(db, payload.item_id, cells_before),
        )
    )
    db.commit()
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
