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
from pydantic import BaseModel
from sqlalchemy import and_, case, extract, func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Employee,
    IoBatch,
    Inventory,
    Item,
    ProductSymbol,
    StockRequest,
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

# /transactions/summary 카테고리 — 프론트 historyShared.ts 의 scope 멤버와 일치.
_SUMMARY_WAREHOUSE_TYPES = [
    TransactionTypeEnum.RECEIVE,
    TransactionTypeEnum.SHIP,
    TransactionTypeEnum.TRANSFER_TO_PROD,
    TransactionTypeEnum.TRANSFER_TO_WH,
]
_SUMMARY_DEPT_TYPES = [
    TransactionTypeEnum.TRANSFER_DEPT,
    TransactionTypeEnum.BACKFLUSH,
    TransactionTypeEnum.PRODUCE,
    TransactionTypeEnum.DISASSEMBLE,
]
_SUMMARY_ADJUST_TYPES = [TransactionTypeEnum.ADJUST]
_SUMMARY_DEFECT_TYPES = [
    TransactionTypeEnum.MARK_DEFECTIVE,
    TransactionTypeEnum.UNMARK_DEFECTIVE,
    TransactionTypeEnum.DEFECT_SCRAP,
    TransactionTypeEnum.SUPPLIER_RETURN,
]


def _department_label_expr():
    """거래 한 건의 부서 라벨 식.

    1) 부서계열(PRODUCE/BACKFLUSH/…): IoBatch.to/from_department.
    2) 창고계열(RECEIVE/SHIP/…): 고정 '창고'.
    3) 수량조정(ADJUST): IoBatch.to/from_department (io.py 통해 배치 있음).
    4) 불량계열(MARK_DEFECTIVE/…): IoBatch 우선, 없으면 TransactionLog.department.
    5) 그 외: '미상'.
    """
    return case(
        (
            TransactionLog.transaction_type.in_(_SUMMARY_DEPT_TYPES),
            func.coalesce(IoBatch.to_department, IoBatch.from_department, "미상"),
        ),
        (TransactionLog.transaction_type.in_(_SUMMARY_WAREHOUSE_TYPES), "창고"),
        (
            TransactionLog.transaction_type.in_(_SUMMARY_ADJUST_TYPES),
            func.coalesce(IoBatch.to_department, IoBatch.from_department, "미상"),
        ),
        (
            TransactionLog.transaction_type.in_(_SUMMARY_DEFECT_TYPES),
            func.coalesce(
                IoBatch.to_department,
                IoBatch.from_department,
                TransactionLog.department,
                "미상",
            ),
        ),
        else_="미상",
    )


def _process_step_filter(process_step: Optional[str]):
    """process_type_code 마지막 글자(R 원자재 / A 중간공정 / F 공정완료) IN 필터.
    쉼표 복수. 자재목록 대시보드와 같은 기준(코드 끝 1글자). 없으면 None.
    """
    if not process_step:
        return None
    steps = [s.strip().upper() for s in process_step.split(",") if s.strip()]
    if not steps:
        return None
    last_char = func.substr(
        Item.process_type_code, func.length(Item.process_type_code), 1
    )
    return last_char.in_(steps)


