"""거래 이력: /transactions, /transactions/export.csv|.xlsx, 메타/수량 수정 + 수정 이력."""

from __future__ import annotations

import csv
import json
import uuid
from datetime import UTC, date, datetime, time
from decimal import Decimal
from io import StringIO
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import case, extract, func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Employee,
    IoBatch,
    Inventory,
    InventoryLocation,
    Item,
    LocationStatusEnum,
    TransactionEditLog,
    TransactionLog,
    TransactionTypeEnum,
)
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    TransactionEditLogResponse,
    TransactionLogResponse,
    TransactionMetaEditRequest,
    TransactionQuantityCorrectionRequest,
    TransactionQuantityCorrectionResponse,
)
from app.services import audit, inventory as inventory_svc
from app.services._tx import commit_only
from app.services.export_helpers import csv_streaming_response
from app.services.pin_auth import verify_pin
from app._actor import set_actor
from app.routers.inventory._tx_filters import (
    _SUMMARY_WAREHOUSE_TYPES,
    _SUMMARY_DEPT_TYPES,
    _SUMMARY_ADJUST_TYPES,
    _department_label_expr,
    _process_step_filter,
    _model_filter,
    _department_filter,
    _operation_filter,
    _apply_common_filters,
    _batch_name_map,
    _to_log_response,
)
from app.repositories import item_repository, inventory_repository


router = APIRouter()


# 단일 export 요청에서 허용하는 최대 행 수. 운영 PC 메모리 보호용 안전 상한.
EXPORT_MAX_ROWS = 50_000


# 메타데이터(notes/reference_no/produced_by) 수정이 허용되는 거래 타입.
# 복합 거래(PRODUCE/BACKFLUSH 등)는 수정 금지.
META_CORRECTABLE = {
    TransactionTypeEnum.RECEIVE,
    TransactionTypeEnum.SHIP,
    TransactionTypeEnum.ADJUST,
    TransactionTypeEnum.TRANSFER_TO_PROD,
    TransactionTypeEnum.TRANSFER_TO_WH,
    TransactionTypeEnum.TRANSFER_DEPT,
    TransactionTypeEnum.MARK_DEFECTIVE,
    TransactionTypeEnum.SUPPLIER_RETURN,
}

# 수량 보정이 허용되는 거래 타입.
# ADJUST 제외: 절대값 지정 방식이라 delta 보정 정책 애매 (별도 정책 확정 필요).
# TRANSFER_*: 부서 버킷 정보가 TransactionLog에 없어 1차 미지원.
QUANTITY_CORRECTABLE = {
    TransactionTypeEnum.RECEIVE,
    TransactionTypeEnum.SHIP,
}

class TransactionSummaryResponse(BaseModel):
    """입출고 내역 화면 KPI — 조건 전체 카운트(페이지네이션과 무관)."""
    total: int
    warehouse_count: int
    dept_count: int
    adjust_count: int
    # dept-bucket 거래의 부서별 카운트 {부서명: 건수}. 배치/부서 없으면 '미상' 키.
    department_counts: dict[str, int] = {}


def _require_export_range(start_date: Optional[date], end_date: Optional[date]) -> tuple[datetime, datetime]:
    """export 는 start_date / end_date 모두 필수. 없으면 400."""
    if start_date is None or end_date is None:
        raise http_error(
            status_code=400,
            code=ErrorCode.EXPORT_RANGE_REQUIRED,
            message="export 는 start_date 와 end_date 를 모두 지정해야 합니다.",
        )
    return datetime.combine(start_date, time.min), datetime.combine(end_date, time.max)


def _enforce_export_limit(count: int) -> None:
    if count > EXPORT_MAX_ROWS:
        raise http_error(
            status_code=422,
            code=ErrorCode.EXPORT_RANGE_TOO_LARGE,
            message=f"범위 내 행 수가 {count:,}건으로 상한({EXPORT_MAX_ROWS:,})을 초과합니다. 기간을 좁혀 주세요.",
            row_count=count,
            max_rows=EXPORT_MAX_ROWS,
        )


_TX_ROW_COLOR = {
    "RECEIVE":   "D4EDDA",
    "PRODUCE":   "CCE5FF",
    "SHIP":      "F8D7DA",
    "ADJUST":    "FFF3CD",
    "BACKFLUSH": "FFE5B4",
    "TRANSFER_TO_PROD": "E0E7FF",
    "TRANSFER_TO_WH":   "E0E7FF",
    "TRANSFER_DEPT":    "E0E7FF",
    "MARK_DEFECTIVE":   "FBD9D7",
    "SUPPLIER_RETURN":  "F4C7C3",
}


def _log_snapshot(log: TransactionLog) -> dict:
    """TransactionLog의 가변 필드 스냅샷 (JSON 직렬화 가능 형태)."""
    return {
        "transaction_type": log.transaction_type.value if log.transaction_type else None,
        "quantity_change": str(log.quantity_change) if log.quantity_change is not None else None,
        "reference_no": log.reference_no,
        "produced_by": log.produced_by,
        "notes": log.notes,
    }


