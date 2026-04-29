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
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Employee,
    Inventory,
    Item,
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


def _to_log_response(log: TransactionLog, item: Item, edit_count: int = 0) -> TransactionLogResponse:
    return TransactionLogResponse(
        log_id=log.log_id,
        item_id=log.item_id,
        erp_code=item.erp_code,
        item_name=item.item_name,
        item_category=item.category,
        item_unit=item.unit,
        transaction_type=log.transaction_type,
        quantity_change=log.quantity_change,
        quantity_before=log.quantity_before,
        quantity_after=log.quantity_after,
        reference_no=log.reference_no,
        produced_by=log.produced_by,
        notes=log.notes,
        created_at=log.created_at,
        edit_count=edit_count,
    )


def _log_snapshot(log: TransactionLog) -> dict:
    """TransactionLog의 가변 필드 스냅샷 (JSON 직렬화 가능 형태)."""
    return {
        "transaction_type": log.transaction_type.value if log.transaction_type else None,
        "quantity_change": str(log.quantity_change) if log.quantity_change is not None else None,
        "reference_no": log.reference_no,
        "produced_by": log.produced_by,
        "notes": log.notes,
    }


def _verify_editor(db: Session, employee_id: uuid.UUID, pin: str) -> Employee:
    """수정자 직원 + PIN 검증. 작업자 식별용 — 실제 보안 인증이 아님."""
    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not employee:
        raise http_error(404, ErrorCode.NOT_FOUND, "수정자 직원을 찾을 수 없습니다.")
    if not bool(employee.is_active):
        raise http_error(403, ErrorCode.FORBIDDEN, "비활성 직원은 거래를 수정할 수 없습니다.")
    if not verify_pin(employee.pin_hash, pin):
        raise http_error(403, ErrorCode.FORBIDDEN, "PIN이 올바르지 않습니다.")
    return employee


@router.get("/transactions", response_model=List[TransactionLogResponse])
def list_transactions(
    item_id: Optional[uuid.UUID] = Query(None),
    transaction_type: Optional[TransactionTypeEnum] = Query(None),
    reference_no: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
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

    query = (
        db.query(TransactionLog, Item, edit_count_sq.label("edit_count"))
        .join(Item, TransactionLog.item_id == Item.item_id)
    )

    if item_id:
        query = query.filter(TransactionLog.item_id == item_id)
    if transaction_type:
        query = query.filter(TransactionLog.transaction_type == transaction_type)
    if reference_no:
        query = query.filter(TransactionLog.reference_no == reference_no)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                Item.item_name.ilike(pattern),
                Item.erp_code.ilike(pattern),
                TransactionLog.reference_no.ilike(pattern),
                TransactionLog.notes.ilike(pattern),
                TransactionLog.produced_by.ilike(pattern),
            )
        )

    rows = query.order_by(TransactionLog.created_at.desc()).offset(skip).limit(limit).all()

    return [_to_log_response(log, item, int(edit_count or 0)) for log, item, edit_count in rows]


@router.get("/transactions/export.csv")
def export_transactions_csv(
    transaction_type: Optional[TransactionTypeEnum] = Query(None),
    search: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None, description="필수. 포함 시작일 YYYY-MM-DD"),
    end_date: Optional[date] = Query(None, description="필수. 포함 종료일 YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    start_dt, end_dt = _require_export_range(start_date, end_date)

    query = db.query(TransactionLog, Item).join(Item, TransactionLog.item_id == Item.item_id)
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
                Item.erp_code.ilike(pattern),
                TransactionLog.reference_no.ilike(pattern),
                TransactionLog.notes.ilike(pattern),
                TransactionLog.produced_by.ilike(pattern),
            )
        )

    _enforce_export_limit(query.count())
    rows = query.order_by(TransactionLog.created_at.desc()).all()

    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "created_at",
            "transaction_type",
            "erp_code",
            "item_name",
            "category",
            "quantity_change",
            "quantity_before",
            "quantity_after",
            "reference_no",
            "produced_by",
            "notes",
        ]
    )
    for log, item in rows:
        writer.writerow(
            [
                log.created_at.isoformat(),
                log.transaction_type.value,
                item.erp_code or "",
                item.item_name,
                item.category.value,
                float(log.quantity_change),
                "" if log.quantity_before is None else float(log.quantity_before),
                "" if log.quantity_after is None else float(log.quantity_after),
                log.reference_no or "",
                log.produced_by or "",
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

    query = db.query(TransactionLog, Item).join(Item, TransactionLog.item_id == Item.item_id)
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
                Item.erp_code.ilike(pattern),
                TransactionLog.reference_no.ilike(pattern),
                TransactionLog.notes.ilike(pattern),
                TransactionLog.produced_by.ilike(pattern),
            )
        )

    _enforce_export_limit(query.count())
    rows = query.order_by(TransactionLog.created_at.desc()).all()

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
        "일시", "유형", "품목 코드", "품목명", "카테고리",
        "수량변화", "이전재고", "이후재고", "참조번호", "담당자", "메모",
    ]
    apply_header(ws, columns)

    positive_font = Font(color="1A7C3C", bold=True)
    negative_font = Font(color="CC0000", bold=True)

    for log, item in rows:
        tx_val = log.transaction_type.value
        row_data = [
            log.created_at.strftime("%Y-%m-%d %H:%M") if log.created_at else "",
            tx_label.get(tx_val, tx_val),
            item.erp_code or "",
            item.item_name,
            item.category.value,
            float(log.quantity_change),
            float(log.quantity_before) if log.quantity_before is not None else "",
            float(log.quantity_after) if log.quantity_after is not None else "",
            log.reference_no or "",
            log.produced_by or "",
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
    item = db.query(Item).filter(Item.item_id == log.item_id).first()
    if not item:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")

    if log.transaction_type not in META_CORRECTABLE:
        raise http_error(
            422,
            ErrorCode.BUSINESS_RULE,
            f"이 거래 유형({log.transaction_type.value})은 수정을 지원하지 않습니다.",
        )

    editor = _verify_editor(db, payload.edited_by_employee_id, payload.edited_by_pin)

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
    item = db.query(Item).filter(Item.item_id == log.item_id).first()
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

    editor = _verify_editor(db, payload.edited_by_employee_id, payload.edited_by_pin)

    delta = new_qty - log.quantity_change

    # 재고 검증: 보정 후 warehouse_qty >= max(0, pending_quantity)
    inv = db.query(Inventory).filter(Inventory.item_id == log.item_id).first()
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