def _model_filter(db: Session, model: Optional[str]):
    """model_name IN 필터 — Item.item_code prefix 기반.

    회사 규약: 품목 코드의 첫 '-' 앞 글자열의 각 글자가 ProductSymbol.symbol 과 1:1 대응.
    예: "8-AR-0307"·"78-PR-0042" 둘 다 SOLO(symbol='8') 매칭.
    실제 DB 최대 prefix 길이는 5자(34678-…) — 안전 상한 6자까지 OR LIKE 절들로 처리.
    쉼표 복수 model_name OR 결합. 매칭되는 symbol 없으면 None (필터 무력화).

    Item 테이블이 이미 join 되어 있어야 함 (list_transactions/summary 빌더 기준).
    """
    if not model:
        return None
    names = [m.strip() for m in model.split(",") if m.strip()]
    if not names:
        return None
    symbols = [
        row[0]
        for row in db.query(ProductSymbol.symbol)
        .filter(ProductSymbol.model_name.in_(names), ProductSymbol.symbol.isnot(None))
        .all()
    ]
    if not symbols:
        return None
    # prefix = item_code 의 첫 '-' 앞 부분만 잘라낸 뒤 그 안에 symbol 글자 포함 여부 검사.
    # SQLite/PostgreSQL 공통 함수: instr(필드, '-') / substr(필드, 1, n).
    # PostgreSQL 은 strpos(필드, '-') 와 substr 가 동일 시그니처 → func.instr 호출이 동작 안 함
    #   (PG 는 instr 없음). DB 가 SQLite 라는 게 운영 전제 — _attic/docs/openapi.json baseline.
    dash_pos = func.instr(Item.item_code, "-")
    prefix_expr = func.substr(Item.item_code, 1, dash_pos - 1)
    clauses = []
    for sym in symbols:
        # 단일 문자 symbol 운영 전제. '%' '_' 들어가도 escape 처리 후 LIKE.
        s = sym.replace("%", "\\%").replace("_", "\\_")
        clauses.append(prefix_expr.like(f"%{s}%", escape="\\"))
    # dash_pos == 0 (코드에 '-' 없음) 또는 item_code NULL 은 자연히 매칭 실패.
    return and_(Item.item_code.isnot(None), dash_pos > 0, or_(*clauses))


def _department_filter(department: Optional[str]):
    """부서 라벨 IN 필터. 쉼표 복수 가능. 없으면 None.
    _department_label_expr() 기준(부서계열→부서명·창고계열→'창고'·그외→'미상').
    """
    if not department:
        return None
    depts = [d.strip() for d in department.split(",") if d.strip()]
    if not depts:
        return None
    return _department_label_expr().in_(depts)


# 단일 출처: historyBatchInterpreter.ts:120-150 — 분기 시 구분/필터 불일치 재발
# IoBatch.sub_type → 화면 표시 라벨 매핑 (프론트 _SUB_TYPE_OPERATION 동일)
_SUBTYPE_OP: dict[str, str] = {
    "produce": "생산 등록",
    "disassemble": "재작업",
    "warehouse_to_dept": "창고 반출",
    "dept_to_warehouse": "창고 반입",
    "dept_transfer": "부서 이동",
    "adjust_in": "수량 조정",
    "adjust_out": "수량 조정",
    "receive_supplier": "원자재 입고",
    "supplier_return": "공급사 반품",
    "defect_quarantine": "불량 처리",
}

# TransactionLog.transaction_type → 화면 표시 라벨 매핑 (프론트 _TX_OPERATION 동일)
_TX_OP: dict[str, str] = {
    "RECEIVE": "원자재 입고",
    "SHIP": "출고",
    "TRANSFER_TO_PROD": "창고 반출",
    "TRANSFER_TO_WH": "창고 반입",
    "TRANSFER_DEPT": "부서 이동",
    "BACKFLUSH": "자동 차감",
    "PRODUCE": "생산 등록",
    "DISASSEMBLE": "재작업",
    "ADJUST": "수량 조정",
    "MARK_DEFECTIVE": "불량 처리",
    "SUPPLIER_RETURN": "공급사 반품",
}

# sub_type 이 있으면 라벨을 결정하는 키 집합 (tx 기반 라벨을 덮어쓴다)
_DETERMINING_SUBTYPES: set[str] = set(_SUBTYPE_OP)


