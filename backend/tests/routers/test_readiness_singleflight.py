"""Overlapping readiness probes must not multiply blocking diagnostics."""

import asyncio
import inspect
from threading import Event
from types import SimpleNamespace

import anyio.to_thread
import httpx
from starlette.requests import Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import main
from app.database import get_db


async def _wait_for_event(event: Event) -> None:
    """Wait for the diagnostic thread without occupying a worker token."""
    async with asyncio.timeout(3):
        while not event.is_set():
            await asyncio.sleep(0.005)


def test_overlapping_ready_probes_leave_workers_for_light_requests(db_session, monkeypatch):
    entered = Event()
    all_probes_arrived = Event()
    release = Event()
    calls = []
    arrivals = []
    consistent = True

    def check_schema(**kwargs):
        calls.append(kwargs["connection"])
        entered.set()
        assert release.wait(3), "diagnostic was not released"
        return SimpleNamespace(ready=True, revision="test-head")

    monkeypatch.setattr("bootstrap.schema.check_schema", check_schema)
    monkeypatch.setattr(main.integrity_svc, "check_inventory_consistency", lambda db: [])
    monkeypatch.setattr(
        "app.services.inventory_integrity.diagnose_inventory_integrity",
        lambda db: SimpleNamespace(is_consistent=consistent),
    )

    def override_get_db():
        arrivals.append(True)
        if len(arrivals) == 6:
            all_probes_arrived.set()
        yield db_session

    main.app.dependency_overrides[get_db] = override_get_db

    async def exercise():
        limiter = anyio.to_thread.current_default_thread_limiter()
        original_tokens = limiter.total_tokens
        limiter.total_tokens = 2
        requests = []
        light_response = None
        try:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=main.app), base_url="http://test",
            ) as client:
                requests.append(asyncio.create_task(client.get("/health/ready")))
                await _wait_for_event(entered)
                requests.extend(
                    asyncio.create_task(client.get("/health/ready")) for _ in range(5)
                )
                await _wait_for_event(all_probes_arrived)
                try:
                    light_response = await asyncio.wait_for(client.get("/api/app-session"), 1)
                except TimeoutError:
                    pass
                finally:
                    release.set()
                    responses = await asyncio.gather(*requests)
                assert light_response is not None, "readiness waiters occupied every worker"
                assert light_response.status_code == 200
                assert all(response.status_code == 200 for response in responses)
                assert len(calls) == 1

                nonlocal consistent
                consistent = False
                refreshed = await client.get("/health/ready")
                assert refreshed.status_code == 503
                assert refreshed.json()["checks"]["ledger"] is False
                assert len(calls) == 2, "a completed readiness result was cached"
        finally:
            release.set()
            if requests:
                await asyncio.gather(*requests, return_exceptions=True)
            limiter.total_tokens = original_tokens

    try:
        asyncio.run(exercise())
    finally:
        main.app.dependency_overrides.pop(get_db, None)


def test_cancelled_last_waiter_keeps_owned_session_until_diagnostic_finishes(db_session, monkeypatch):
    assert inspect.iscoroutinefunction(main.health_ready), "readiness must await outside the worker pool"
    entered = Event()
    release = Event()
    finished = Event()
    diagnostic_sessions = []
    calls = []
    request_session = Session(bind=db_session.get_bind(), autoflush=False)
    transaction_was_active = []

    monkeypatch.setattr(
        "bootstrap.schema.check_schema",
        lambda **kwargs: SimpleNamespace(ready=True, revision="test-head"),
    )

    def check_inventory(db):
        calls.append(True)
        diagnostic_sessions.append(db)
        transaction = db.get_transaction()
        entered.set()
        assert release.wait(3), "diagnostic was not released"
        transaction_was_active.append(transaction.is_active)
        assert db.scalar(text("SELECT 1")) == 1
        finished.set()
        return []

    monkeypatch.setattr(main.integrity_svc, "check_inventory_consistency", check_inventory)
    monkeypatch.setattr(
        "app.services.inventory_integrity.diagnose_inventory_integrity",
        lambda db: SimpleNamespace(is_consistent=True),
    )
    request = Request({"type": "http", "method": "GET", "path": "/health/ready", "headers": []})

    async def exercise():
        first = asyncio.create_task(main.health_ready(request, request_session))
        following = None
        try:
            await _wait_for_event(entered)
            first.cancel()
            try:
                await first
            except asyncio.CancelledError:
                pass
            request_session.close()
            assert diagnostic_sessions[0] is not request_session

            following = asyncio.create_task(main.health_ready(request, db_session))
            await asyncio.sleep(0)
            release.set()
            response = await following
            assert response.status_code == 200
            assert len(calls) == 1, "cancelling the last waiter discarded an active check"
            assert transaction_was_active == [True]
            assert diagnostic_sessions[0].in_transaction() is False
        finally:
            release.set()
            await _wait_for_event(finished)
            await asyncio.gather(first, *([following] if following else []), return_exceptions=True)

    try:
        asyncio.run(exercise())
    finally:
        request_session.close()