def _verify_editor(
    db: Session,
    employee_id: uuid.UUID,
    pin: str,
    request: Optional[Request] = None,
) -> Employee:
    """수정자 직원 + PIN 검증. 작업자 식별용 — 실제 보안 인증이 아님."""
    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not employee:
        raise http_error(404, ErrorCode.NOT_FOUND, "수정자 직원을 찾을 수 없습니다.")
    if not bool(employee.is_active):
        raise http_error(403, ErrorCode.FORBIDDEN, "비활성 직원은 거래를 수정할 수 없습니다.")
    if not verify_pin(employee.pin_hash, pin):
        raise http_error(403, ErrorCode.FORBIDDEN, "PIN이 올바르지 않습니다.")
    set_actor(request, employee)
    return employee


@router.get("/transactions/monthly-counts", summary="연도별 월별 거래 카운트")
def monthly_counts(
    year: int = Query(..., ge=2020, le=2100),
    db: Session = Depends(get_db),
) -> dict[str, int]:
    """주어진 year의 월별 거래 건수 반환. 빈 month는 0.

    응답 예: { "2026-01": 142, "2026-02": 89, ..., "2026-12": 0 }
    archived_at 이 있는 레코드는 제외한다.
    """
    rows = (
        db.query(
            extract("month", TransactionLog.created_at).label("month"),
            func.count(TransactionLog.log_id).label("count"),
        )
        .filter(
            extract("year", TransactionLog.created_at) == year,
            TransactionLog.archived_at.is_(None),
        )
        .group_by(extract("month", TransactionLog.created_at))
        .all()
    )
    counts = {f"{year:04d}-{int(r.month):02d}": int(r.count) for r in rows}
    return {f"{year:04d}-{m:02d}": counts.get(f"{year:04d}-{m:02d}", 0) for m in range(1, 13)}


