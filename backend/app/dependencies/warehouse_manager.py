"""창고 정/부 관리자(warehouse_role) 인증 Depends.

창고 지도 편집(박스·앵글 CRUD)은 warehouse_role in (primary, deputy) + 본인 PIN 으로 보호한다.
거래 취소(transactions.cancel)와 동일한 보안 바: 민감한 쓰기엔 PIN 재검증.

자격증명은 헤더로 전달 (프론트 api-core 가 편집 모드 진입 시 주입):
  - X-Employee-Code : 작업자 사번
  - X-Operator-Pin  : 본인 PIN

사용법:
    from typing import Annotated
    from fastapi import Depends
    from app.dependencies.warehouse_manager import require_warehouse_manager
    from app.models import Employee

    @router.post("/some-endpoint")
    def my_endpoint(
        _mgr: Annotated[Employee, Depends(require_warehouse_manager)],
        db: Session = Depends(get_db),
    ):
        ...
"""

from typing import Annotated, Optional

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee
from app.routers._errors import ErrorCode, http_error
from app.services.pin_auth import verify_pin

_MANAGER_ROLES = ("primary", "deputy")


def require_warehouse_manager(
    db: Annotated[Session, Depends(get_db)],
    x_employee_code: Annotated[Optional[str], Header(alias="X-Employee-Code")] = None,
    x_operator_pin: Annotated[Optional[str], Header(alias="X-Operator-Pin")] = None,
) -> Employee:
    """창고 정/부 관리자 + 본인 PIN 검증. 실패 시 403. 통과 시 Employee 반환."""
    if not x_employee_code or not x_operator_pin:
        raise http_error(403, ErrorCode.FORBIDDEN, "창고 관리자 인증이 필요합니다.")
    emp = (
        db.query(Employee)
        .filter(Employee.employee_code == x_employee_code)
        .first()
    )
    if emp is None or not bool(emp.is_active):
        raise http_error(403, ErrorCode.FORBIDDEN, "유효한 직원이 아닙니다.")
    if not verify_pin(emp.pin_hash, x_operator_pin):
        raise http_error(403, ErrorCode.FORBIDDEN, "PIN이 올바르지 않습니다.")
    if (getattr(emp, "warehouse_role", None) or "none").lower() not in _MANAGER_ROLES:
        raise http_error(403, ErrorCode.FORBIDDEN, "창고 정/부 관리자만 편집할 수 있습니다.")
    return emp
