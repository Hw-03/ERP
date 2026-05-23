"""관리자 PIN 인증 Depends adapter.

다중 adapter:
  - HTTP header X-Admin-Pin (선호)
  - body의 pin 필드 (기존 호환)
  - query parameter pin (deprecated)

사용법:
    from app.dependencies.admin import require_admin_pin
    from typing import Annotated
    from fastapi import Depends

    @router.post("/some-admin-endpoint")
    def my_endpoint(
        _admin: Annotated[None, Depends(require_admin_pin)],
        payload: MyPayload,
        db: Session = Depends(get_db),
    ):
        ...
"""

from typing import Annotated, Optional

from fastapi import Depends, Header, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers._errors import ErrorCode, http_error
from app.routers.settings import require_admin


async def extract_admin_pin(
    request: Request,
    x_admin_pin: Annotated[Optional[str], Header(alias="X-Admin-Pin")] = None,
    pin: Annotated[Optional[str], Query()] = None,
) -> str:
    """다중 source에서 PIN 추출. 우선순위: 헤더 → query → body."""
    if x_admin_pin:
        return x_admin_pin
    if pin:
        return pin
    # body의 pin 필드 — Pydantic 모델이 미리 parse 되어 있을 수 있어 request.json() 사용.
    # GET/DELETE처럼 body 없으면 예외 없이 빈 dict 처리.
    try:
        body = await request.json()
        if isinstance(body, dict) and isinstance(body.get("pin"), str) and body["pin"]:
            return body["pin"]
    except Exception:
        pass
    raise http_error(400, ErrorCode.BAD_REQUEST, "관리자 PIN이 필요합니다.")


def require_admin_pin(
    pin_value: Annotated[str, Depends(extract_admin_pin)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """모든 admin 엔드포인트 시그니처에 추가:
        _admin: Annotated[None, Depends(require_admin_pin)]
    """
    require_admin(db, pin_value)
