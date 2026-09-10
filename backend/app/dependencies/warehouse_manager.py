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

from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.verified_actor import VerifiedActor, ensure_actor_employee_code
from app.models import Employee
from app.routers._errors import ErrorCode, http_error
from app.services import rate_limit

_MANAGER_ROLES = ("primary", "deputy")


def require_warehouse_manager(
    actor: VerifiedActor,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    x_employee_code: Annotated[Optional[str], Header(alias="X-Employee-Code")] = None,
    x_operator_pin: Annotated[Optional[str], Header(alias="X-Operator-Pin")] = None,
) -> Employee:
    """검증된 session actor의 창고 역할과 본인 PIN step-up을 확인한다."""
    if not x_operator_pin:
        raise http_error(403, ErrorCode.FORBIDDEN, "창고 관리자 인증이 필요합니다.")
    ensure_actor_employee_code(actor, x_employee_code)
    try:
        pin_is_valid = rate_limit.verify_operator_pin(actor, x_operator_pin, request)
    except rate_limit.OperatorPinRateLimitExceeded as exc:
        raise http_error(
            429,
            ErrorCode.TOO_MANY_REQUESTS,
            str(exc),
        )
    if not pin_is_valid:
        raise http_error(403, ErrorCode.FORBIDDEN, "PIN이 올바르지 않습니다.")
    if (getattr(actor, "warehouse_role", None) or "none").lower() not in _MANAGER_ROLES:
        raise http_error(403, ErrorCode.FORBIDDEN, "창고 정/부 관리자만 편집할 수 있습니다.")
    return actor
