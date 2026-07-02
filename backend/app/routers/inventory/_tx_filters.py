"""거래 이력 쿼리 필터/응답 빌더 헬퍼.

transactions.py 의 list_transactions / summary / export 가 공유하는
쿼리 필터·응답 빌더 함수와 그 함수들이 참조하는 상수 모음.
엔드포인트 로직은 transactions.py 에 남아 있다.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time
from typing import NamedTuple, Optional

from sqlalchemy import ColumnElement, and_, case, func, or_
from sqlalchemy.orm import Query, Session

from app.models import (
    IoBatch,
    Item,
    ProductSymbol,
    StockRequest,
    TransactionLog,
    TransactionTypeEnum,
)
from app.schemas import TransactionLogResponse


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


def _department_label_expr() -> ColumnElement:
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


def _process_step_filter(process_step: Optional[str]) -> Optional[ColumnElement]:
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


def _model_filter(db: Session, model: Optional[str]) -> Optional[ColumnElement]:
    """model_name IN 필터 — Item.mes_code prefix 기반.

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
    # prefix = mes_code 의 첫 '-' 앞 부분만 잘라낸 뒤 그 안에 symbol 글자 포함 여부 검사.
    # SQLite/PostgreSQL 공통 함수: instr(필드, '-') / substr(필드, 1, n).
    # PostgreSQL 은 strpos(필드, '-') 와 substr 가 동일 시그니처 → func.instr 호출이 동작 안 함
    #   (PG 는 instr 없음). DB 가 SQLite 라는 게 운영 전제 — _attic/docs/openapi.json baseline.
    dash_pos = func.instr(Item.mes_code, "-")
    prefix_expr = func.substr(Item.mes_code, 1, dash_pos - 1)
    clauses = []
    for sym in symbols:
        # 단일 문자 symbol 운영 전제. '%' '_' 들어가도 escape 처리 후 LIKE.
        s = sym.replace("%", "\\%").replace("_", "\\_")
        clauses.append(prefix_expr.like(f"%{s}%", escape="\\"))
    # dash_pos == 0 (코드에 '-' 없음) 또는 mes_code NULL 은 자연히 매칭 실패.
    return and_(Item.mes_code.isnot(None), dash_pos > 0, or_(*clauses))


def _department_filter(department: Optional[str]) -> Optional[ColumnElement]:
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


def _operation_filter(transaction_types: Optional[str]) -> Optional[ColumnElement]:
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


def _apply_common_filters(
    query: Query,
    db: Session,
    *,
    transaction_types: Optional[str],
    search: Optional[str],
    department: Optional[str],
    model: Optional[str],
    process_step: Optional[str],
    date_from: Optional[date],
    date_to: Optional[date],
    include_archived: bool,
) -> Query:
    """list_transactions / get_transactions_summary 공통 필터.

    TransactionLog + Item join + IoBatch outerjoin 이 이미 적용된 query 를 받아
    화면 공통 조건(operation 구분·기간·아카이브·검색·부서·공정·모델)을 AND 로 덧붙인다.
    item_id/transaction_type/reference_no 같은 list 전용 필터는 호출부가 직접 처리.
    """
    if transaction_types:
        _op_f = _operation_filter(transaction_types)
        if _op_f is not None:
            query = query.filter(_op_f)
    _dept_f = _department_filter(department)
    if _dept_f is not None:
        query = query.filter(_dept_f)
    _ps = _process_step_filter(process_step)
    if _ps is not None:
        query = query.filter(_ps)
    _md = _model_filter(db, model)
    if _md is not None:
        query = query.filter(_md)
    request_date_expr = func.coalesce(IoBatch.submitted_at, IoBatch.created_at, TransactionLog.created_at)
    if date_from:
        query = query.filter(request_date_expr >= datetime.combine(date_from, time.min))
    if date_to:
        query = query.filter(request_date_expr <= datetime.combine(date_to, time.max))
    if not include_archived:
        query = query.filter(TransactionLog.archived_at.is_(None))
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                Item.item_name.ilike(pattern),
                Item.mes_code.ilike(pattern),
                TransactionLog.reference_no.ilike(pattern),
                TransactionLog.notes.ilike(pattern),
                TransactionLog.produced_by.ilike(pattern),
                # 화면에 우선 표시되는 요청자(IoBatch.requester_name) 도 검색 대상.
                IoBatch.requester_name.ilike(pattern),
            )
        )
    return query


class _BatchInfo(NamedTuple):
    """배치별 요청자/승인자 이름과 요청/승인 시각 묶음."""
    requester_name: Optional[str]
    approver_name: Optional[str]
    requested_at: Optional[datetime]
    approved_at: Optional[datetime]


