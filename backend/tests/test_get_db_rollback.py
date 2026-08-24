"""WS4 회귀: get_db() 가 핸들러 예외 시 세션을 롤백한 뒤 close 하는지 검증.

미롤백이면 풀드 PostgreSQL 경로에서 aborted-transaction 커넥션이 풀로 반환돼
다음 요청을 오염시킨다. PG 풀 재현 없이 제너레이터 계약을 직접 검증한다.
"""
from unittest.mock import MagicMock, patch

from starlette.requests import Request

from app import database


def _request(method: str = "POST", path: str = "/probe") -> Request:
    return Request(
        {
            "type": "http",
            "method": method,
            "path": path,
            "headers": [],
            "query_string": b"",
            "server": ("testserver", 80),
            "client": ("testclient", 123),
            "scheme": "http",
        }
    )


def test_get_db_rolls_back_and_closes_on_exception():
    fake = MagicMock()
    order = MagicMock()
    order.attach_mock(fake.rollback, "rollback")
    order.attach_mock(fake.close, "close")
    with patch.object(database, "SessionLocal", return_value=fake):
        gen = database.get_db(_request())
        assert next(gen) is fake
        try:
            gen.throw(RuntimeError("handler boom"))
        except RuntimeError:
            pass
        fake.rollback.assert_called_once()
        fake.close.assert_called_once()
        # rollback 은 반드시 close 이전 (오염 커넥션 풀 반환 방지의 핵심).
        assert [c[0] for c in order.mock_calls] == ["rollback", "close"]


def test_get_db_no_rollback_on_normal_completion():
    fake = MagicMock()
    with patch.object(database, "SessionLocal", return_value=fake):
        gen = database.get_db(_request())
        next(gen)
        try:
            next(gen)  # 정상 종료 → StopIteration
        except StopIteration:
            pass
        fake.rollback.assert_not_called()
        fake.close.assert_called_once()


def test_get_db_guards_inventory_domain_writes():
    fake = MagicMock()
    with (
        patch.object(database, "SessionLocal", return_value=fake),
        patch(
            "app.services.weekly_inventory_snapshot.ensure_due_snapshot_committed"
        ) as ensure_snapshot,
    ):
        gen = database.get_db(_request(path="/api/inventory/transactions"))
        assert next(gen) is fake
        gen.close()

    ensure_snapshot.assert_called_once_with(fake, source="first_write")


def test_get_db_does_not_guard_unrelated_writes():
    fake = MagicMock()
    with (
        patch.object(database, "SessionLocal", return_value=fake),
        patch(
            "app.services.weekly_inventory_snapshot.ensure_due_snapshot_committed"
        ) as ensure_snapshot,
    ):
        gen = database.get_db(_request(path="/api/settings/integrity/repair"))
        assert next(gen) is fake
        gen.close()

    ensure_snapshot.assert_not_called()
