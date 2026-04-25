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
