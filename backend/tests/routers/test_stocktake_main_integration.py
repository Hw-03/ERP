"""Current-main integration contracts for the census feature."""

import uuid
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Item

from tests.routers.test_stocktakes import BASE, _headers, _setup, _token


def test_census_session_route_is_registered(client: TestClient) -> None:
    response = client.post("/api/operator-sessions", json={})
    assert response.status_code != 404


def test_employee_model_has_pin_version_without_legacy_level() -> None:
    from app.models import Employee
    assert "level" not in Employee.__table__.columns
    assert "pin_version" in Employee.__table__.columns


@pytest.mark.parametrize("role", ["primary", "deputy"])
@pytest.mark.parametrize("kind", ["count_force_release", "correction_preview", "correction_approve", "correction_reject"])
def test_sensitive_commands_require_role_and_fresh_pin(
    client: TestClient, db_session: Session, make_item: Callable[..., Item], role: str, kind: str,
) -> None:
    """Every sensitive route and recovery attempt rechecks the current role and fresh PIN."""
    _, _, actor, _ = _setup(db_session, make_item)
    actor.department_role = role
    db_session.commit()
    token = _token(client, actor)
    record_id = str(uuid.uuid4())
    if kind == "count_force_release":
        url = f"{BASE}/counts/{record_id}/force-release"
        body = {"expected_version": 1, "fence": 1, "reason_code": "OPERATOR_REQUEST", "reason": "Review"}
        command = {"count_id": record_id, **body}
    else:
        suffix = {"correction_preview": "previews", "correction_approve": "approve", "correction_reject": "reject"}[kind]
        url = f"/api/inventory/business-corrections/{record_id}/{suffix}"
        body = {"expected_version": 1}
        if kind == "correction_approve":
            body.update(preview_id=str(uuid.uuid4()), preview_hash="0" * 64)
        elif kind == "correction_reject":
            body["reason"] = "Review"
        command = {"correction_id": record_id, **body}
    key = str(uuid.uuid4())
    headers = _headers(token, admin=True, key=key)
    assert client.post(url, json=body, headers=_headers(token)).status_code == 422
    assert client.post(url, json=body, headers={**headers, "X-Admin-Pin": "9999"}).status_code == 403
    assert client.post(url, json=body, headers=headers).status_code == 404
    resolve_url = f"{BASE}/commands/{key}/resolve"
    resolve_body = {"kind": kind, "command_payload": command, "reason": "Recover"}
    assert client.post(resolve_url, json=resolve_body, headers=_headers(token)).status_code == 403
    actor.department_role = "none"
    db_session.commit()
    assert client.post(url, json=body, headers=headers).status_code == 403
    assert client.post(resolve_url, json=resolve_body, headers=headers).status_code == 403


def test_legacy_admin_job_title_is_included_in_menu_bulk(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
) -> None:
    _, manager, actor, _ = _setup(db_session, make_item)
    actor.role = "admin"
    actor.department = "조립"
    actor.department_role = "none"
    db_session.commit()
    response = client.put(f"{BASE}/menu-visibility", json={"enabled": False},
                          headers={"X-Operator-Session": _token(client, manager)})
    assert response.status_code == 200
    db_session.refresh(actor)
    assert "stocktake" in actor.hidden_sidebar_tabs.split(",")


def test_pool_tube_material_keeps_supplier_scope(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
) -> None:
    from app import models
    from tests.services.test_defect_pool import pool_environment

    item = make_item(name="Tube pool material", warehouse_qty=0)
    _, pool = pool_environment(db_session, item, quantity=2)
    item.process_type_code = "TR"
    db_session.add(models.InventoryScope(scope_key="tube", physical_department="튜브"))
    db_session.flush()
    pool.scope_key = "tube"
    db_session.commit()
    response = client.get("/api/defects/locations")
    assert response.status_code == 200
    row = next(row for row in response.json() if row["item_id"] == str(item.item_id))
    assert row["process_type_code"] == "TR"
    assert row["return_supplier_scope"] == "tube"


def test_calendar_preserves_main_tube_department_classification(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
) -> None:
    from datetime import datetime
    from decimal import Decimal

    from app import models
    from tests.routers.test_transactions_summary import _seed_batch_log

    item = make_item(name="Tube calendar item", warehouse_qty=0)
    _seed_batch_log(db_session, item, models.TransactionTypeEnum.RECEIVE, Decimal(2),
                    sub_type="tube_receive_supplier", to_department="튜브",
                    batch_created_at=datetime(2026, 10, 12, 1),
                    log_created_at=datetime(2026, 10, 12, 1))
    db_session.query(models.IoBatch).one().work_type = "tube_material"
    db_session.commit()
    result = client.get("/api/inventory/transactions/display-calendar", params={"year": 2026, "month": 10})
    assert result.status_code == 200
    assert result.json()["days"]["2026-10-12"]["dept_count"] == 1
    assert result.json()["days"]["2026-10-12"]["warehouse_count"] == 0
