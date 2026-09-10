"""개인 일일 작업 일보와 거래 활동 조회 API."""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import Depends
from sqlalchemy import case, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.verified_actor import (
    VerifiedActor,
    VerifiedActorRouter,
    ensure_actor_employee_id,
)
from app.models import DailyWorkReport, Employee, IoBatch, Item, TransactionLog, TransactionTypeEnum
from app.routers._errors import ErrorCode, http_error
from app.routers.inventory._tx_filters import (
    _history_visibility_filter,
    _to_log_response,
    is_legacy_defect_rework_reference,
)
from app.schemas import (
    DailyWorkActivityResponse,
    DailyWorkActivitySummary,
    DailyWorkReportResponse,
    DailyWorkReportUpsertRequest,
)
from app.services._tx import commit_and_refresh
from app.services.transaction_display_groups import build_display_groups


router = VerifiedActorRouter()

KST = ZoneInfo("Asia/Seoul")

PRODUCTION_DEPARTMENT_ORDER = {
    "튜브": 0,
    "고압": 1,
    "진공": 2,
    "튜닝": 3,
    "조립": 4,
    "출하": 5,
}

_OPERATION_BY_SUBTYPE = {
    "produce": ("process", "공정"),
    "disassemble": ("process", "공정"),
    "warehouse_to_dept": ("warehouse", "창고"),
    "dept_to_warehouse": ("warehouse", "창고"),
    "dept_transfer": ("process", "공정"),
    "adjust_in": ("process", "공정"),
    "adjust_out": ("process", "공정"),
    "warehouse_adjust_in": ("warehouse", "창고"),
    "warehouse_adjust_out": ("warehouse", "창고"),
    "receive_supplier": ("warehouse", "창고"),
    "supplier_return": ("defect", "불량"),
    "defect_quarantine": ("defect", "불량"),
    "defect_restore": ("defect", "불량"),
    "defect_process": ("defect", "불량"),
    "internal_use_out": ("warehouse", "창고"),
}
_OPERATION_BY_TX = {
    TransactionTypeEnum.RECEIVE: ("warehouse", "창고"),
    TransactionTypeEnum.SHIP: ("shipping", "출하"),
    TransactionTypeEnum.ADJUST: ("process", "공정"),
    TransactionTypeEnum.BACKFLUSH: ("process", "공정"),
    TransactionTypeEnum.DISASSEMBLE: ("process", "공정"),
    TransactionTypeEnum.TRANSFER_TO_PROD: ("warehouse", "창고"),
    TransactionTypeEnum.TRANSFER_TO_WH: ("warehouse", "창고"),
    TransactionTypeEnum.TRANSFER_DEPT: ("process", "공정"),
    TransactionTypeEnum.MARK_DEFECTIVE: ("defect", "불량"),
    TransactionTypeEnum.UNMARK_DEFECTIVE: ("defect", "불량"),
    TransactionTypeEnum.DEFECT_SCRAP: ("defect", "불량"),
    TransactionTypeEnum.SUPPLIER_RETURN: ("defect", "불량"),
    TransactionTypeEnum.INTERNAL_USE: ("warehouse", "창고"),
    TransactionTypeEnum.PRODUCE: ("process", "공정"),
}
_OPERATION_ORDER = {"warehouse": 0, "process": 1, "defect": 2, "item_conversion": 3, "shipping": 4}


def _kst_day_bounds(work_date: date) -> tuple[datetime, datetime]:
    """KST 일자 경계를 DB의 naive UTC 저장값 범위로 바꾼다."""
    start = datetime.combine(work_date, time.min, tzinfo=KST).astimezone(UTC).replace(tzinfo=None)
    end = start + timedelta(days=1)
    return start, end


def _operation_for(log: TransactionLog, batch: IoBatch | None) -> tuple[str, str]:
    if batch is None and is_legacy_defect_rework_reference(log.reference_no):
        return "defect", "불량"
    if log.shipping_phase == "COMPONENT_CHANGE":
        return "item_conversion", "구성품 전환"
    if log.shipping_phase in {"PREPARE", "PICKUP"}:
        return "shipping", "출하"
    if batch and batch.sub_type in _OPERATION_BY_SUBTYPE:
        return _OPERATION_BY_SUBTYPE[batch.sub_type]
    return _OPERATION_BY_TX.get(log.transaction_type, ("process", "공정"))


