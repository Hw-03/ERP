"""DB 작업 감사 이력의 KST 월별 내보내기."""

from __future__ import annotations

import csv
from collections import Counter
from datetime import datetime, timedelta
from io import StringIO

from sqlalchemy.orm import Session

from app.models import ActivityAuditLog


KST_OFFSET = timedelta(hours=9)
EXPORT_HEADERS = [
    "일시(KST)",
    "직원명",
    "사번",
    "단말명",
    "접속유형",
    "화면",
    "작업",
    "결과",
    "대상/변경 요약",
    "세션 ID",
    "요청 ID",
    "관련 ID",
]
SOURCE_LABELS = {"desktop": "데스크톱", "mobile": "모바일"}
OUTCOME_LABELS = {"success": "성공", "failed": "실패", "cancelled": "취소"}
FORMULA_PREFIXES = ("=", "+", "-", "@")


def _export_cell(value: object) -> str:
    """스프레드시트가 수식으로 해석할 수 있는 사용자 입력을 텍스트로 고정한다."""
    text = str(value or "")
    return f"'{text}" if text.lstrip().startswith(FORMULA_PREFIXES) else text


def utc_bounds(month: str) -> tuple[datetime, datetime]:
    """YYYY-MM KST 월을 저장소의 naive UTC 반개구간으로 바꾼다."""
    local_start = datetime.strptime(month, "%Y-%m")
    if local_start.month == 12:
        local_end = datetime(local_start.year + 1, 1, 1)
    else:
        local_end = datetime(local_start.year, local_start.month + 1, 1)
    return local_start - KST_OFFSET, local_end - KST_OFFSET


def monthly_logs(db: Session, month: str) -> list[ActivityAuditLog]:
    start, end = utc_bounds(month)
    return (
        db.query(ActivityAuditLog)
        .filter(ActivityAuditLog.occurred_at >= start)
        .filter(ActivityAuditLog.occurred_at < end)
        .order_by(ActivityAuditLog.occurred_at.asc(), ActivityAuditLog.audit_id.asc())
        .all()
    )


def export_row(log: ActivityAuditLog) -> list[str]:
    """한 이력을 고정된 사용자 표시 열 순서로 변환한다."""
    occurred_kst = log.occurred_at + KST_OFFSET
    return [
        _export_cell(occurred_kst.strftime("%Y-%m-%d %H:%M:%S")),
        _export_cell(log.actor_employee_name),
        _export_cell(log.actor_employee_code),
        _export_cell(log.terminal_name or "미등록 단말"),
        _export_cell(SOURCE_LABELS.get(log.source, log.source)),
        _export_cell(log.screen_label or log.screen_key),
        _export_cell(log.action_label or log.action_key),
        _export_cell(OUTCOME_LABELS.get(log.outcome, log.outcome)),
        _export_cell(log.target_summary),
        _export_cell(log.session_id),
        _export_cell(log.request_id),
        _export_cell(log.related_id),
    ]


def csv_buffer(logs: list[ActivityAuditLog]) -> StringIO:
    buffer = StringIO(newline="")
    buffer.write("\ufeff")
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(EXPORT_HEADERS)
    writer.writerows(export_row(log) for log in logs)
    buffer.seek(0)
    return buffer


def available_months(db: Session) -> list[dict[str, int | str]]:
    occurred_values = db.query(ActivityAuditLog.occurred_at).all()
    counts = Counter(
        (occurred_at + KST_OFFSET).strftime("%Y-%m")
        for (occurred_at,) in occurred_values
    )
    result: list[dict[str, int | str]] = []
    for month in sorted(counts, reverse=True):
        logs = monthly_logs(db, month)
        content = csv_buffer(logs).getvalue()
        result.append(
            {
                "month": month,
                "file_name": f"activity_audit_{month}.csv",
                "row_count": counts[month],
                "size_bytes": len(content.encode("utf-8")),
            }
        )
    return result
