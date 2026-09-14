"""상위 업무 서비스와 아직 이전되지 않은 라우터의 트랜잭션 헬퍼.

`transactional`은 application service의 최외곽 경계를 마감한다.
기존 commit helper는 아직 라우터가 경계를 소유하는 미이전 경로에서 사용한다.
- DB schema/API spec 변경 없음
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy.orm import Session


_TRANSACTION_DEPTH_KEY = "_mes_transactional_depth"
_TRANSACTION_FAILURE_KEY = "_mes_transactional_failure"


@contextmanager
def transactional(db: Session) -> Iterator[None]:
    """상위 업무 명령을 원자적으로 마감한다.

    중첩 호출은 가장 바깥 경계만 commit/rollback하며, 내부 예외는 원형 그대로
    바깥 경계까지 전파된다. 재고 leaf 서비스는 이 경계를 사용하지 않는다.
    """
    depth = int(db.info.get(_TRANSACTION_DEPTH_KEY, 0))
    outermost = depth == 0
    if outermost:
        db.info.pop(_TRANSACTION_FAILURE_KEY, None)
    db.info[_TRANSACTION_DEPTH_KEY] = depth + 1
    try:
        yield
    except Exception as exc:
        db.info.setdefault(_TRANSACTION_FAILURE_KEY, exc)
        if outermost:
            db.rollback()
        raise
    else:
        if outermost:
            failure = db.info.get(_TRANSACTION_FAILURE_KEY)
            if failure is not None:
                db.rollback()
                raise failure
            try:
                db.commit()
            except Exception:
                db.rollback()
                raise
    finally:
        if outermost:
            db.info.pop(_TRANSACTION_DEPTH_KEY, None)
            db.info.pop(_TRANSACTION_FAILURE_KEY, None)
        else:
            db.info[_TRANSACTION_DEPTH_KEY] = depth


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
