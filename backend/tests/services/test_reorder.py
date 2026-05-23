"""services/reorder.py 단위 테스트."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.models import Department
from app.services.reorder import reorder_by_display_order


def _make_dept(db, name: str, display_order: int = 0) -> Department:
    dept = Department(name=name, display_order=display_order, is_active=True)
    db.add(dept)
    db.flush()
    return dept


def test_valid_reorder(db_session):
    """유효한 reorder — 3개 Department 모두 display_order 갱신, 반환값 3."""
    d1 = _make_dept(db_session, "부서A", 0)
    d2 = _make_dept(db_session, "부서B", 1)
    d3 = _make_dept(db_session, "부서C", 2)
    db_session.commit()

    updated = reorder_by_display_order(
        db_session,
        Department,
        "id",
        [(d1.id, 20), (d2.id, 10), (d3.id, 30)],
    )
    db_session.commit()

    assert updated == 3
    db_session.refresh(d1)
    db_session.refresh(d2)
    db_session.refresh(d3)
    assert d1.display_order == 20
    assert d2.display_order == 10
    assert d3.display_order == 30


def test_duplicate_key_rejected(db_session):
    """중복 key → 400 BAD_REQUEST."""
    d1 = _make_dept(db_session, "부서A", 0)
    db_session.commit()

    with pytest.raises(HTTPException) as exc_info:
        reorder_by_display_order(
            db_session,
            Department,
            "id",
            [(d1.id, 10), (d1.id, 20)],
        )
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["code"] == "BAD_REQUEST"


def test_negative_display_order_rejected(db_session):
    """display_order 음수 → 400 BAD_REQUEST."""
    d1 = _make_dept(db_session, "부서A", 0)
    db_session.commit()

    with pytest.raises(HTTPException) as exc_info:
        reorder_by_display_order(
            db_session,
            Department,
            "id",
            [(d1.id, -1)],
        )
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["code"] == "BAD_REQUEST"


def test_nonexistent_key_silent_skip(db_session):
    """존재하는 id 1개 + 비존재 id 999 → 반환 1, 예외 없음."""
    d1 = _make_dept(db_session, "부서A", 0)
    db_session.commit()

    updated = reorder_by_display_order(
        db_session,
        Department,
        "id",
        [(d1.id, 5), (999, 99)],
    )
    db_session.commit()

    assert updated == 1
    db_session.refresh(d1)
    assert d1.display_order == 5
