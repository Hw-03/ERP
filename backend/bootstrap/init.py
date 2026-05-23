"""bootstrap.init — SQLAlchemy 메타데이터 기반 테이블 생성.

`Base.metadata.create_all` 은 이미 존재하는 테이블을 무시(no-op)하므로
재실행 안전. 부트스트랩의 첫 단계.
"""
from __future__ import annotations

from app.database import Base, engine


def run_schema_create_all() -> None:
    """SQLAlchemy 메타데이터 기준으로 테이블 생성 (이미 있으면 no-op)."""
    Base.metadata.create_all(bind=engine)
