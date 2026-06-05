---
type: file-explanation
source_path: "backend/app/services/audit.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# audit.py — audit.py 설명

## 이 파일은 무엇을 책임지나

`audit.py`는 `audit` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `record`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/backend/app/schemas/📁_schemas]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/database.py]] — `database.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/database.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 조심할 점

서비스는 DB 변경을 포함할 수 있습니다. 같은 도메인의 라우터, 모델, 테스트를 함께 확인해야 합니다.

## 핵심 발췌

```python
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
```
