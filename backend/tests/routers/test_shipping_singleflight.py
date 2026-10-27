"""출하 목록은 같은 revision의 진행 중 조회만 공유하고 결과를 보관하지 않는다."""

from __future__ import annotations

from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from threading import Event
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, update
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.database import Base, get_db
from app.models import DataRevision, Item, ShippingRequest, ShippingRequestEvent, ShippingRequestStatusEnum
from app.routers import shipping
from app.schemas.shipping import ShippingEventResponse, ShippingRequestResponse
from app.services import read_singleflight
from tests.services.test_read_singleflight import _waiter_signal, revision_engine


@pytest.fixture
def shipping_read_engine(revision_engine: Engine) -> Engine:
    """기존 독립 revision DB에 실제 handler가 조회할 출하 관계 스키마를 준비한다."""
    Base.metadata.create_all(revision_engine)
    return revision_engine


def test_shipping_list_shares_overlapping_reads_but_never_completed_results(
    shipping_read_engine: Engine, monkeypatch: pytest.MonkeyPatch,
) -> None:
    waiting = _waiter_signal(monkeypatch)
    entered, release = Event(), Event()
    calls: list[int] = []

    def assemble(db: Session, requests: list[ShippingRequest]) -> list[ShippingRequestResponse]:
        """실제 목록 query 뒤의 DTO 조립을 멈춰 같은 요청의 중복 실행을 드러낸다."""
        calls.append(1)
        assert requests == []
        entered.set()
        assert release.wait(5)
        return []

    def read() -> list[ShippingRequestResponse]:
        """각 HTTP 요청처럼 같은 엔진에 서로 다른 Session을 사용한다."""
        with Session(shipping_read_engine) as db:
            return shipping.list_requests(status_filter=None, db=db)

    monkeypatch.setattr(shipping, "_to_responses", assemble)
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(read)
        try:
            assert entered.wait(5)
            second = pool.submit(read)
            assert waiting.wait(1), "동일 출하 목록의 DTO 조립이 동시에 두 번 실행됨"
        finally:
            release.set()
        assert first.result(timeout=5) == second.result(timeout=5) == []
    assert calls == [1]
    assert read() == []
    assert calls == [1, 1]
    assert not read_singleflight._inflight


@pytest.mark.parametrize("difference", ["status", "revision", "bind"])
def test_shipping_list_separates_status_revision_and_database(
    shipping_read_engine: Engine, monkeypatch: pytest.MonkeyPatch, difference: str,
) -> None:
    entered, release = Event(), Event()
    calls: list[int] = []

    def assemble(db: Session, requests: list[ShippingRequest]) -> list[ShippingRequestResponse]:
        """첫 목록이 진행 중이어도 다른 key의 조회는 독립 실행되어야 한다."""
        calls.append(1)
        if len(calls) == 1:
            entered.set()
            assert release.wait(5)
        return []

    def read_first() -> list[ShippingRequestResponse]:
        """필터 없는 첫 요청을 독립 Session으로 실행한다."""
        with Session(shipping_read_engine) as db:
            return shipping.list_requests(status_filter=None, db=db)

    monkeypatch.setattr(shipping, "_to_responses", assemble)
    other_engine = create_engine(shipping_read_engine.url) if difference == "bind" else shipping_read_engine
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            first = pool.submit(read_first)
            try:
                assert entered.wait(5)
                if difference == "revision":
                    with shipping_read_engine.begin() as connection:
                        connection.execute(update(DataRevision).values(revision=8))
                status = ShippingRequestStatusEnum.PREPARED if difference == "status" else None
                with Session(other_engine) as db:
                    assert shipping.list_requests(status_filter=status, db=db) == []
                assert calls == [1, 1]
            finally:
                release.set()
            assert first.result(timeout=5) == []
    finally:
        if other_engine is not shipping_read_engine:
            other_engine.dispose()
    assert not read_singleflight._inflight


def test_shipping_route_keeps_status_alias_and_returns_detached_event_dtos(
    shipping_read_engine: Engine,
) -> None:
    instant = datetime(2026, 10, 27, 1)
    with Session(shipping_read_engine) as db:
        item = Item(item_name="singleflight PF", model_symbol="9", process_type_code="PF", serial_no=1)
        db.add(item)
        db.flush()
        for status in (ShippingRequestStatusEnum.PREPARED, ShippingRequestStatusEnum.CANCELLED):
            request = ShippingRequest(base_pf_item_id=item.item_id, status=status)
            request.events = [ShippingRequestEvent(event_id=uuid4(), event_type="CREATED", created_at=instant)]
            db.add(request)
        db.commit()

    with Session(shipping_read_engine) as db:
        detached_rows = shipping.list_requests(status_filter=None, db=db)
    assert len(detached_rows) == 1
    assert isinstance(detached_rows[0], ShippingRequestResponse)
    assert isinstance(detached_rows[0].events[0], ShippingEventResponse)
    assert detached_rows[0].model_dump(mode="json")["events"][0]["event_type"] == "CREATED"

    def get_read_db() -> Iterator[Session]:
        """실제 라우터의 Depends에 HTTP 요청별 Session을 제공한다."""
        with Session(shipping_read_engine) as db:
            yield db

    app = FastAPI()
    app.include_router(shipping.router, prefix="/api/shipping")
    app.dependency_overrides[get_db] = get_read_db
    with TestClient(app) as client:
        parameters = client.get("/openapi.json").json()["paths"]["/api/shipping/requests"]["get"]["parameters"]
        assert [parameter["name"] for parameter in parameters] == ["status"]
        prepared = client.get("/api/shipping/requests", params={"status": "PREPARED"})
        assert prepared.status_code == 200, prepared.text
        assert [row["status"] for row in prepared.json()] == ["PREPARED"]
        cancelled = client.get("/api/shipping/requests", params={"status": "CANCELLED"})
        assert cancelled.status_code == 200, cancelled.text
        assert [row["status"] for row in cancelled.json()] == ["CANCELLED"]