@router.get("/transactions", response_model=List[TransactionLogResponse])
def list_transactions(
    item_id: Optional[uuid.UUID] = Query(None),
    transaction_type: Optional[TransactionTypeEnum] = Query(None),
    transaction_types: Optional[str] = Query(None, description="쉼표 구분 복수 타입. 예: RECEIVE,SHIP"),
    reference_no: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    department: Optional[str] = Query(
        None, description="부서 라벨 필터 (쉼표 복수). 예: 조립,고압. '창고'·'미상' 포함 가능"
    ),
    model: Optional[str] = Query(None, description="제품 모델명 필터 (쉼표 복수)"),
    process_step: Optional[str] = Query(
        None, description="공정 구분 필터 R/A/F (쉼표 복수)"
    ),
    date_from: Optional[date] = Query(None, description="포함 시작일 YYYY-MM-DD"),
    date_to: Optional[date] = Query(None, description="포함 종료일 YYYY-MM-DD"),
    include_archived: bool = Query(False, description="archived_at 이 있는 레코드 포함 여부"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    # edit_count 서브쿼리: 각 TransactionLog의 수정 이력 건수
    edit_count_sq = (
        select(func.count(TransactionEditLog.edit_id))
        .where(TransactionEditLog.original_log_id == TransactionLog.log_id)
        .correlate(TransactionLog)
        .scalar_subquery()
    )

    # IoBatch outerjoin — search 에서 IoBatch.requester_name 까지 매칭하기 위함.
    # operation_batch_id 가 NULL 인 row 도 보존하기 위해 outerjoin.
    # IoBatch.batch_id 가 PK 라 1:1 join → row 중복 없음, 정렬/페이지네이션 영향 없음.
    query = (
        db.query(TransactionLog, Item, edit_count_sq.label("edit_count"))
        .join(Item, TransactionLog.item_id == Item.item_id)
        .outerjoin(IoBatch, TransactionLog.operation_batch_id == IoBatch.batch_id)
    )

    if item_id:
        query = query.filter(TransactionLog.item_id == item_id)

    # 단수 transaction_type: 타 화면 호환용 — 원시 IN 필터 유지
    if transaction_type:
        query = query.filter(TransactionLog.transaction_type == transaction_type)

    if reference_no:
        query = query.filter(TransactionLog.reference_no == reference_no)

    # 복수 transaction_types / 부서 / 공정 / 모델 / 기간 / 아카이브 / 검색:
    # summary 와 동일한 공통 필터 빌더로 위임.
    query = _apply_common_filters(
        query,
        db,
        transaction_types=transaction_types,
        search=search,
        department=department,
        model=model,
        process_step=process_step,
        date_from=date_from,
        date_to=date_to,
        include_archived=include_archived,
    )

    # 김현우·허동현 피드백: 입출고 내역은 '요청일시'(요청자가 작성한 시각) 순으로 정렬한다.
    # 승인 필요 건은 승인 시점에 TransactionLog(created_at)가 생기므로 created_at 정렬은 '승인 순'이 된다.
    # 화면의 요청일시 = COALESCE(IoBatch.submitted_at, IoBatch.created_at, log.created_at)(_batch_name_map/
    # _to_log_response 와 동일 기준)로 정렬하고, 같은 요청(배치 내 복수 행)·동시각은 created_at·log_id 로 안정 정렬.
    requested_at_order = func.coalesce(
        IoBatch.submitted_at, IoBatch.created_at, TransactionLog.created_at
    )
    rows = (
        query.order_by(
            requested_at_order.desc(),
            TransactionLog.created_at.desc(),
            TransactionLog.log_id.desc(),
        )
        .offset(skip)
        .limit(limit)
        .all()
    )

    # operation_batch_id 기준 requester_name + approver_name 매핑(export 와 공유 헬퍼).
    batch_ids = {log.operation_batch_id for log, _, _ in rows if log.operation_batch_id}
    batch_map = _batch_name_map(db, batch_ids)

    result = []
    for log, item, edit_count in rows:
        info = batch_map.get(log.operation_batch_id)
        result.append(
            _to_log_response(
                log,
                item,
                int(edit_count or 0),
                requester_name=info.requester_name if info else None,
                approver_name=info.approver_name if info else None,
                requested_at=info.requested_at if info else None,
                approved_at=info.approved_at if info else None,
            )
        )
    return result


@router.get("/transactions/summary", response_model=TransactionSummaryResponse)
def get_transactions_summary(
    transaction_types: Optional[str] = Query(None, description="쉼표 구분 복수 타입"),
    search: Optional[str] = Query(None),
    department: Optional[str] = Query(
        None, description="부서 라벨 필터 (쉼표 복수). 예: 조립,고압. '창고'·'미상' 포함 가능"
    ),
    model: Optional[str] = Query(None, description="제품 모델명 필터 (쉼표 복수)"),
    process_step: Optional[str] = Query(
        None, description="공정 구분 필터 R/A/F (쉼표 복수)"
    ),
    date_from: Optional[date] = Query(None, description="포함 시작일 YYYY-MM-DD"),
    date_to: Optional[date] = Query(None, description="포함 종료일 YYYY-MM-DD"),
    include_archived: bool = Query(False),
    db: Session = Depends(get_db),
):
    """KPI 카드용 카운트 집계. list_transactions 와 동일한 필터를 받지만 row 가 아니라
    숫자만 반환 — 화면에 로드된 100건이 아니라 조건 전체를 보여주기 위함.
    department_counts 는 전 거래를 3단계 라벨(부서명·'창고'·'미상')로 묶은 카운트.
    """
    # list_transactions 와 동일한 join 패턴 — search 가 IoBatch.requester_name 까지 닿게.
    query = (
        db.query(TransactionLog)
        .join(Item, TransactionLog.item_id == Item.item_id)
        .outerjoin(IoBatch, TransactionLog.operation_batch_id == IoBatch.batch_id)
    )

    # list_transactions 와 동일한 공통 필터 빌더로 위임.
    query = _apply_common_filters(
        query,
        db,
        transaction_types=transaction_types,
        search=search,
        department=department,
        model=model,
        process_step=process_step,
        date_from=date_from,
        date_to=date_to,
        include_archived=include_archived,
    )

    # 한 번의 집계 쿼리로 4개 카운트.
    agg = query.with_entities(
        func.count(TransactionLog.log_id).label("total"),
        func.coalesce(
            func.sum(case((TransactionLog.transaction_type.in_(_SUMMARY_WAREHOUSE_TYPES), 1), else_=0)),
            0,
        ).label("warehouse_count"),
        func.coalesce(
            func.sum(case((TransactionLog.transaction_type.in_(_SUMMARY_DEPT_TYPES), 1), else_=0)),
            0,
        ).label("dept_count"),
        func.coalesce(
            func.sum(case((TransactionLog.transaction_type.in_(_SUMMARY_ADJUST_TYPES), 1), else_=0)),
            0,
        ).label("adjust_count"),
    ).one()

    # 전 거래 부서별 카운트 (3단계 라벨 기준: 부서명·'창고'·'미상').
    # 제한 필터 없음 — '창고' 도 집계됨. NULL 반환은 없지만 방어 가드 유지.
    dexpr = _department_label_expr()
    dept_rows = (
        query.with_entities(dexpr.label("dept"), func.count(TransactionLog.log_id).label("c"))
        .group_by(dexpr)
        .all()
    )
    department_counts = {r.dept: int(r.c) for r in dept_rows if r.dept is not None}

    return TransactionSummaryResponse(
        total=int(agg.total or 0),
        warehouse_count=int(agg.warehouse_count or 0),
        dept_count=int(agg.dept_count or 0),
        adjust_count=int(agg.adjust_count or 0),
        department_counts=department_counts,
    )


@router.get("/transactions/export.csv")
def export_transactions_csv(
    transaction_type: Optional[TransactionTypeEnum] = Query(None),
    search: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None, description="필수. 포함 시작일 YYYY-MM-DD"),
    end_date: Optional[date] = Query(None, description="필수. 포함 종료일 YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    start_dt, end_dt = _require_export_range(start_date, end_date)

    # 목록 조회와 동일하게 IoBatch outerjoin — search 가 requester_name 까지 닿고
    # 요청자/승인자 컬럼을 채운다(operation_batch_id NULL row 보존 위해 outerjoin).
    query = (
        db.query(TransactionLog, Item)
        .join(Item, TransactionLog.item_id == Item.item_id)
        .outerjoin(IoBatch, TransactionLog.operation_batch_id == IoBatch.batch_id)
    )
    query = query.filter(
        TransactionLog.created_at >= start_dt,
        TransactionLog.created_at <= end_dt,
    )

    if transaction_type:
        query = query.filter(TransactionLog.transaction_type == transaction_type)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                Item.item_name.ilike(pattern),
                Item.mes_code.ilike(pattern),
                TransactionLog.reference_no.ilike(pattern),
                TransactionLog.notes.ilike(pattern),
                TransactionLog.produced_by.ilike(pattern),
                IoBatch.requester_name.ilike(pattern),
            )
        )

    _enforce_export_limit(query.count())
    rows = query.order_by(TransactionLog.created_at.desc()).all()
    batch_map = _batch_name_map(
        db, {log.operation_batch_id for log, _ in rows if log.operation_batch_id}
    )

    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "created_at",
            "transaction_type",
            "mes_code",
            "item_name",
            "process_type_code",
            "quantity_change",
            "quantity_before",
            "quantity_after",
            "reference_no",
            "produced_by",
            "requester_name",
            "approver_name",
            "notes",
        ]
    )
    for log, item in rows:
        info = batch_map.get(log.operation_batch_id)
        requester = info.requester_name if info else None
        approver = info.approver_name if info else None
        writer.writerow(
            [
                log.created_at.isoformat(),
                log.transaction_type.value,
                item.mes_code or "",
                item.item_name,
                item.process_type_code or "",
                float(log.quantity_change),
                "" if log.quantity_before is None else float(log.quantity_before),
                "" if log.quantity_after is None else float(log.quantity_after),
                log.reference_no or "",
                log.produced_by or "",
                requester or "",
                approver or "",
                log.notes or "",
            ]
        )

    return csv_streaming_response(buffer, "transactions-export.csv")


