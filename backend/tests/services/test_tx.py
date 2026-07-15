from __future__ import annotations

from unittest.mock import Mock

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.services._tx import transactional


def _session() -> Mock:
    db = Mock(spec=Session)
    db.info = {}
    return db


def test_transactional_commits_once_on_success() -> None:
    db = _session()

    with transactional(db):
        pass

    db.commit.assert_called_once_with()
    db.rollback.assert_not_called()


def test_transactional_rolls_back_once_and_reraises_same_exception() -> None:
    db = _session()
    error = RuntimeError("injected failure")

    with pytest.raises(RuntimeError) as raised:
        with transactional(db):
            raise error

    assert raised.value is error
    db.rollback.assert_called_once_with()
    db.commit.assert_not_called()


def test_transactional_rolls_back_when_commit_fails_and_reraises_same_exception() -> None:
    db = _session()
    error = IntegrityError("commit", {}, RuntimeError("constraint failure"))
    db.commit.side_effect = error

    with pytest.raises(IntegrityError) as raised:
        with transactional(db):
            pass

    assert raised.value is error
    db.commit.assert_called_once_with()
    db.rollback.assert_called_once_with()
    assert db.info == {}


def test_nested_transactional_commits_only_at_outermost_boundary() -> None:
    db = _session()

    with transactional(db):
        with transactional(db):
            pass

    db.commit.assert_called_once_with()
    db.rollback.assert_not_called()


def test_nested_transactional_rolls_back_only_at_outermost_boundary() -> None:
    db = _session()
    error = RuntimeError("nested failure")

    with pytest.raises(RuntimeError) as raised:
        with transactional(db):
            with transactional(db):
                raise error

    assert raised.value is error
    db.rollback.assert_called_once_with()
    db.commit.assert_not_called()


def test_caught_nested_exception_marks_outer_transaction_rollback_only() -> None:
    db = _session()
    error = RuntimeError("caught nested failure")

    with pytest.raises(RuntimeError) as raised:
        with transactional(db):
            try:
                with transactional(db):
                    raise error
            except RuntimeError:
                pass

    assert raised.value is error
    db.rollback.assert_called_once_with()
    db.commit.assert_not_called()
