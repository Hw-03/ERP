---
type: code-note
project: ERP
layer: backend
source_path: backend/app/services/audit.py
status: active
updated: 2026-04-27
source_sha: e5f3a997ed66
tags:
  - erp
  - backend
  - service
  - py
---

# audit.py

> [!summary] 역할
> 라우터에서 직접 처리하기 무거운 `audit` 비즈니스 로직과 계산 책임을 분리해 담는다.

## 원본 위치

- Source: `backend/app/services/audit.py`
- Layer: `backend`
- Kind: `service`
- Size: `1582` bytes

## 연결

- Parent hub: [[backend/app/services/services|backend/app/services]]
- Related: [[backend/backend]]

## 읽는 포인트

- 서비스는 라우터보다 안쪽의 업무 규칙을 담는다.
- 재고 수량이나 BOM 계산은 화면 표시와 실제 거래가 일치해야 한다.

## 원본 발췌

````python
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
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