def _activity_summary(rows: list[tuple[TransactionLog, Item, IoBatch | None]]):
    """취소 거래를 제외한 화면 표시 묶음 단위의 작업 건수와 수량을 계산한다."""
    responses = [
        _to_log_response(log, item, requester_name=batch.requester_name if batch else None)
        for log, item, batch in rows
    ]
    details = build_display_groups(responses)
    row_by_log_id = {log.log_id: (log, batch) for log, _, batch in rows}
    aggregate: dict[str, dict[str, object]] = {}
    for group in details:
        valid_logs = [log for log in group.logs if not row_by_log_id[log.log_id][0].cancelled]
        if not valid_logs:
            continue
        source_log, source_batch = row_by_log_id[valid_logs[0].log_id]
        operation_key, operation_label = _operation_for(source_log, source_batch)
        entry = aggregate.setdefault(
            operation_key,
            {"operation_label": operation_label, "work_count": 0, "quantity_by_unit": defaultdict(int)},
        )
        entry["work_count"] = int(entry["work_count"]) + 1
        quantities = entry["quantity_by_unit"]
        for log in valid_logs:
            source, _ = row_by_log_id[log.log_id]
            quantity = source.transfer_qty if source.transfer_qty is not None else source.quantity_change
            quantities[log.item_unit] += abs(int(quantity))

    summary = [
        DailyWorkActivitySummary(
            operation_key=key,
            operation_label=str(entry["operation_label"]),
            work_count=int(entry["work_count"]),
            quantity_by_unit=dict(entry["quantity_by_unit"]),
        )
        for key, entry in sorted(aggregate.items(), key=lambda value: _OPERATION_ORDER[value[0]])
    ]
    return summary, details


@router.get("", response_model=list[DailyWorkReportResponse])
def list_daily_work_reports(work_date: date, db: Session = Depends(get_db)):
    """선택한 날짜에 작성된 전 직원의 일지를 반환한다."""
    return (
        db.query(DailyWorkReport)
        .outerjoin(Employee, DailyWorkReport.employee_id == Employee.employee_id)
        .filter(DailyWorkReport.work_date == work_date)
        .order_by(
            case(
                PRODUCTION_DEPARTMENT_ORDER,
                value=DailyWorkReport.department,
                else_=len(PRODUCTION_DEPARTMENT_ORDER),
            ),
            Employee.display_order.asc(),
            DailyWorkReport.employee_name.asc(),
            DailyWorkReport.report_id,
        )
        .all()
    )


@router.get("/{employee_id}/{work_date}", response_model=DailyWorkReportResponse | None)
def get_daily_work_report(employee_id: uuid.UUID, work_date: date, db: Session = Depends(get_db)):
    """미작성 일자는 null로 반환해 클라이언트가 작성 상태를 구분하게 한다."""
    return (
        db.query(DailyWorkReport)
        .filter(DailyWorkReport.employee_id == employee_id, DailyWorkReport.work_date == work_date)
        .first()
    )


@router.put("/{employee_id}/{work_date}", response_model=DailyWorkReportResponse)
def upsert_daily_work_report(
    employee_id: uuid.UUID,
    work_date: date,
    payload: DailyWorkReportUpsertRequest,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
):
    """본인만 오늘 또는 과거 일지를 작성·수정한다."""
    ensure_actor_employee_id(actor, employee_id)
    ensure_actor_employee_id(actor, payload.actor_employee_id)
    if work_date > datetime.now(KST).date():
        raise http_error(422, ErrorCode.BUSINESS_RULE, "미래 날짜의 일보는 작성할 수 없습니다.")
    content = payload.content.strip()
    if not content:
        raise http_error(422, ErrorCode.UNPROCESSABLE, "일보 내용을 입력해 주세요.")
    if len(content) > 5000:
        raise http_error(422, ErrorCode.UNPROCESSABLE, "일보 내용은 5,000자 이하여야 합니다.")

    employee = actor

    report = (
        db.query(DailyWorkReport)
        .filter(DailyWorkReport.employee_id == employee_id, DailyWorkReport.work_date == work_date)
        .first()
    )
    if report:
        report.content = content
    else:
        report = DailyWorkReport(
            work_date=work_date,
            employee_id=employee.employee_id,
            employee_name=employee.name,
            department=employee.department,
            content=content,
        )
        db.add(report)
    try:
        commit_and_refresh(db, report)
    except IntegrityError:
        db.rollback()
        report = (
            db.query(DailyWorkReport)
            .filter(DailyWorkReport.employee_id == employee_id, DailyWorkReport.work_date == work_date)
            .first()
        )
        if report is None:
            raise
        report.content = content
        commit_and_refresh(db, report)
    return report


@router.get("/{employee_id}/{work_date}/activity", response_model=DailyWorkActivityResponse)
def get_daily_work_activity(employee_id: uuid.UUID, work_date: date, db: Session = Depends(get_db)):
    """직원 ID로 귀속되는 KST 하루의 재고 활동을 표시 단위로 반환한다."""
    start, end = _kst_day_bounds(work_date)
    rows = (
        db.query(TransactionLog, Item, IoBatch)
        .join(Item, TransactionLog.item_id == Item.item_id)
        .outerjoin(IoBatch, TransactionLog.operation_batch_id == IoBatch.batch_id)
        .filter(
            TransactionLog.created_at >= start,
            TransactionLog.created_at < end,
            TransactionLog.archived_at.is_(None),
            _history_visibility_filter(),
            or_(
                TransactionLog.producer_employee_id == employee_id,
                IoBatch.requester_employee_id == employee_id,
            ),
        )
        .order_by(TransactionLog.created_at.desc(), TransactionLog.log_id.desc())
        .all()
    )
    summary, details = _activity_summary(rows)
    return DailyWorkActivityResponse(
        work_date=work_date,
        employee_id=employee_id,
        summary=summary,
        cancelled_count=sum(1 for log, _, _ in rows if log.cancelled),
        details=details,
    )
