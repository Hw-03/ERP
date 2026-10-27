"""KPI aggregation preserves observation membership without hydrating display objects."""

from collections import Counter
from collections.abc import Callable
from datetime import date, datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import event
from sqlalchemy.orm import Session

from app import models
from app.services.stocktake_history import observation_groups
from tests.services.test_stocktake_counts import setup_round
from tests.services.test_stocktake_application import confirm, apply


@pytest.fixture
def observed_work(db_session: Session, make_item: Callable[..., Any]) -> dict[str, UUID]:
    """Apply two unchanged items in one operation so row counts cannot stand in for work counts."""
    extra = make_item(name="Power motor", warehouse_qty=3)
    extra_id = extra.item_id
    env = setup_round(db_session, make_item)
    service, actor, item, round_, _ = env
    item_id, actor_id = item.item_id, actor.employee_id
    targets = service.list_targets(db_session, UUID(round_["round_id"]))["items"]
    confirmations = []
    for target in targets:
        if target["scope_id"] == "warehouse" and target["item_id"] in {str(item_id), str(extra_id)}:
            current = (*env[:4], target)
            confirmed = confirm(db_session, current, normal=3 if target["item_id"] == str(extra_id) else 10)
            confirmations.append(confirmed["confirmation_revision_id"])
    proposal = service.execute(db_session, actor, "application_preview", str(uuid4()), {
        "round_id": round_["round_id"], "confirmation_revision_ids": confirmations,
    })
    apply(db_session, env, proposal)
    operation = db_session.query(models.InventoryOperation).filter_by(domain="stocktake", action="apply").one()
    operation.effective_at = datetime(2026, 10, 12, 15, 30)
    db_session.add(models.ItemAlias(item_id=extra_id, alias="Engine alias", normalized_alias="enginealias"))
    group = models.ItemSynonymGroup()
    db_session.add(group)
    db_session.flush()
    db_session.add_all([
        models.ItemSynonymTerm(group_id=group.group_id, term="motor", normalized_term="motor"),
        models.ItemSynonymTerm(group_id=group.group_id, term="driveunit", normalized_term="driveunit"),
    ])
    db_session.commit()
    return {"item_id": item_id, "extra_id": extra_id, "actor_id": actor_id,
            "operation_id": operation.operation_id}


@pytest.mark.parametrize("search", [None, "Counted", "Engine alias", "driveunit", "no such item"])
def test_summary_reads_only_projection_columns(
    client: TestClient, db_session: Session, observed_work: dict[str, UUID], search: str | None,
) -> None:
    expected = observation_groups(db_session, search=search)
    expected_counts = dict(Counter(group.stocktake["department"] for group in expected))
    db_session.expunge_all()
    loaded = []

    def record_load(_db: Session, instance: Any) -> None:
        """Observe real ORM hydration rather than relying on SQL text formatting."""
        if isinstance(instance, (models.Item, models.InventoryOperation)):
            loaded.append(type(instance).__name__)

    event.listen(db_session, "loaded_as_persistent", record_load)
    try:
        response = client.get("/api/inventory/transactions/summary", params={"search": search} if search else {})
    finally:
        event.remove(db_session, "loaded_as_persistent", record_load)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == body["adjust_count"] == len(expected)
    assert body["department_counts"] == expected_counts
    assert loaded == [], "numeric KPI query hydrated full Item/InventoryOperation display objects"


@pytest.mark.parametrize("filters", [
    {"department": "창고"}, {"department": "조립"},
    {"date_from": date(2026, 10, 13), "date_to": date(2026, 10, 13)},
    {"date_to": date(2026, 10, 12)},
    {"operation_keys": "stocktake"}, {"operation_keys": "shipping"},
    {"transaction_types": "ADJUST"}, {"transaction_types": "RECEIVE"},
    {"process_step": "R"}, {"process_step": "F"},
    {"search": "Counted item,Power motor"}, {"search": "Counter"},
])
def test_summary_keeps_existing_observation_filter_semantics(
    client: TestClient, db_session: Session, observed_work: dict[str, UUID], filters: dict[str, Any],
) -> None:
    expected = observation_groups(db_session, **filters)
    response = client.get("/api/inventory/transactions/summary", params={
        key: value.isoformat() if isinstance(value, date) else value for key, value in filters.items()
    })
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == body["adjust_count"] == len(expected)
    assert body["department_counts"] == dict(Counter(group.stocktake["department"] for group in expected))


@pytest.mark.parametrize("include_archived", [False, True])
def test_summary_counts_an_operation_once_when_only_some_members_are_eligible(
    client: TestClient, db_session: Session, observed_work: dict[str, UUID], include_archived: bool,
) -> None:
    db_session.get(models.Item, observed_work["extra_id"]).deleted_at = datetime(2026, 10, 15)
    db_session.commit()
    for search in (None, "Power motor", "Counted"):
        filters = {"include_archived": include_archived, "search": search}
        expected = observation_groups(db_session, **filters)
        response = client.get("/api/inventory/transactions/summary", params={
            key: value for key, value in filters.items() if value is not None
        })
        assert response.status_code == 200, response.text
        assert response.json()["total"] == len(expected)


@pytest.mark.parametrize("scenario", [
    "snapshot_name", "snapshot_code", "current_code", "reason", "model_missing",
    "requester", "other_requester", "empty_department", "other_department",
])
def test_summary_preserves_snapshot_metadata_and_requester_search(
    client: TestClient, db_session: Session, observed_work: dict[str, UUID], scenario: str,
) -> None:
    operation = db_session.get(models.InventoryOperation, observed_work["operation_id"])
    extra = db_session.get(models.Item, observed_work["extra_id"])
    filters: dict[str, Any] = {}
    if scenario == "snapshot_name":
        db_session.get(models.Item, observed_work["item_id"]).item_name = "Renamed current item"
        filters["search"] = "Counted item"
    elif scenario == "snapshot_code":
        for target in db_session.query(models.StocktakeTarget).filter_by(item_id=extra.item_id):
            target.item_code = "SEALED-CODE"
        filters["search"] = "SEALED-CODE"
    elif scenario == "current_code":
        filters["search"] = extra.mes_code
        for target in db_session.query(models.StocktakeTarget).filter_by(item_id=extra.item_id):
            target.item_code = "DIFFERENT-SNAPSHOT-CODE"
    elif scenario == "reason":
        operation.reason = "Sealed evidence reason"
        filters["search"] = "Sealed evidence reason"
    elif scenario == "model_missing":
        filters["model"] = "Not a configured model"
    elif scenario in {"requester", "other_requester"}:
        filters["requester_employee_id"] = observed_work["actor_id"] if scenario == "requester" else uuid4()
    else:
        operation.department = "" if scenario == "empty_department" else "고압"
    db_session.commit()
    expected = observation_groups(db_session, **filters)
    response = client.get("/api/inventory/transactions/summary", params={
        key: str(value) for key, value in filters.items()
    })
    assert response.status_code == 200, response.text
    assert response.json()["total"] == len(expected)
    assert response.json()["department_counts"] == dict(Counter(group.stocktake["department"] for group in expected))
