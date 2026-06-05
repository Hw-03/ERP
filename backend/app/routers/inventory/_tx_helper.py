"""직접 입출고 엔드포인트 공통 헬퍼."""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app.models.employee import Employee
from app.routers._errors import ErrorCode, http_error


def resolve_producer(
    db: Session,
    employee_code: Optional[str],
) -> tuple[Optional[str], Optional[uuid.UUID]]:
    """사번으로 직원을 조회해 (이름, employee_id) 를 반환한다.

    employee_code 가 None 이면 (None, None) 을 반환 — 기존 produced_by 동작 유지.
    code 가 있으면: 미존재 → 422, 비활성 → 422, 성공 → (name, employee_id).
    """
    if not employee_code:
        return None, None
    emp = db.query(Employee).filter(Employee.employee_code == employee_code).first()
    if emp is None:
        raise http_error(422, ErrorCode.VALIDATION_ERROR, f"사번 {employee_code!r}을 찾을 수 없습니다.")
    if not bool(emp.is_active):
        raise http_error(422, ErrorCode.VALIDATION_ERROR, f"비활성 직원({employee_code})입니다.")
    return emp.name, emp.employee_id