def _operation_filter(transaction_types: Optional[str]):
    """화면 표시 구분 기준 operation-aware 필터.

    transaction_types 가 쉼표로 들어오면 각 tx 코드가 가리키는 화면 라벨 L 을 구해,
    해당 라벨로 표시되는 row 를 OR 로 묶는다.

    row 의 화면 라벨 = IoBatch.sub_type 이 _DETERMINING_SUBTYPES 에 있으면
    _SUBTYPE_OP[sub_type], 없으면 _TX_OP[transaction_type].

    없거나 알 수 없는 코드는 무시. 유효한 코드가 없으면 None 반환.
    """
    if not transaction_types:
        return None

    clauses = []
    for raw in transaction_types.split(","):
        code = raw.strip()
        if not code:
            continue
        label = _TX_OP.get(code)
        if label is None:
            continue  # 알 수 없는 코드 무시

        # 이 라벨에 해당하는 sub_type 키 목록
        sub_set = [s for s, lbl in _SUBTYPE_OP.items() if lbl == label]
        # 이 라벨에 해당하는 tx 코드 목록
        tx_set = [t for t, lbl in _TX_OP.items() if lbl == label]

        parts = []
        if sub_set:
            # sub_type 이 결정적인 경우: sub_type 으로 직접 매칭
            parts.append(IoBatch.sub_type.in_(sub_set))

        # tx 코드 기반: batch 없거나 sub_type 이 결정적이지 않은 경우
        if tx_set:
            parts.append(
                and_(
                    TransactionLog.transaction_type.in_(
                        [TransactionTypeEnum(t) for t in tx_set if t in TransactionTypeEnum._value2member_map_]
                    ),
                    or_(
                        IoBatch.batch_id.is_(None),
                        IoBatch.sub_type.is_(None),
                        IoBatch.sub_type.notin_(list(_DETERMINING_SUBTYPES)),
                    ),
                )
            )

        if parts:
            clauses.append(or_(*parts))

    if not clauses:
        return None
    return or_(*clauses)


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


