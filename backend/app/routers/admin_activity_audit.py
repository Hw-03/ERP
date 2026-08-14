"""관리자용 사용자 작업 감사 API."""

from __future__ import annotations

import re
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.admin import require_admin_pin
from app.models import AuditTerminal
from app.routers._errors import ErrorCode, http_error
from app.schemas.activity_audit import (
    ActivityAuditFileResponse,
    AuditTerminalResponse,
    AuditTerminalUpsert,
)
from app.services import activity_audit_export
from app.services.export_helpers import csv_streaming_response
from app.services.realtime import suppress_realtime_revision
from app.utils.excel import apply_header, auto_width, make_xlsx_response


router = APIRouter()
MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def _validated_month(month: str) -> str:
    if not MONTH_RE.fullmatch(month):
        raise http_error(400, ErrorCode.BAD_REQUEST, "month는 YYYY-MM 형식이어야 합니다.")
    return month


@router.put(
    "/activity-audit/terminals/current",
    response_model=AuditTerminalResponse,
)
def upsert_current_terminal(
    payload: AuditTerminalUpsert,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    _admin: Annotated[None, Depends(require_admin_pin)],
) -> AuditTerminalResponse:
    """현재 클라이언트 UUID에 관리용 표시 이름을 등록한다."""
    terminal_id = str(payload.terminal_id)
    terminal = db.get(AuditTerminal, terminal_id)
    if terminal is None:
        terminal = AuditTerminal(terminal_id=terminal_id, name=payload.name)
        db.add(terminal)
    else:
        terminal.name = payload.name
    with suppress_realtime_revision(db):
        db.commit()
    request.state.audit_terminal_id = terminal_id
    request.state.activity_audit_related_id = terminal_id
    request.state.activity_audit_target_summary = f"단말명: {terminal.name}"
    return AuditTerminalResponse(terminal_id=terminal_id, name=terminal.name)


@router.get(
    "/activity-audit/files",
    response_model=list[ActivityAuditFileResponse],
    dependencies=[Depends(require_admin_pin)],
)
def list_activity_audit_files(
    db: Annotated[Session, Depends(get_db)],
) -> list[ActivityAuditFileResponse]:
    return [
        ActivityAuditFileResponse(**item)
        for item in activity_audit_export.available_months(db)
    ]


def _monthly_logs_or_404(db: Session, month: str):
    _validated_month(month)
    logs = activity_audit_export.monthly_logs(db, month)
    if not logs:
        raise http_error(404, ErrorCode.NOT_FOUND, "해당 월의 작업 감사 이력이 없습니다.")
    return logs


@router.get(
    "/activity-audit/{month}.csv",
    dependencies=[Depends(require_admin_pin)],
)
def download_activity_audit_csv(
    month: str,
    db: Annotated[Session, Depends(get_db)],
) -> StreamingResponse:
    logs = _monthly_logs_or_404(db, month)
    return csv_streaming_response(
        activity_audit_export.csv_buffer(logs),
        f"activity_audit_{month}.csv",
    )


@router.get(
    "/activity-audit/{month}.xlsx",
    dependencies=[Depends(require_admin_pin)],
)
def download_activity_audit_xlsx(
    month: str,
    db: Annotated[Session, Depends(get_db)],
) -> StreamingResponse:
    logs = _monthly_logs_or_404(db, month)
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = f"작업감사 {month}"
    apply_header(worksheet, activity_audit_export.EXPORT_HEADERS)
    for log in logs:
        worksheet.append(activity_audit_export.export_row(log))
    auto_width(worksheet)
    return make_xlsx_response(workbook, f"activity_audit_{month}.xlsx")
