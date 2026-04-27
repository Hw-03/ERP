"""관리자 액션 감사로그 헬퍼.

재고 변동은 `TransactionLog` 가 도메인 audit 으로 작동하므로 여기서 다루지 않는다.
이 헬퍼는 마스터/설정 변경 (item·employee·bom·settings·codes) 만 기록한다.

사용 패턴 (라우터 안):
    from fastapi import Request
    from app.services import audit

    audit.record(
        db,
        request=request,
        action="bom.update",
        target_type="bom",
        target_id=str(bom_id),
        payload_summary=f"qty {old} → {new}",
    )

기록은 `db.add` 만 하고 commit 은 호출자가 책임진다. 라우터의 commit 시점에 함께 묶여야
원자적이다 (실패 시 audit 도 같이 롤백되어 잘못된 기록을 남기지 않음).
"""

from __future__ import annotations

from typing import Optional

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import AdminAuditLog


def record(
    db: Session,
    *,
    action: str,
    target_type: str,
    target_id: Optional[str] = None,
    payload_summary: Optional[str] = None,
    request: Optional[Request] = None,
    actor_pin_role: str = "admin",
) -> AdminAuditLog:
    rid = None
    if request is not None:
        rid = getattr(request.state, "request_id", None)
    log = AdminAuditLog(
        action=action,
        target_type=target_type,
        target_id=target_id,
        payload_summary=payload_summary,
        request_id=rid,
        actor_pin_role=actor_pin_role,
    )
    db.add(log)
    return log
