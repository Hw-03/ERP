"""Settings integrity endpoint smoke tests."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app import database
from app.database import Base
from app.main import app
from app.models import (
    AdminAuditLog,
    Inventory,
    InventoryLocation,
    Item,
    LocationStatusEnum,
    ProcessType,
    SystemSetting,
)
from app.services.pin_auth import hash_pin


class _TrackingSession(Session):
    """실제 get_db 요청 session의 트랜잭션 경계와 fault를 관찰한다."""

    observer: dict[str, Any]

    def add(self, instance: object, _warn: bool = True) -> None:
        if isinstance(instance, AdminAuditLog):
            self.observer["audit_adds"] += 1
        super().add(instance, _warn=_warn)

    def flush(self, objects: object = None) -> None:
        self.observer["flushes"] += 1
        has_inventory = any(isinstance(row, Inventory) for row in self.dirty)
        has_audit = any(isinstance(row, AdminAuditLog) for row in self.new)
        if self.observer["failure"] == "inventory_flush" and has_inventory:
            self.observer["faults"].append("inventory_flush")
            raise RuntimeError("injected inventory flush failure")
        if self.observer["failure"] == "audit_flush" and has_audit:
            self.observer["faults"].append("audit_flush")
            raise RuntimeError("injected audit flush failure")
        super().flush(objects)
        if has_audit:
            self.info["integrity_audit_flushed"] = True

    def commit(self) -> None:
        self.observer["commits"] += 1
        if any(isinstance(row, AdminAuditLog) for row in self.new):
            raise RuntimeError("audit must be flushed before final commit")
        if (
            self.observer["failure"] == "final_commit"
            and self.info.get("integrity_audit_flushed")
        ):
            self.observer["faults"].append("final_commit")
            raise RuntimeError("injected final commit failure")
        super().commit()

    def rollback(self) -> None:
        self.observer["rollbacks"] += 1
        super().rollback()


def _inventory_rows(engine) -> list[tuple[str, int, int]]:
    """서비스 계산을 재사용하지 않고 별도 연결의 SQL로 recorded/expected를 읽는다."""
    with engine.connect() as connection:
        return [
            (str(item_id), int(recorded), int(expected))
            for item_id, recorded, expected in connection.execute(
                text(
                    "SELECT i.item_id, i.quantity, "
                    "i.warehouse_qty + COALESCE(SUM(l.quantity), 0) AS expected "
                    "FROM inventory AS i "
                    "JOIN items AS item ON item.item_id = i.item_id "
                    "LEFT JOIN inventory_locations AS l ON l.item_id = i.item_id "
                    "GROUP BY i.item_id, i.quantity, i.warehouse_qty, item.serial_no "
                    "ORDER BY item.serial_no"
                )
            ).all()
        ]


def _audit_rows(engine) -> list[tuple[str, str, str, str]]:
    with engine.connect() as connection:
        return [
            tuple(row)
            for row in connection.execute(
                text(
                    "SELECT action, target_type, target_id, payload_summary "
                    "FROM admin_audit_logs ORDER BY created_at, audit_id"
                )
            ).all()
        ]


def _admin_pin_value(engine) -> str:
    with engine.connect() as connection:
        return str(
            connection.execute(
                text(
                    "SELECT setting_value FROM system_settings "
                    "WHERE setting_key = 'admin_pin'"
                )
            ).scalar_one()
        )


def _admin_pin_count(engine) -> int:
    with engine.connect() as connection:
        return int(
            connection.execute(
                text(
                    "SELECT COUNT(*) FROM system_settings "
                    "WHERE setting_key = 'admin_pin'"
                )
            ).scalar_one()
        )


@pytest.fixture()
def integrity_request_db(tmp_path, monkeypatch):
    """파일 DB + 실제 get_db로 요청 rollback을 독립 연결에서 검증한다."""
    engine = create_engine(
        f"sqlite:///{(tmp_path / 'integrity-request.db').as_posix()}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    observer: dict[str, Any] = {
        "flushes": 0,
        "commits": 0,
        "audit_adds": 0,
        "rollbacks": 0,
        "failure": None,
        "faults": [],
    }
    _TrackingSession.observer = observer
    request_sessions = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=engine,
        class_=_TrackingSession,
    )

    with request_sessions() as setup:
        setup.add(ProcessType(code="TR", prefix="T", suffix="R", stage_order=10))
        setup.add(SystemSetting(setting_key="admin_pin", setting_value=hash_pin("0000")))
        for serial_no, recorded, warehouse, location in (
            (1, 99, 4, 3),
            (2, 50, 5, 2),
            (3, 3, 3, 0),
        ):
            item = Item(
                item_name=f"정합성 원자성 {serial_no}",
                unit="EA",
                model_symbol="9",
                process_type_code="TR",
                serial_no=serial_no,
            )
            setup.add(item)
            setup.flush()
            setup.add(
                Inventory(
                    item_id=item.item_id,
                    quantity=recorded,
                    warehouse_qty=warehouse,
                    pending_quantity=0,
                )
            )
            if location:
                setup.add(
                    InventoryLocation(
                        item_id=item.item_id,
                        department="조립",
                        status=LocationStatusEnum.PRODUCTION,
                        quantity=location,
                        pending_quantity=0,
                    )
                )
        setup.commit()

    observer.update(
        flushes=0,
        commits=0,
        audit_adds=0,
        rollbacks=0,
        failure=None,
        faults=[],
    )
    monkeypatch.setattr(database, "SessionLocal", request_sessions)
    app.dependency_overrides.pop(database.get_db, None)
    with TestClient(app, raise_server_exceptions=False) as request_client:
        yield request_client, engine, observer

    Base.metadata.drop_all(bind=engine)
    engine.dispose()


def test_integrity_inventory_post_uses_body_pin(client, make_item):
    make_item(name="정합성 POST", warehouse_qty=Decimal("3"))

    resp = client.post(
        "/api/settings/integrity/inventory",
        json={"pin": "0000", "limit": 50},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["checked"] == 1
    assert body["mismatched_count"] == 0
    assert body["samples"] == []


@pytest.mark.parametrize("pin_state", ["legacy", "missing"])
def test_integrity_inventory_get_authenticates_without_persisting_pin_changes(
    integrity_request_db,
    pin_state,
):
    request_client, engine, observer = integrity_request_db
    with engine.begin() as connection:
        if pin_state == "legacy":
            connection.execute(
                text(
                    "UPDATE system_settings SET setting_value = '0000' "
                    "WHERE setting_key = 'admin_pin'"
                )
            )
        else:
            connection.execute(
                text("DELETE FROM system_settings WHERE setting_key = 'admin_pin'")
            )

    response = request_client.request(
        "GET",
        "/api/settings/integrity/inventory",
        params={"pin": "0000", "limit": 50},
    )

    assert response.status_code == 200, response.text
    if pin_state == "legacy":
        assert _admin_pin_value(engine) == "0000"
    else:
        assert _admin_pin_count(engine) == 0
    assert observer["commits"] == 0


def test_integrity_inventory_post_rejects_wrong_pin(client):
    resp = client.post(
        "/api/settings/integrity/inventory",
        json={"pin": "9999", "limit": 50},
    )
    assert resp.status_code == 403


def test_integrity_inventory_get_compatibility_is_kept(client, make_item):
    make_item(name="정합성 GET 호환", warehouse_qty=Decimal("2"))

    resp = client.get("/api/settings/integrity/inventory", params={"pin": "0000", "limit": 10})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["checked"] == 1
    assert body["mismatched_count"] == 0



def test_settings_reset_endpoint_is_removed(client):
    resp = client.post("/api/settings/reset", json={"pin": "0000"})
    assert resp.status_code == 404


def test_integrity_repair_commits_inventory_and_audit_atomically(integrity_request_db):
    request_client, engine, observer = integrity_request_db
    before = _inventory_rows(engine)
    assert [(recorded, expected) for _, recorded, expected in before] == [
        (99, 7),
        (50, 7),
        (3, 3),
    ]

    response = request_client.post(
        "/api/settings/integrity/repair",
        json={"pin": "0000", "dry_run": False},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {
        "checked": 3,
        "mismatched": 2,
        "repaired": 2,
        "dry_run": False,
        "samples": response.json()["samples"],
    }
    assert len(response.json()["samples"]) == 2
    after = _inventory_rows(engine)
    assert all(recorded == expected for _, recorded, expected in after)
    assert _audit_rows(engine) == [
        ("settings.integrity_repair", "settings", "inventory", "repaired 2 rows")
    ]
    assert observer["commits"] == 1
    assert observer["audit_adds"] == 1
    assert observer["rollbacks"] == 0


def test_integrity_repair_dry_run_has_zero_side_effects(integrity_request_db):
    request_client, engine, observer = integrity_request_db
    before = _inventory_rows(engine)

    response = request_client.post(
        "/api/settings/integrity/repair",
        json={"pin": "0000", "dry_run": True},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["checked"] == 3
    assert body["mismatched"] == 2
    assert body["repaired"] == 0
    assert body["dry_run"] is True
    assert len(body["samples"]) == 2
    assert _inventory_rows(engine) == before
    assert _audit_rows(engine) == []
    assert observer["flushes"] == 0
    assert observer["commits"] == 0
    assert observer["audit_adds"] == 0
    assert observer["rollbacks"] == 0


def test_integrity_repair_dry_run_does_not_commit_legacy_pin_migration(
    integrity_request_db,
):
    request_client, engine, observer = integrity_request_db
    with engine.begin() as connection:
        connection.execute(
            text(
                "UPDATE system_settings SET setting_value = '0000' "
                "WHERE setting_key = 'admin_pin'"
            )
        )
    before = _inventory_rows(engine)

    response = request_client.post(
        "/api/settings/integrity/repair",
        json={"pin": "0000", "dry_run": True},
    )

    assert response.status_code == 200, response.text
    assert _inventory_rows(engine) == before
    assert _audit_rows(engine) == []
    assert _admin_pin_value(engine) == "0000"
    assert observer["flushes"] == 0
    assert observer["commits"] == 0


def test_integrity_repair_migrates_legacy_pin_in_the_single_final_commit(
    integrity_request_db,
):
    request_client, engine, observer = integrity_request_db
    with engine.begin() as connection:
        connection.execute(
            text(
                "UPDATE system_settings SET setting_value = '0000' "
                "WHERE setting_key = 'admin_pin'"
            )
        )

    response = request_client.post(
        "/api/settings/integrity/repair",
        json={"pin": "0000", "dry_run": False},
    )

    assert response.status_code == 200, response.text
    assert all(recorded == expected for _, recorded, expected in _inventory_rows(engine))
    assert _audit_rows(engine) == [
        ("settings.integrity_repair", "settings", "inventory", "repaired 2 rows")
    ]
    assert _admin_pin_value(engine) == hash_pin("0000")
    assert observer["commits"] == 1


def test_integrity_repair_dry_run_does_not_create_missing_admin_pin(
    integrity_request_db,
):
    request_client, engine, observer = integrity_request_db
    with engine.begin() as connection:
        connection.execute(
            text("DELETE FROM system_settings WHERE setting_key = 'admin_pin'")
        )
    before = _inventory_rows(engine)

    response = request_client.post(
        "/api/settings/integrity/repair",
        json={"pin": "0000", "dry_run": True},
    )

    assert response.status_code == 200, response.text
    assert _inventory_rows(engine) == before
    assert _audit_rows(engine) == []
    assert _admin_pin_count(engine) == 0
    assert observer["flushes"] == 0
    assert observer["commits"] == 0


def test_integrity_repair_creates_missing_admin_pin_in_the_single_final_commit(
    integrity_request_db,
):
    request_client, engine, observer = integrity_request_db
    with engine.begin() as connection:
        connection.execute(
            text("DELETE FROM system_settings WHERE setting_key = 'admin_pin'")
        )

    response = request_client.post(
        "/api/settings/integrity/repair",
        json={"pin": "0000", "dry_run": False},
    )

    assert response.status_code == 200, response.text
    assert all(recorded == expected for _, recorded, expected in _inventory_rows(engine))
    assert _audit_rows(engine) == [
        ("settings.integrity_repair", "settings", "inventory", "repaired 2 rows")
    ]
    assert _admin_pin_count(engine) == 1
    assert _admin_pin_value(engine) == hash_pin("0000")
    assert observer["commits"] == 1


@pytest.mark.parametrize("pin_state", ["legacy", "missing"])
@pytest.mark.parametrize("failure", ["audit_record", "final_commit"])
def test_integrity_repair_failure_rolls_back_pending_admin_pin_change(
    integrity_request_db,
    monkeypatch,
    pin_state,
    failure,
):
    from app.routers import settings

    request_client, engine, observer = integrity_request_db
    with engine.begin() as connection:
        if pin_state == "legacy":
            connection.execute(
                text(
                    "UPDATE system_settings SET setting_value = '0000' "
                    "WHERE setting_key = 'admin_pin'"
                )
            )
        else:
            connection.execute(
                text("DELETE FROM system_settings WHERE setting_key = 'admin_pin'")
            )
    before_inventory = _inventory_rows(engine)
    before_pin_count = _admin_pin_count(engine)
    before_pin_value = _admin_pin_value(engine) if before_pin_count else None
    observer["failure"] = failure
    if failure == "audit_record":

        def fail_audit_record(*_args, **_kwargs):
            observer["faults"].append("audit_record")
            raise RuntimeError("injected audit.record failure")

        monkeypatch.setattr(settings.audit, "record", fail_audit_record)

    response = request_client.post(
        "/api/settings/integrity/repair",
        json={"pin": "0000", "dry_run": False},
    )

    assert response.status_code == 500
    assert observer["faults"] == [failure]
    assert observer["rollbacks"] == 1
    assert _inventory_rows(engine) == before_inventory
    assert _audit_rows(engine) == []
    assert _admin_pin_count(engine) == before_pin_count
    if before_pin_value is not None:
        assert _admin_pin_value(engine) == before_pin_value


@pytest.mark.parametrize(
    "failure",
    ["inventory_flush", "audit_record", "audit_flush", "final_commit"],
)
def test_integrity_repair_failures_rollback_inventory_and_audit(
    integrity_request_db, monkeypatch, failure
):
    from app.routers import settings

    request_client, engine, observer = integrity_request_db
    before = _inventory_rows(engine)
    observer["failure"] = failure
    if failure == "audit_record":

        def fail_audit_record(*_args, **_kwargs):
            observer["faults"].append("audit_record")
            raise RuntimeError("injected audit.record failure")

        monkeypatch.setattr(settings.audit, "record", fail_audit_record)

    response = request_client.post(
        "/api/settings/integrity/repair",
        json={"pin": "0000", "dry_run": False},
    )

    assert response.status_code == 500
    assert observer["faults"] == [failure]
    assert observer["rollbacks"] == 1
    assert _inventory_rows(engine) == before
    assert _audit_rows(engine) == []
