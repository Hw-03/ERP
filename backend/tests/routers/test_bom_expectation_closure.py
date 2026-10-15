"""BOM completion must validate the full composition and retain its audit trail."""

from datetime import UTC, datetime
from decimal import Decimal

from app.models import AdminAuditLog
import pytest

ADMIN = {"X-Admin-Pin": "0000"}


def test_bom_whole_save_reports_all_errors_and_stale_version_without_partial_writes(
    client, db_session, make_item, make_bom,
):
    parent = make_item(name="원자 저장 부모", process_type_code="AA")
    first = make_item(name="첫 구성품", process_type_code="TR")
    second = make_item(name="다음 구성품", process_type_code="HR")
    deleted = make_item(name="삭제된 구성품", process_type_code="VR")
    deleted.deleted_at = datetime.now(UTC).replace(tzinfo=None)
    row = make_bom(parent.item_id, first.item_id, Decimal("2"))
    db_session.commit()
    endpoint = f"/api/bom/{parent.item_id}"
    baseline = client.get(endpoint).json()
    invalid = client.put(endpoint, headers=ADMIN, json={"expected_rows": baseline, "rows": [
        {"child_item_id": str(parent.item_id), "quantity": 1, "unit": "EA"},
        {"child_item_id": str(first.item_id), "quantity": 0, "unit": "EA"},
        {"child_item_id": str(first.item_id), "quantity": 0.5, "unit": "EA"},
        {"child_item_id": str(deleted.item_id), "quantity": 1, "unit": "EA"},
    ]})
    assert invalid.status_code == 422, invalid.text
    for message in ["자기 참조", "양의 정수", "중복", "삭제", "순환 참조"]:
        assert message in invalid.text
    assert client.get(endpoint).json() == baseline
    assert db_session.query(AdminAuditLog).count() == 0
    desired = [
        {"child_item_id": str(first.item_id), "quantity": 3, "unit": "EA"},
        {"child_item_id": str(second.item_id), "quantity": 4, "unit": "EA"},
    ]
    saved = client.put(endpoint, headers=ADMIN, json={"expected_rows": baseline, "rows": desired})
    assert saved.status_code == 200, saved.text
    assert {(entry["child_item_id"], entry["quantity"]) for entry in saved.json()} == {
        (str(first.item_id), 3), (str(second.item_id), 4),
    }
    assert next(entry for entry in saved.json() if entry["child_item_id"] == str(first.item_id))["bom_id"] == str(row.bom_id)
    logs = db_session.query(AdminAuditLog).all()
    assert len(logs) == 1
    assert logs[0].action == "bom.replace"
    assert '"before"' in logs[0].payload_summary and '"after"' in logs[0].payload_summary
    assert '"version"' in logs[0].payload_summary
    stale = client.put(endpoint, headers=ADMIN, json={"expected_rows": baseline, "rows": desired[:1]})
    assert stale.status_code == 409, stale.text
    assert "다른 작업" in stale.text
    assert client.get(endpoint).json() == saved.json()
    assert db_session.query(AdminAuditLog).count() == 1


def test_bom_whole_save_respects_pin_completion_and_rolls_back_audit_failure(
    client, db_session, make_item, make_bom, monkeypatch,
):
    from app.services import audit

    parent = make_item(name="원자 저장 보호", process_type_code="AA")
    child = make_item(name="기존 자식", process_type_code="TR")
    make_bom(parent.item_id, child.item_id, Decimal("2"))
    endpoint = f"/api/bom/{parent.item_id}"
    baseline = client.get(endpoint).json()
    payload = {"expected_rows": baseline, "rows": []}
    assert client.put(endpoint, json=payload).status_code == 400
    assert client.patch(f"/api/items/{parent.item_id}/bom-completion", headers=ADMIN, json={"completed": True}).status_code == 200
    assert client.put(endpoint, headers=ADMIN, json=payload).status_code == 409
    assert client.patch(f"/api/items/{parent.item_id}/bom-completion", headers=ADMIN, json={"completed": False}).status_code == 200
    before_audit = db_session.query(AdminAuditLog).count()

    def fail_audit(*args, **kwargs):
        raise RuntimeError("audit unavailable")

    monkeypatch.setattr(audit, "record", fail_audit)
    with pytest.raises(RuntimeError, match="audit unavailable"):
        client.put(endpoint, headers=ADMIN, json=payload)
    assert client.get(endpoint).json() == baseline
    assert db_session.query(AdminAuditLog).count() == before_audit


