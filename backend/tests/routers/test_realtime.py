from __future__ import annotations

import asyncio
import importlib.util
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi.testclient import TestClient

from app.routers import realtime as realtime_router
from app.services.realtime import RevisionSnapshot


def test_realtime_router_module_exists() -> None:
    assert importlib.util.find_spec("app.routers.realtime") is not None


SNAPSHOT = RevisionSnapshot(
    revision=42,
    updated_at=datetime(2026, 8, 4, 12, 30, 45),
)


class FakeBroker:
    def __init__(self, *, enqueue_initial: bool = True) -> None:
        self.enqueue_initial = enqueue_initial
        self.active_subscribers = 0

    async def read_snapshot(self) -> RevisionSnapshot:
        return SNAPSHOT

    @asynccontextmanager
    async def subscribe(self):
        queue: asyncio.Queue[RevisionSnapshot] = asyncio.Queue(maxsize=1)
        if self.enqueue_initial:
            queue.put_nowait(SNAPSHOT)
        self.active_subscribers += 1
        try:
            yield queue
        finally:
            self.active_subscribers -= 1


class FakeRequest:
    def __init__(self, disconnected: list[bool] | None = None) -> None:
        self._disconnected = list(disconnected or [])

    async def is_disconnected(self) -> bool:
        if self._disconnected:
            return self._disconnected.pop(0)
        return False


def test_revision_endpoint_is_public_json_and_disables_caches() -> None:
    from app.main import app

    broker = FakeBroker()
    app.dependency_overrides[realtime_router.get_revision_broker] = lambda: broker
    try:
        with TestClient(app) as client:
            response = client.get("/api/realtime/revision")
    finally:
        app.dependency_overrides.pop(realtime_router.get_revision_broker, None)

    assert response.status_code == 200
    assert response.json() == {
        "revision": 42,
        "updated_at": "2026-08-04T12:30:45",
    }
    assert "no-cache" in response.headers["cache-control"]
    assert "no-store" in response.headers["cache-control"]


def test_stream_response_has_required_sse_headers() -> None:
    async def scenario() -> None:
        response = await realtime_router.revision_stream(
            FakeRequest(),
            FakeBroker(),
        )

        assert response.media_type == "text/event-stream"
        assert response.headers["cache-control"] == "no-cache, no-transform"
        assert response.headers["x-accel-buffering"] == "no"

        await response.body_iterator.aclose()

    asyncio.run(scenario())


def test_stream_sends_initial_revision_event_and_heartbeat() -> None:
    broker = FakeBroker()

    async def scenario() -> None:
        stream = realtime_router.stream_revision_events(
            FakeRequest(),
            broker,
            heartbeat_interval=0.01,
        )
        first = await anext(stream)
        heartbeat = await anext(stream)
        await stream.aclose()

        assert first.startswith("id: 42\nevent: revision\nretry: 1000\ndata: ")
        assert '"revision":42' in first
        assert '"updated_at":"2026-08-04T12:30:45"' in first
        assert first.endswith("\n\n")
        assert heartbeat == ": heartbeat\n\n"
        assert broker.active_subscribers == 0

    asyncio.run(scenario())


def test_stream_disconnect_releases_subscription() -> None:
    broker = FakeBroker()

    async def scenario() -> None:
        stream = realtime_router.stream_revision_events(
            FakeRequest([False, True]),
            broker,
            heartbeat_interval=1,
        )
        assert "event: revision" in await anext(stream)
        try:
            await anext(stream)
        except StopAsyncIteration:
            pass
        else:
            raise AssertionError("disconnected stream must stop")
        assert broker.active_subscribers == 0

    asyncio.run(scenario())


def test_main_registers_both_realtime_routes() -> None:
    from app.main import app

    paths = {route.path for route in app.routes}
    assert "/api/realtime/revision" in paths
    assert "/api/realtime/stream" in paths


def test_app_shutdown_hook_stops_realtime_broker(monkeypatch) -> None:
    from app import main

    calls: list[str] = []

    async def stop() -> None:
        calls.append("stop")

    monkeypatch.setattr(main.realtime_svc.revision_broker, "stop", stop)

    assert main._stop_realtime_broker in main.app.router.on_shutdown
    asyncio.run(main._stop_realtime_broker())
    assert calls == ["stop"]