def _to_log_response(
    log: TransactionLog,
    item: Item,
    edit_count: int = 0,
    requester_name: Optional[str] = None,
    approver_name: Optional[str] = None,
) -> TransactionLogResponse:
    return TransactionLogResponse(
        log_id=log.log_id,
        item_id=log.item_id,
        item_code=item.item_code,
        item_name=item.item_name,
        item_process_type_code=item.process_type_code,
        item_unit=item.unit,
        transaction_type=log.transaction_type,
        quantity_change=log.quantity_change,
        quantity_before=log.quantity_before,
        quantity_after=log.quantity_after,
        transfer_qty=log.transfer_qty,
        reference_no=log.reference_no,
        produced_by=log.produced_by,
        requester_name=requester_name,
        approver_name=approver_name,
        notes=log.notes,
        operation_batch_id=log.operation_batch_id,
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

    # 복수 transaction_types: 화면 표시 구분 기준 operation-aware 필터
    # (sub_type 우선 라벨 → 재작업 묶음 내 BACKFLUSH 도 DISASSEMBLE 로 잡힘)
    if transaction_types:
        _op_f = _operation_filter(transaction_types)
        if _op_f is not None:
            query = query.filter(_op_f)

    if reference_no:
        query = query.filter(TransactionLog.reference_no == reference_no)
    _dept_f = _department_filter(department)
    if _dept_f is not None:
        query = query.filter(_dept_f)
    _ps = _process_step_filter(process_step)
    if _ps is not None:
        query = query.filter(_ps)
    _md = _model_filter(db, model)
    if _md is not None:
        query = query.filter(_md)
    if date_from:
        query = query.filter(TransactionLog.created_at >= datetime.combine(date_from, time.min))
    if date_to:
        query = query.filter(TransactionLog.created_at <= datetime.combine(date_to, time.max))
    if not include_archived:
        query = query.filter(TransactionLog.archived_at.is_(None))
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                Item.item_name.ilike(pattern),
                Item.item_code.ilike(pattern),
                TransactionLog.reference_no.ilike(pattern),
                TransactionLog.notes.ilike(pattern),
                TransactionLog.produced_by.ilike(pattern),
                # 화면에 우선 표시되는 요청자(IoBatch.requester_name) 도 검색 대상.
                IoBatch.requester_name.ilike(pattern),
            )
        )

    # TODO(history-overhaul-fixup): export.csv/xlsx 도 동일하게
    # IoBatch outerjoin + requester_name search 적용 검토.
    rows = query.order_by(TransactionLog.created_at.desc()).offset(skip).limit(limit).all()

    # operation_batch_id 기준으로 IoBatch 일괄 조회 → requester_name + approver_name 매핑.
    batch_ids = {log.operation_batch_id for log, _, _ in rows if log.operation_batch_id}
    batch_map: dict[uuid.UUID, tuple[Optional[str], Optional[str]]] = {}
    if batch_ids:
        batches = (
            db.query(IoBatch.batch_id, IoBatch.requester_name, IoBatch.stock_request_id)
            .filter(IoBatch.batch_id.in_(batch_ids))
            .all()
        )
        sr_ids = [b.stock_request_id for b in batches if b.stock_request_id]
        sr_approver: dict[uuid.UUID, Optional[str]] = {}
        if sr_ids:
            for sr_id, app_name, app_emp_id, req_emp_id in (
                db.query(
                    StockRequest.request_id,
                    StockRequest.approved_by_name,
                    StockRequest.approved_by_employee_id,
                    StockRequest.requester_employee_id,
                )
                .filter(StockRequest.request_id.in_(sr_ids))
                .all()
            ):
                # 요청자와 결재자가 다른 경우만 별도 승인자로 인정.
                # 같으면 자동결재(즉시 처리) → 승인자 null.
                if app_emp_id and app_emp_id != req_emp_id:
                    sr_approver[sr_id] = app_name
                else:
                    sr_approver[sr_id] = None
        for b in batches:
            approver = sr_approver.get(b.stock_request_id) if b.stock_request_id else None
            batch_map[b.batch_id] = (b.requester_name, approver)

    return [
        _to_log_response(
            log,
            item,
            int(edit_count or 0),
            requester_name=batch_map.get(log.operation_batch_id, (None, None))[0],
            approver_name=batch_map.get(log.operation_batch_id, (None, None))[1],
        )
        for log, item, edit_count in rows
    ]


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

    # 복수 transaction_types: operation-aware 필터
    if transaction_types:
        _op_f = _operation_filter(transaction_types)
        if _op_f is not None:
            query = query.filter(_op_f)

    if date_from:
        query = query.filter(TransactionLog.created_at >= datetime.combine(date_from, time.min))
    if date_to:
        query = query.filter(TransactionLog.created_at <= datetime.combine(date_to, time.max))
    if not include_archived:
        query = query.filter(TransactionLog.archived_at.is_(None))
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                Item.item_name.ilike(pattern),
                Item.item_code.ilike(pattern),
                TransactionLog.reference_no.ilike(pattern),
                TransactionLog.notes.ilike(pattern),
                TransactionLog.produced_by.ilike(pattern),
                IoBatch.requester_name.ilike(pattern),
            )
        )
    _dept_f = _department_filter(department)
    if _dept_f is not None:
        query = query.filter(_dept_f)
    _ps = _process_step_filter(process_step)
    if _ps is not None:
        query = query.filter(_ps)
    _md = _model_filter(db, model)
    if _md is not None:
        query = query.filter(_md)

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
                Item.item_code.ilike(pattern),
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
            "item_code",
            "item_name",
            "process_type_code",
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
                item.item_code or "",
                item.item_name,
                item.process_type_code or "",
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
                Item.item_code.ilike(pattern),
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
        "일시", "유형", "품목 코드", "품목명", "공정코드",
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
            item.item_code or "",
            item.item_name,
            item.process_type_code or "",
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

    editor = _verify_editor(db, payload.edited_by_employee_id, payload.edited_by_pin, request)

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
