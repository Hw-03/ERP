"""사용자 작업 감사 스냅샷 생성 서비스."""

from __future__ import annotations

from typing import Optional

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import ActivityAuditLog, AuditTerminal, Employee
from app.services.audit_actor_session import get_verified_audit_actor_code


UNREGISTERED_TERMINAL_NAME = "미등록 단말"


def record(
    db: Session,
    *,
    request: Optional[Request],
    source: str,
    action_key: str,
    action_label: str,
    outcome: str,
    terminal_id: Optional[str] = None,
    session_id: Optional[str] = None,
    screen_key: Optional[str] = None,
    screen_label: Optional[str] = None,
    target_summary: Optional[str] = None,
    related_id: Optional[str] = None,
    actor_employee_code: Optional[str] = None,
    request_id: Optional[str] = None,
) -> ActivityAuditLog:
    """현재 요청의 직원·단말 정보를 변경 불가능한 문자열로 복사한다."""
    employee_code = actor_employee_code or get_verified_audit_actor_code(request)
    employee = (
        db.query(Employee).filter(Employee.employee_code == employee_code).first()
        if employee_code
        else None
    )
    terminal = db.get(AuditTerminal, terminal_id) if terminal_id else None
    resolved_request_id = request_id[:64] if request_id else None
    if resolved_request_id is None and request is not None:
        resolved_request_id = str(getattr(request.state, "request_id", ""))[:64] or None
    log = ActivityAuditLog(
        actor_employee_name=employee.name if employee else None,
        actor_employee_code=(employee.employee_code if employee else employee_code)[:30]
        if (employee or employee_code)
        else None,
        terminal_id=terminal_id,
        terminal_name=terminal.name if terminal else UNREGISTERED_TERMINAL_NAME,
        source=source,
        session_id=session_id,
        screen_key=screen_key,
        screen_label=screen_label,
        action_key=action_key,
        action_label=action_label,
        outcome=outcome,
        target_summary=target_summary,
        request_id=resolved_request_id,
        related_id=related_id,
    )
    db.add(log)
    return log