@router.get("/transactions/export.xlsx")
def export_transactions_xlsx(
    transaction_type: Optional[TransactionTypeEnum] = Query(None),
    search: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None, description="필수. 포함 시작일 YYYY-MM-DD"),
    end_date: Optional[date] = Query(None, description="필수. 포함 종료일 YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    from app.utils.excel import apply_header, auto_width, make_xlsx_response

    start_dt, end_dt = _require_export_range(start_date, end_date)

    # 목록 조회와 동일하게 IoBatch outerjoin — search 가 requester_name 까지 닿고
    # 요청자/승인자 컬럼을 채운다.
    query = (
        db.query(TransactionLog, Item)
        .join(Item, TransactionLog.item_id == Item.item_id)
        .outerjoin(IoBatch, TransactionLog.operation_batch_id == IoBatch.batch_id)
    )
    query = query.filter(
        TransactionLog.created_at >= start_dt,
        TransactionLog.created_at <= end_dt,
    )
    if transaction_type:
        query = query.filter(TransactionLog.transaction_type == transaction_type)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                Item.item_name.ilike(pattern),
                Item.mes_code.ilike(pattern),
                TransactionLog.reference_no.ilike(pattern),
                TransactionLog.notes.ilike(pattern),
                TransactionLog.produced_by.ilike(pattern),
                IoBatch.requester_name.ilike(pattern),
            )
        )

    _enforce_export_limit(query.count())
    rows = query.order_by(TransactionLog.created_at.desc()).all()
    batch_map = _batch_name_map(
        db, {log.operation_batch_id for log, _ in rows if log.operation_batch_id}
    )

    wb = Workbook()
    ws = wb.active
    ws.title = "거래 이력"

    tx_label = {
        "RECEIVE": "입고", "PRODUCE": "생산입고", "SHIP": "출고",
        "ADJUST": "재고조정", "BACKFLUSH": "자동차감",
        "TRANSFER_TO_PROD": "창고→부서", "TRANSFER_TO_WH": "부서→창고",
        "TRANSFER_DEPT": "부서간 이동",
        "MARK_DEFECTIVE": "불량 등록", "SUPPLIER_RETURN": "공급업체 반품",
    }

    columns = [
        "일시", "유형", "품목 코드", "품목명", "공정코드",
        "수량변화", "이전재고", "이후재고", "참조번호", "담당자", "요청자", "승인자", "메모",
    ]
    apply_header(ws, columns)

    positive_font = Font(color="1A7C3C", bold=True)
    negative_font = Font(color="CC0000", bold=True)

    for log, item in rows:
        tx_val = log.transaction_type.value
        info = batch_map.get(log.operation_batch_id)
        requester = info.requester_name if info else None
        approver = info.approver_name if info else None
        row_data = [
            log.created_at.strftime("%Y-%m-%d %H:%M") if log.created_at else "",
            tx_label.get(tx_val, tx_val),
            item.mes_code or "",
            item.item_name,
            item.process_type_code or "",
            float(log.quantity_change),
            float(log.quantity_before) if log.quantity_before is not None else "",
            float(log.quantity_after) if log.quantity_after is not None else "",
            log.reference_no or "",
            log.produced_by or "",
            requester or "",
            approver or "",
            log.notes or "",
        ]
        ws.append(row_data)

        row_idx = ws.max_row
        hex_color = _TX_ROW_COLOR.get(tx_val, "FFFFFF")
        row_fill = PatternFill("solid", fgColor=hex_color)
        for cell in ws[row_idx]:
            cell.fill = row_fill

        qty_change_cell = ws.cell(row=row_idx, column=6)
        if isinstance(qty_change_cell.value, float):
            qty_change_cell.font = positive_font if qty_change_cell.value >= 0 else negative_font

    auto_width(ws)
    filename = f"transactions-{date.today().strftime('%Y%m%d')}.xlsx"
    return make_xlsx_response(wb, filename)


