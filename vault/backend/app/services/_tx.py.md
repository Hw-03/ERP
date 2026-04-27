---
type: code-note
project: ERP
layer: backend
source_path: backend/app/services/_tx.py
status: active
updated: 2026-04-27
source_sha: 848c2472e6a9
tags:
  - erp
  - backend
  - service
  - py
---

# _tx.py

> [!summary] 역할
> 라우터에서 직접 처리하기 무거운 `_tx` 비즈니스 로직과 계산 책임을 분리해 담는다.

## 원본 위치

- Source: `backend/app/services/_tx.py`
- Layer: `backend`
- Kind: `service`
- Size: `752` bytes

## 연결

- Parent hub: [[backend/app/services/services|backend/app/services]]
- Related: [[backend/backend]]

## 읽는 포인트

- 서비스는 라우터보다 안쪽의 업무 규칙을 담는다.
- 재고 수량이나 BOM 계산은 화면 표시와 실제 거래가 일치해야 한다.

## 원본 발췌

````python
"""Transaction helpers for routers.

라우터 레이어의 반복 패턴(`db.commit()` + `db.refresh(...)`)을 단일 호출로 통합한다.
- DB schema/API spec 변경 없음
- transaction 의미 동일 (commit 위치는 호출자 그대로)
"""

from __future__ import annotations

from sqlalchemy.orm import Session


def commit_and_refresh(db: Session, *objs) -> None:
    """`db.commit()` 후 전달된 모든 객체를 refresh한다.

    Args:
        db: SQLAlchemy 세션.
        *objs: refresh할 ORM 인스턴스 목록.
    """
    db.commit()
    for obj in objs:
        db.refresh(obj)


def commit_only(db: Session) -> None:
    """`db.commit()`만 수행 (refresh 불필요한 경우)."""
    db.commit()
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