def test_concurrent_bom_whole_saves_accept_only_one_original_baseline(
    client, db_session, make_item, make_bom, tmp_path,
):
    """Two real SQLite connections must not both overwrite the same editor version."""
    import sqlite3
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from fastapi import HTTPException, Request
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.models import BOM
    from app.routers.bom import replace_bom_configuration
    from app.schemas.item import BOMConfigurationUpdate

    parent = make_item(name="동시 구성 부모", process_type_code="AA")
    child = make_item(name="동시 구성 자식", process_type_code="TR")
    make_bom(parent.item_id, child.item_id, Decimal("2"))
    parent_id, child_id = parent.item_id, child.item_id
    baseline = client.get(f"/api/bom/{parent_id}").json()
    database = tmp_path / "concurrent-bom.db"
    source = db_session.connection().connection.driver_connection
    with sqlite3.connect(database) as destination:
        destination.executescript("\n".join(source.iterdump()))
    engine = create_engine(f"sqlite:///{database}", connect_args={"timeout": 15})
    barrier = Barrier(2)

    def save(quantity: int) -> int:
        payload = BOMConfigurationUpdate.model_validate({"expected_rows": baseline,
            "rows": [{"child_item_id": str(child_id), "quantity": quantity, "unit": "EA"}]})
        with Session(engine) as session:
            barrier.wait(timeout=10)
            try:
                replace_bom_configuration(parent_id, payload, Request({"type": "http", "headers": []}), None, session)
                return 200
            except HTTPException as error:
                return error.status_code

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(save, [3, 4]))
        assert sorted(results) == [200, 409]
        with Session(engine) as session:
            assert session.query(BOM).filter_by(parent_item_id=parent_id).one().quantity in [3, 4]
            assert session.query(AdminAuditLog).filter_by(action="bom.replace").count() == 1
    finally:
        engine.dispose()


def test_bom_completion_rejects_empty_and_all_invalid_rows_without_writes(
    client, db_session, make_item, make_bom,
):
    parent = make_item(name="완료 검증 부모", process_type_code="AA")
    endpoint = f"/api/items/{parent.item_id}/bom-completion"
    empty = client.patch(endpoint, headers=ADMIN, json={"completed": True})
    assert empty.status_code == 422, empty.text
    assert "구성품" in empty.text
    child = make_item(name="수량 오류", process_type_code="TR")
    deleted = make_item(name="삭제 구성품", process_type_code="HR")
    deleted.deleted_at = datetime.now(UTC).replace(tzinfo=None)
    make_bom(parent.item_id, parent.item_id, Decimal("1"))
    make_bom(parent.item_id, child.item_id, Decimal("0.5"))
    make_bom(parent.item_id, deleted.item_id, Decimal("1"))
    make_bom(child.item_id, parent.item_id, Decimal("1"))
    db_session.commit()
    before = client.get(f"/api/bom/{parent.item_id}").json()
    audit_count = db_session.query(AdminAuditLog).count()
    invalid = client.patch(endpoint, headers=ADMIN, json={"completed": True})
    assert invalid.status_code == 422, invalid.text
    for message in ["자기 참조", "양의 정수", "삭제", "순환 참조"]:
        assert message in invalid.text
    db_session.refresh(parent)
    assert parent.bom_completed_at is None
    assert client.get(f"/api/bom/{parent.item_id}").json() == before
    assert db_session.query(AdminAuditLog).count() == audit_count


def test_bom_unlock_edit_recomplete_preserves_each_action_and_current_rows(
    client, db_session, make_item, make_bom,
):
    parent = make_item(name="잠금 이력 부모", process_type_code="AA")
    child = make_item(name="잠금 이력 자식", process_type_code="TR")
    row = make_bom(parent.item_id, child.item_id, Decimal("2"))
    endpoint = f"/api/items/{parent.item_id}/bom-completion"
    assert client.patch(endpoint, headers=ADMIN, json={"completed": True}).status_code == 200
    first = client.get(f"/api/items/{parent.item_id}").json()["bom_completed_at"]
    assert first
    assert client.patch(f"/api/bom/{row.bom_id}", headers=ADMIN, json={"quantity": 3}).status_code == 409
    assert client.patch(endpoint, headers=ADMIN, json={"completed": False}).status_code == 200
    assert client.patch(f"/api/bom/{row.bom_id}", headers=ADMIN, json={"quantity": 3}).status_code == 200
    assert client.patch(endpoint, headers=ADMIN, json={"completed": True}).status_code == 200
    logs = db_session.query(AdminAuditLog).order_by(AdminAuditLog.created_at).all()
    assert [log.action for log in logs] == [
        "item.bom_completion", "item.bom_completion", "bom.update", "item.bom_completion",
    ]
    assert [log.payload_summary for log in logs] == [
        "잠금 이력 부모: 완료", "잠금 이력 부모: 완료 해제", "qty 2→3", "잠금 이력 부모: 완료",
    ]
    assert all(log.request_id and log.created_at for log in logs)
    assert client.get(f"/api/bom/{parent.item_id}").json()[0]["quantity"] == 3
    assert client.get(f"/api/items/{parent.item_id}").json()["bom_completed_at"] >= first