# 기존 PUT 엔드포인트는 3차에서 reason+PIN을 요구하는 메타 수정으로 일원화됨.
# 호환성을 위해 PUT 경로는 제거하고 /meta-edit 으로 대체.


@router.post("/transactions/{log_id}/meta-edit", response_model=TransactionLogResponse)
def meta_edit_transaction(
    log_id: uuid.UUID,
    payload: TransactionMetaEditRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """거래 메타데이터(notes/reference_no/produced_by) 수정. 재고에 영향 없음.

    원본 TransactionLog의 메타 필드는 직접 업데이트하지만, 변경 전/후 스냅샷을
    TransactionEditLog에 기록하여 감사 이력을 남긴다.
    """
    log = db.query(TransactionLog).filter(TransactionLog.log_id == log_id).first()
    if not log:
        raise http_error(404, ErrorCode.NOT_FOUND, "거래를 찾을 수 없습니다.")
    item = item_repository.get(db, log.item_id)
    if not item:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")

    if log.transaction_type not in META_CORRECTABLE:
        raise http_error(
            422,
            ErrorCode.BUSINESS_RULE,
            f"이 거래 유형({log.transaction_type.value})은 수정을 지원하지 않습니다.",
        )

    editor = _verify_editor(db, payload.edited_by_employee_id, payload.edited_by_pin, request)

    before = _log_snapshot(log)

    # 변경된 필드만 적용
    if payload.notes is not None:
        log.notes = payload.notes
    if payload.reference_no is not None:
        log.reference_no = payload.reference_no or None
    if payload.produced_by is not None:
        log.produced_by = payload.produced_by or None

    after = _log_snapshot(log)

    edit_log = TransactionEditLog(
        original_log_id=log.log_id,
        edited_by_employee_id=editor.employee_id,
        edited_by_name=editor.name,
        reason=payload.reason,
        before_payload=json.dumps(before, ensure_ascii=False),
        after_payload=json.dumps(after, ensure_ascii=False),
        correction_log_id=None,
    )
    db.add(edit_log)

    audit.record(
        db,
        request=request,
        action="transaction.meta_edit",
        target_type="transaction_log",
        target_id=str(log.log_id),
        payload_summary=f"{editor.name}: {payload.reason}",
    )

    commit_only(db)
    db.refresh(log)

    edit_count = (
        db.query(func.count(TransactionEditLog.edit_id))
        .filter(TransactionEditLog.original_log_id == log.log_id)
        .scalar()
        or 0
    )
    return _to_log_response(log, item, int(edit_count))


@router.get(
    "/transactions/{log_id}/edits",
    response_model=List[TransactionEditLogResponse],
)
def list_transaction_edits(log_id: uuid.UUID, db: Session = Depends(get_db)):
    """특정 거래의 수정 이력 (최신순)."""
    log = db.query(TransactionLog).filter(TransactionLog.log_id == log_id).first()
    if not log:
        raise http_error(404, ErrorCode.NOT_FOUND, "거래를 찾을 수 없습니다.")

    edits = (
        db.query(TransactionEditLog)
        .filter(TransactionEditLog.original_log_id == log_id)
        .order_by(TransactionEditLog.created_at.desc())
        .all()
    )
    return edits


@router.post(
    "/transactions/{log_id}/quantity-correction",
    response_model=TransactionQuantityCorrectionResponse,
)
def quantity_correct_transaction(
    log_id: uuid.UUID,
    payload: TransactionQuantityCorrectionRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """RECEIVE/SHIP 수량 보정. 원본은 보존하고 차액만 ADJUST 거래로 보정한다.

    - delta = new_quantity_change - original.quantity_change
    - new_warehouse = inventory.warehouse_qty + delta (음수 방지 검증)
    - adjust_warehouse() 서비스 호출로 재고 동기화
    - ADJUST TransactionLog 생성 + TransactionEditLog 기록
    """
    log = db.query(TransactionLog).filter(TransactionLog.log_id == log_id).first()
    if not log:
        raise http_error(404, ErrorCode.NOT_FOUND, "거래를 찾을 수 없습니다.")
    item = item_repository.get(db, log.item_id)
    if not item:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")

    if log.transaction_type not in QUANTITY_CORRECTABLE:
        raise http_error(
            422,
            ErrorCode.BUSINESS_RULE,
            f"수량 보정은 RECEIVE / SHIP 유형만 지원합니다 (현재: {log.transaction_type.value}).",
        )

    new_qty = payload.quantity_change

    # SHIP 부호 검증: SHIP은 음수여야 함
    if log.transaction_type == TransactionTypeEnum.SHIP and new_qty >= 0:
        raise http_error(
            422,
            ErrorCode.BUSINESS_RULE,
            "SHIP의 수량 변화량은 음수여야 합니다 (UI에서 양수 입력 시 자동 음수 변환 필요).",
        )
    if log.transaction_type == TransactionTypeEnum.RECEIVE and new_qty <= 0:
        raise http_error(
            422,
            ErrorCode.BUSINESS_RULE,
            "RECEIVE의 수량 변화량은 양수여야 합니다.",
        )

    # 동일 거래에 이미 수량 보정 이력이 있으면 추가 보정 차단 (정책 미확정)
    existing_correction = (
        db.query(TransactionEditLog.edit_id)
        .filter(
            TransactionEditLog.original_log_id == log.log_id,
            TransactionEditLog.correction_log_id.isnot(None),
        )
        .first()
    )
    if existing_correction is not None:
        raise http_error(
            422,
            ErrorCode.BUSINESS_RULE,
            "이미 수량 보정된 거래입니다. 추가 보정은 별도 정책 확정 후 가능합니다.",
        )

    editor = _verify_editor(db, payload.edited_by_employee_id, payload.edited_by_pin, request)

    delta = new_qty - log.quantity_change

    # 재고 검증: 보정 후 warehouse_qty >= max(0, pending_quantity)
    inv = inventory_repository.get(db, log.item_id)
    if not inv:
        raise http_error(404, ErrorCode.NOT_FOUND, "재고 레코드를 찾을 수 없습니다.")

    new_warehouse = inv.warehouse_qty + delta
    if new_warehouse < 0:
        raise http_error(
            422,
            ErrorCode.STOCK_SHORTAGE,
            f"재고 부족: 보정 후 창고 재고가 {float(new_warehouse)}로 음수가 됩니다.",
        )
    # pending_quantity가 None인 레거시 레코드 방어
    pending = inv.pending_quantity or Decimal("0")
    if new_warehouse < pending:
        raise http_error(
            422,
            ErrorCode.STOCK_SHORTAGE,
            "예약 수량보다 창고 재고가 낮아질 수 없습니다.",
        )

    before = _log_snapshot(log)

    # adjust_warehouse 서비스 호출로 재고 절대값 설정
    adjusted_inv, qty_before, _applied_delta = inventory_svc.adjust_warehouse(
        db, log.item_id, new_warehouse
    )

    # 보정 ADJUST 거래 생성 (원본 log 보존)
    correction_log = TransactionLog(
        item_id=log.item_id,
        transaction_type=TransactionTypeEnum.ADJUST,
        quantity_change=delta,
        quantity_before=qty_before,
        quantity_after=adjusted_inv.quantity,
        notes=f"보정: {payload.reason}",
        reference_no=str(log.log_id),
        produced_by=editor.name,
    )
    db.add(correction_log)
    db.flush()  # correction_log.log_id 채움

    after = {
        **before,
        "_correction_log_id": str(correction_log.log_id),
        "_applied_delta": str(delta),
    }

    edit_log = TransactionEditLog(
        original_log_id=log.log_id,
        edited_by_employee_id=editor.employee_id,
        edited_by_name=editor.name,
        reason=payload.reason,
        before_payload=json.dumps(before, ensure_ascii=False),
        after_payload=json.dumps(after, ensure_ascii=False),
        correction_log_id=correction_log.log_id,
    )
    db.add(edit_log)

    audit.record(
        db,
        request=request,
        action="transaction.quantity_correction",
        target_type="transaction_log",
        target_id=str(log.log_id),
        payload_summary=f"{editor.name}: delta={float(delta)}, {payload.reason}",
    )

    commit_only(db)
    db.refresh(log)
    db.refresh(correction_log)

    # edit_count 갱신
    edit_count_orig = (
        db.query(func.count(TransactionEditLog.edit_id))
        .filter(TransactionEditLog.original_log_id == log.log_id)
        .scalar()
        or 0
    )
    return TransactionQuantityCorrectionResponse(
        original=_to_log_response(log, item, int(edit_count_orig)),
        correction=_to_log_response(correction_log, item, 0),
    )


# ---------------------------------------------------------------------------
# 거래 취소
# ---------------------------------------------------------------------------

class TransactionCancelRequest(BaseModel):
    reason: str = Field(..., min_length=1, description="취소 사유 (필수)")
    employee_code: str = Field(..., min_length=1, max_length=30, description="처리자 사번")
    pin: str = Field(..., min_length=1, max_length=20)


def _cancel_one_log(db: Session, log: TransactionLog, inv: Inventory) -> None:
    """단일 TransactionLog 의 재고 효과를 역방향 적용. 범위 외/데이터 부족 시 ValueError.

    1순위: inventory_effect(거래가 건드린 셀 증감 기록)가 있으면 부호 반전해 일반적으로 역재생.
    레거시(효과 기록 이전 로그)는 유형별 필드 재구성으로 폴백하되, 정보가 부족한 유형은 거부.
    """
    from decimal import Decimal as _D

    # 1순위 — 효과 기록 기반 일반 역재생(유형 무관, 불량·이동·생산·분해 모두 정확).
    if log.inventory_effect is not None:
        from app.services.inv_effect import apply_effect_reverse
        apply_effect_reverse(db, log.item_id, log.inventory_effect)
        return

    # 레거시 폴백 — 효과 기록 이전에 생성된 로그.
    tx = log.transaction_type
    qty = _D(str(log.transfer_qty or abs(log.quantity_change or 0)))

    WAREHOUSE_ONLY = {
        TransactionTypeEnum.RECEIVE,
        TransactionTypeEnum.SHIP,
        TransactionTypeEnum.ADJUST,
    }
    DEPT_ONLY = {
        TransactionTypeEnum.PRODUCE,
        TransactionTypeEnum.BACKFLUSH,
        TransactionTypeEnum.SUPPLIER_RETURN,
    }
    TRANSFER_TYPES = {
        TransactionTypeEnum.TRANSFER_TO_PROD,
        TransactionTypeEnum.TRANSFER_TO_WH,
        TransactionTypeEnum.TRANSFER_DEPT,
    }

    if tx in WAREHOUSE_ONLY:
        # quantity_change: RECEIVE=+, SHIP=-, ADJUST=±
        delta = _D(str(log.quantity_change or 0))
        new_wh = (inv.warehouse_qty or _D("0")) - delta
        if new_wh < 0:
            raise ValueError(f"취소 후 창고 재고가 음수({new_wh})가 됩니다.")
        inv.warehouse_qty = new_wh

    elif tx in DEPT_ONLY:
        dept_name = log.department
        if not dept_name:
            raise ValueError("이 거래의 부서 정보가 없어 취소할 수 없습니다. (이전 버전 로그)")
        loc = (
            db.query(InventoryLocation)
            .filter(
                InventoryLocation.item_id == log.item_id,
                InventoryLocation.department == dept_name,
                InventoryLocation.status == LocationStatusEnum.PRODUCTION,
            )
            .first()
        )
        if loc is None:
            raise ValueError(f"{dept_name} 부서 재고 위치를 찾을 수 없습니다.")
        # PRODUCE: quantity_change=+qty (입고), 역: -qty
        # BACKFLUSH/SUPPLIER_RETURN: quantity_change=-qty (출고), 역: +qty
        delta = _D(str(log.quantity_change or 0))
        new_loc_qty = (loc.quantity or _D("0")) - delta
        if new_loc_qty < 0:
            raise ValueError(f"취소 후 {dept_name} 부서 재고가 음수({new_loc_qty})가 됩니다.")
        loc.quantity = new_loc_qty

    elif tx in TRANSFER_TYPES:
        dept_name = log.department
        if not dept_name:
            raise ValueError("이 거래의 부서 정보가 없어 취소할 수 없습니다. (이전 버전 로그)")
        loc = (
            db.query(InventoryLocation)
            .filter(
                InventoryLocation.item_id == log.item_id,
                InventoryLocation.department == dept_name,
                InventoryLocation.status == LocationStatusEnum.PRODUCTION,
            )
            .first()
        )
        if loc is None:
            raise ValueError(f"{dept_name} 부서 재고 위치를 찾을 수 없습니다.")

        if tx == TransactionTypeEnum.TRANSFER_TO_PROD:
            # 창고↓, 부서↑ → 역: 창고↑, 부서↓
            new_wh = (inv.warehouse_qty or _D("0")) + qty
            new_loc = (loc.quantity or _D("0")) - qty
            if new_loc < 0:
                raise ValueError(f"취소 후 {dept_name} 부서 재고가 음수({new_loc})가 됩니다.")
            inv.warehouse_qty = new_wh
            loc.quantity = new_loc
        elif tx == TransactionTypeEnum.TRANSFER_TO_WH:
            # 부서↓, 창고↑ → 역: 부서↑, 창고↓
            new_wh = (inv.warehouse_qty or _D("0")) - qty
            new_loc = (loc.quantity or _D("0")) + qty
            if new_wh < 0:
                raise ValueError(f"취소 후 창고 재고가 음수({new_wh})가 됩니다.")
            inv.warehouse_qty = new_wh
            loc.quantity = new_loc
        else:  # TRANSFER_DEPT: from_dept↓, to_dept↑ (to_dept 정보가 로그에 없어 복원 불가)
            raise ValueError(
                "이전 버전 거래라 자동 취소할 수 없습니다. 반대 방향 이동으로 직접 처리해 주세요."
            )
    elif tx == TransactionTypeEnum.MARK_DEFECTIVE:
        dept_name = log.department
        if not dept_name:
            raise ValueError("이 거래의 부서 정보가 없어 취소할 수 없습니다. (이전 버전 로그)")
        if log.transfer_qty:
            q_qty = _D(str(log.transfer_qty))
        elif log.warehouse_qty_before is not None and log.warehouse_qty_after is not None:
            q_qty = _D(str(log.warehouse_qty_before)) - _D(str(log.warehouse_qty_after))
        else:
            raise ValueError("이전 버전 거래라 격리 수량을 추론할 수 없습니다.")
        if q_qty <= 0:
            raise ValueError("이전 버전 거래라 격리 수량을 추론할 수 없습니다.")
        inv.warehouse_qty = (inv.warehouse_qty or _D("0")) + q_qty
        loc = (
            db.query(InventoryLocation)
            .filter(
                InventoryLocation.item_id == log.item_id,
                InventoryLocation.department == dept_name,
                InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
            )
            .first()
        )
        if loc is None:
            raise ValueError(f"{dept_name} 부서 불량 재고 위치를 찾을 수 없습니다.")
        new_qty = (loc.quantity or _D("0")) - q_qty
        if new_qty < 0:
            raise ValueError(f"취소 후 {dept_name} 부서 불량 재고가 음수({new_qty})가 됩니다.")
        loc.quantity = new_qty
    else:
        # 레거시 UNMARK_DEFECTIVE·분해(DISASSEMBLE) 등 — 수량/방향 정보 부족.
        raise ValueError(
            "이전 버전 거래라 자동 취소할 수 없습니다. 불량 해제 등 기존 기능을 사용해 주세요."
        )


@router.post("/transactions/{log_id}/cancel", response_model=TransactionLogResponse)
def cancel_transaction(
    log_id: uuid.UUID,
    payload: TransactionCancelRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """거래 취소 — 내역 유지 + 재고 자동 롤백 + '취소됨' 표시.

    권한: 요청자 본인(producer_employee_id) 또는 결재 권한자(warehouse_role / department_role != none).
    BOM 배치(PRODUCE+BACKFLUSH)는 operation_batch_id 단위로 일괄 취소.
    """
    from datetime import datetime as _dt

    log = db.query(TransactionLog).filter(TransactionLog.log_id == log_id).first()
    if not log:
        raise http_error(404, ErrorCode.NOT_FOUND, "거래를 찾을 수 없습니다.")

    if bool(getattr(log, "cancelled", False)):
        raise http_error(422, ErrorCode.BUSINESS_RULE, "이미 취소된 거래입니다.")

    item = item_repository.get(db, log.item_id)
    if not item:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")

    canceller = db.query(Employee).filter(Employee.employee_code == payload.employee_code).first()
    if not canceller:
        raise http_error(404, ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다.")
    if not bool(canceller.is_active):
        raise http_error(403, ErrorCode.FORBIDDEN, "비활성 직원은 거래를 취소할 수 없습니다.")
    if not verify_pin(canceller.pin_hash, payload.pin):
        raise http_error(403, ErrorCode.FORBIDDEN, "PIN이 올바르지 않습니다.")

    # 권한 체크: 본인(요청자) 또는 결재 권한자
    # 요청자 식별 — 히스토리 화면의 '요청자' 표기와 동일한 우선순위로 판정한다:
    #   1) producer_employee_id (입고/이동/생산 등 레거시 경로)
    #   2) operation_batch_id → IoBatch.requester_employee_id (IO v2 배치 경로)
    #   3) produced_by(요청자 이름) — 배치 없는 IO 로그(새 불량 등)의 유일한 단서
    requester_eid: Optional[str] = None
    if log.producer_employee_id is not None:
        requester_eid = str(log.producer_employee_id)
    elif log.operation_batch_id is not None:
        batch = (
            db.query(IoBatch)
            .filter(IoBatch.batch_id == log.operation_batch_id)
            .first()
        )
        if batch is not None and batch.requester_employee_id is not None:
            requester_eid = str(batch.requester_employee_id)
    if requester_eid is not None:
        is_self = requester_eid == str(canceller.employee_id)
    else:
        # employee_id 단서가 없는 로그 — 기록된 요청자 이름으로 대조(화면 표기와 일치).
        is_self = bool(log.produced_by) and log.produced_by == canceller.name
    is_approver = (
        (getattr(canceller, "warehouse_role", None) or "none").lower() != "none"
        or (getattr(canceller, "department_role", None) or "none").lower() != "none"
    )
    if not (is_self or is_approver):
        raise http_error(403, ErrorCode.FORBIDDEN, "본인 거래 또는 결재 권한자만 취소할 수 있습니다.")

    set_actor(request, canceller)

    # 배치 단위 취소 — 복합 작업은 묶음 전체를 함께 되돌려야 정합이 맞는다.
    #  - PRODUCE+BACKFLUSH 등 IO v2: operation_batch_id 로 묶임.
    #  - 분해(재작업): operation_batch_id 가 없고 reference_no="defect-disassemble:{uuid}" 로 묶임.
    batch_logs: list[TransactionLog] = []
    if log.operation_batch_id:
        batch_logs = (
            db.query(TransactionLog)
            .filter(
                TransactionLog.operation_batch_id == log.operation_batch_id,
                TransactionLog.cancelled.is_(False),
            )
            .all()
        )
    elif log.reference_no and log.reference_no.startswith("defect-disassemble:"):
        batch_logs = (
            db.query(TransactionLog)
            .filter(
                TransactionLog.reference_no == log.reference_no,
                TransactionLog.cancelled.is_(False),
            )
            .all()
        )
    if not batch_logs:
        batch_logs = [log]

    now = _dt.utcnow()
    for bl in batch_logs:
        bl_inv = inventory_repository.get(db, bl.item_id)
        if not bl_inv:
            raise http_error(404, ErrorCode.NOT_FOUND, f"재고 레코드를 찾을 수 없습니다 (item={bl.item_id}).")
        try:
            _cancel_one_log(db, bl, bl_inv)
        except ValueError as exc:
            raise http_error(422, ErrorCode.BUSINESS_RULE, str(exc))
        from app.services.inv_calc import _sync_total
        _sync_total(db, bl_inv)
        bl.cancelled = True
        bl.cancel_reason = payload.reason
        bl.cancelled_by = canceller.employee_id
        bl.cancelled_at = now

    audit.record(
        db,
        request=request,
        action="transaction.cancel",
        target_type="transaction_log",
        target_id=str(log.log_id),
        payload_summary=f"{canceller.name}: {payload.reason}",
    )

    commit_only(db)
    db.refresh(log)

    edit_count = (
        db.query(func.count(TransactionEditLog.edit_id))
        .filter(TransactionEditLog.original_log_id == log.log_id)
        .scalar()
        or 0
    )
    return _to_log_response(log, item, int(edit_count))
