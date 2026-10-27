"""BOM parent IDs preserve the full-list membership without loading full rows."""

from datetime import datetime
import uuid

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models import BOM, Item
from app.routers.bom import router


def test_bom_parent_ids_empty(client: TestClient) -> None:
    """The static endpoint must win over the parent UUID route even when empty."""
    response = client.get("/api/bom/parent-ids")
    assert response.status_code == 200, response.text
    assert response.json() == []


def test_bom_parent_ids_match_full_list_and_select_only_distinct_ids() -> None:
    """Keep legacy membership while reading only the ID column in one query."""
    # An isolated legacy-shaped database permits orphan rows to exercise the
    # full-list endpoint's existing missing-item exclusion contract.
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    try:
        Base.metadata.create_all(engine)
        with Session(engine) as session:
            parent_ids = [uuid.UUID(int=2), uuid.UUID(int=1)]
            child_id = uuid.UUID(int=3)
            deleted_child_id = uuid.UUID(int=4)
            orphan_only_parent_id = uuid.UUID(int=5)
            for serial, item_id in enumerate([*parent_ids, child_id, deleted_child_id, orphan_only_parent_id], 1):
                session.add(Item(
                    item_id=item_id, item_name=f"item-{serial}",
                    model_symbol="1", process_type_code="TR", serial_no=serial,
                    deleted_at=datetime(2026, 1, 1) if item_id in (parent_ids[0], deleted_child_id) else None,
                ))
            session.flush()
            for parent_id, child in [
                (parent_ids[0], child_id), (parent_ids[0], deleted_child_id),
                (parent_ids[1], deleted_child_id),
                (orphan_only_parent_id, uuid.UUID(int=99)),
                (uuid.UUID(int=98), child_id),
            ]:
                session.add(BOM(parent_item_id=parent_id, child_item_id=child, quantity=1, unit="EA"))
            session.commit()

            app = FastAPI()
            app.include_router(router, prefix="/api/bom")
            app.dependency_overrides[get_db] = lambda: session
            with TestClient(app) as client:
                full = client.get("/api/bom")
                assert full.status_code == 200, full.text
                statements: list[str] = []

                def capture_sql(
                    _connection: object, _cursor: object, statement: str,
                    _parameters: object, _context: object, _executemany: bool,
                ) -> None:
                    """Count SELECTs and preserve their actual projections for the assertion."""
                    if statement.lstrip().upper().startswith("SELECT"):
                        statements.append(statement)

                event.listen(engine, "before_cursor_execute", capture_sql)
                try:
                    response = client.get("/api/bom/parent-ids")
                finally:
                    event.remove(engine, "before_cursor_execute", capture_sql)

            assert response.status_code == 200, response.text
            assert response.json() == sorted({row["parent_item_id"] for row in full.json()})
            assert response.json() == [str(parent_id) for parent_id in sorted(parent_ids)]
            assert len(statements) == 1
            selection = statements[0].upper().split("FROM", 1)[0]
            assert "DISTINCT" in selection
            assert "PARENT_ITEM_ID" in selection
            assert "CHILD_ITEM_ID" not in selection
            assert "ITEM_NAME" not in selection
            assert "QUANTITY" not in selection
            assert "ORDER BY" in statements[0].upper()
    finally:
        engine.dispose()