def _batch_name_map(
    db: Session, batch_ids: set
) -> dict[uuid.UUID, _BatchInfo]:
    """operation_batch_id 집합 → _BatchInfo(이름+시각) 매핑.

    list_transactions 와 export(csv/xlsx) 가 공유 — 요청자/승인자명·시각을 동일 규칙으로 채운다.
    요청자=결재자(자동결재/즉시처리)면 승인자 null, approved_at null(별도 승인 없음).
    approved_at null 시 호출부에서 log.created_at fallback 적용.
    """
    batch_map: dict[uuid.UUID, _BatchInfo] = {}
    if not batch_ids:
        return batch_map
    batches = (
        db.query(
            IoBatch.batch_id,
            IoBatch.requester_name,
            IoBatch.stock_request_id,
            IoBatch.submitted_at,
            IoBatch.created_at,
        )
        .filter(IoBatch.batch_id.in_(batch_ids))
        .all()
    )
    sr_ids = [b.stock_request_id for b in batches if b.stock_request_id]
    sr_approver: dict[uuid.UUID, Optional[str]] = {}
    sr_approved_at: dict[uuid.UUID, Optional[datetime]] = {}
    if sr_ids:
        for sr_id, app_name, app_emp_id, req_emp_id, app_at, dept_name, dept_emp_id, dept_at in (
            db.query(
                StockRequest.request_id,
                StockRequest.approved_by_name,
                StockRequest.approved_by_employee_id,
                StockRequest.requester_employee_id,
                StockRequest.approved_at,
                StockRequest.department_approved_by_name,
                StockRequest.department_approved_by_employee_id,
                StockRequest.department_approved_at,
            )
            .filter(StockRequest.request_id.in_(sr_ids))
            .all()
        ):
            # 요청자와 결재자가 다른 경우만 별도 승인자로 인정.
            if app_emp_id and app_emp_id != req_emp_id:
                sr_approver[sr_id] = app_name
                sr_approved_at[sr_id] = app_at
            elif dept_emp_id and dept_emp_id != req_emp_id:
                sr_approver[sr_id] = dept_name
                sr_approved_at[sr_id] = dept_at
            else:
                sr_approver[sr_id] = None
                sr_approved_at[sr_id] = None  # 즉시 처리 시 approved_at fallback은 호출부에서 log.created_at
    for b in batches:
        approver = sr_approver.get(b.stock_request_id) if b.stock_request_id else None
        approved_at = sr_approved_at.get(b.stock_request_id) if b.stock_request_id else None
        requested_at = b.submitted_at or b.created_at
        batch_map[b.batch_id] = _BatchInfo(b.requester_name, approver, requested_at, approved_at)
    return batch_map


def _stock_request_info_map(
    db: Session, reference_nos: set[str]
) -> dict[str, _BatchInfo]:
    if not reference_nos:
        return {}
    rows = (
        db.query(
            StockRequest.request_code,
            StockRequest.requester_name,
            StockRequest.requester_employee_id,
            StockRequest.approved_by_name,
            StockRequest.approved_by_employee_id,
            StockRequest.approved_at,
            StockRequest.department_approved_by_name,
            StockRequest.department_approved_by_employee_id,
            StockRequest.department_approved_at,
            StockRequest.submitted_at,
            StockRequest.created_at,
        )
        .filter(StockRequest.request_code.in_(reference_nos))
        .all()
    )
    out: dict[str, _BatchInfo] = {}
    for row in rows:
        approver_name = None
        approved_at = None
        if row.approved_by_employee_id and row.approved_by_employee_id != row.requester_employee_id:
            approver_name = row.approved_by_name
            approved_at = row.approved_at
        elif (
            row.department_approved_by_employee_id
            and row.department_approved_by_employee_id != row.requester_employee_id
        ):
            approver_name = row.department_approved_by_name
            approved_at = row.department_approved_at
        out[row.request_code] = _BatchInfo(
            row.requester_name,
            approver_name,
            row.submitted_at or row.created_at,
            approved_at,
        )
    return out


def _to_log_response(
    log: TransactionLog,
    item: Item,
    edit_count: int = 0,
    requester_name: Optional[str] = None,
    approver_name: Optional[str] = None,
    requested_at: Optional[datetime] = None,
    approved_at: Optional[datetime] = None,
) -> TransactionLogResponse:
    return TransactionLogResponse(
        log_id=log.log_id,
        item_id=log.item_id,
        mes_code=item.mes_code,
        item_name=item.item_name,
        item_process_type_code=item.process_type_code,
        item_unit=item.unit,
        transaction_type=log.transaction_type,
        quantity_change=log.quantity_change,
        quantity_before=log.quantity_before,
        quantity_after=log.quantity_after,
        warehouse_qty_before=log.warehouse_qty_before,
        warehouse_qty_after=log.warehouse_qty_after,
        transfer_qty=log.transfer_qty,
        department=log.department,
        reference_no=log.reference_no,
        produced_by=log.produced_by,
        producer_employee_id=log.producer_employee_id,
        requester_name=requester_name,
        approver_name=approver_name,
        requested_at=requested_at if requested_at is not None else log.created_at,
        approved_at=approved_at if approved_at is not None else log.created_at,
        notes=log.notes,
        reason_category=log.reason_category,
        reason_memo=log.reason_memo,
        operation_batch_id=log.operation_batch_id,
        created_at=log.created_at,
        edit_count=edit_count,
        cancelled=bool(log.cancelled),
        cancel_reason=log.cancel_reason,
        cancelled_by=log.cancelled_by,
        cancelled_at=log.cancelled_at,
        inventory_effect=log.inventory_effect,
    )
