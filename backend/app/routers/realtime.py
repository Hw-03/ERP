"""Realtime revision endpoints."""

from __future__ import annotations

import asyncio
import json
from typing import AsyncIterator

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse

from app.services import realtime as realtime_svc
from app.services.realtime import RevisionBroker, RevisionSnapshot


HEARTBEAT_INTERVAL_SECONDS = 15.0
router = APIRouter()


def get_revision_broker() -> RevisionBroker:
    return realtime_svc.revision_broker


def _payload(snapshot: RevisionSnapshot) -> dict[str, int | str]:
    return {
        "revision": snapshot.revision,
        "updated_at": snapshot.updated_at.isoformat(),
    }


def _revision_event(snapshot: RevisionSnapshot) -> str:
    data = json.dumps(_payload(snapshot), ensure_ascii=False, separators=(",", ":"))
    return (
        f"id: {snapshot.revision}\n"
        "event: revision\n"
        "retry: 1000\n"
        f"data: {data}\n\n"
    )


async def stream_revision_events(
    request: Request,
    broker: RevisionBroker,
    *,
    heartbeat_interval: float = HEARTBEAT_INTERVAL_SECONDS,
) -> AsyncIterator[str]:
    """Yield current/revised snapshots until the client disconnects."""

    last_revision: int | None = None
    async with broker.subscribe() as queue:
        while not await request.is_disconnected():
            try:
                snapshot = await asyncio.wait_for(
                    queue.get(),
                    timeout=heartbeat_interval,
                )
            except asyncio.TimeoutError:
                yield ": heartbeat\n\n"
                continue
            if snapshot.revision == last_revision:
                continue
            last_revision = snapshot.revision
            yield _revision_event(snapshot)


@router.get("/revision")
async def revision_snapshot(
    broker: RevisionBroker = Depends(get_revision_broker),
) -> JSONResponse:
    snapshot = await broker.read_snapshot()
    return JSONResponse(
        content=_payload(snapshot),
        headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
    )


@router.get("/stream", response_class=StreamingResponse)
async def revision_stream(
    request: Request,
    broker: RevisionBroker = Depends(get_revision_broker),
) -> StreamingResponse:
    return StreamingResponse(
        stream_revision_events(request, broker),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )
