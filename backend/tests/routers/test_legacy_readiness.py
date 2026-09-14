"""The employee supervisor must admit only a validated Friday database."""

from types import SimpleNamespace

import pytest

from app import main


@pytest.mark.parametrize(
    ("schema_ready", "consistent", "expected_status"),
    [(True, True, 200), (False, True, 503), (True, False, 503)],
)
def test_ready_requires_schema_and_business_integrity(
    client, monkeypatch, schema_ready, consistent, expected_status,
):
    monkeypatch.setattr(
        "bootstrap.schema.check_schema",
        lambda **kwargs: SimpleNamespace(ready=schema_ready, revision="20260910_0033"),
    )
    monkeypatch.setattr(
        "app.services.inventory_integrity.diagnose_inventory_integrity",
        lambda db: SimpleNamespace(is_consistent=consistent, issue_count=0 if consistent else 1),
    )
    response = client.get("/health/ready")
    assert response.status_code == expected_status
    assert response.json()["status"] == ("ready" if expected_status == 200 else "not_ready")


def test_ready_dependency_failure_is_closed_and_sanitized(client, monkeypatch):
    def fail(**kwargs):
        raise RuntimeError("private-db-secret")

    monkeypatch.setattr("bootstrap.schema.check_schema", fail)
    response = client.get("/health/ready")
    assert response.status_code == 503
    assert "private-db-secret" not in response.text


def test_ready_rejects_physical_inventory_mismatch(client, monkeypatch):
    monkeypatch.setattr(
        "bootstrap.schema.check_schema",
        lambda **kwargs: SimpleNamespace(ready=True, revision="20260910_0033"),
    )
    monkeypatch.setattr(
        "app.services.inventory_integrity.diagnose_inventory_integrity",
        lambda db: SimpleNamespace(is_consistent=True, issue_count=0),
    )
    monkeypatch.setattr(main.integrity_svc, "check_inventory_consistency", lambda db: [object()])
    assert client.get("/health/ready").status_code == 503
