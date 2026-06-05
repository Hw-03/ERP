---
type: file-explanation
source_path: "backend/app/services/_tx.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# _tx.py — _tx.py 설명

## 이 파일은 무엇을 책임지나

`_tx.py`는 `_tx` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `commit_and_refresh`
- `commit_only`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/backend/app/schemas.py]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/database.py]] — `database.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/database.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 조심할 점

서비스는 DB 변경을 포함할 수 있습니다. 같은 도메인의 라우터, 모델, 테스트를 함께 확인해야 합니다.

## 핵심 발췌

```python
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
```
