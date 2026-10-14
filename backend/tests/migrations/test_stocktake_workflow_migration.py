"""Real disposable schema tests for immutable count and command evidence."""
from pathlib import Path
import uuid

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models


@pytest.fixture(scope="module")
def migrated_engine(tmp_path_factory):
    path = tmp_path_factory.mktemp("stocktake-workflow") / "evidence.db"
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    command.upgrade(config, "head")
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    with Session(engine) as db:
        actor = models.Employee(employee_id=uuid.uuid4(), employee_code="MIG-COUNT", name="Counter", role="admin")
        round_ = models.StocktakeRound(round_id=uuid.uuid4(), title="Test", epoch=1, started_by=actor.employee_id)
        db.add(actor)
        db.flush()
        db.add(round_)
        db.flush()
        db.add(models.StocktakeEvent(round_id=round_.round_id, kind="TEST", actor_id=actor.employee_id, actor_name=actor.name, payload={"version": 1}))
        db.add(models.StocktakeReceipt(actor_id=actor.employee_id, command_kind="test", idempotency_key="receipt", request_hash="a" * 64, response={"ok": True}))
        db.commit()
    yield engine
    engine.dispose()


@pytest.mark.parametrize("statement", [
    "UPDATE stocktake_events SET payload='{}'", "DELETE FROM stocktake_events",
    "UPDATE stocktake_receipts SET response='{}'", "DELETE FROM stocktake_receipts",
])
def test_completed_evidence_is_immutable(migrated_engine, statement):
    with migrated_engine.begin() as connection:
        with pytest.raises(IntegrityError, match="immutable"):
            connection.execute(text(statement))


def test_workflow_migration_preserves_inactive_control_and_has_all_triggers(migrated_engine):
    with migrated_engine.connect() as connection:
        assert connection.execute(text("SELECT inventory_mode, active_round_id, epoch FROM stocktake_control")).one() == ("LEGACY", None, 0)
        assert connection.execute(text("PRAGMA foreign_key_check")).fetchall() == []
        triggers = set(connection.execute(text("SELECT tbl_name FROM sqlite_master WHERE type='trigger'" )).scalars())
        assert {"stocktake_previews", "stocktake_events", "stocktake_receipts", "stocktake_application_lines", "stocktake_effect_epochs", "stocktake_counts", "stocktake_targets"} <= triggers


def test_not_applied_receipt_is_immutable_without_another_migration(migrated_engine):
    from app.services import stocktake_resolution

    key = str(uuid.uuid4())
    with Session(migrated_engine) as db:
        actor = db.query(models.Employee).filter_by(employee_code="MIG-COUNT").one()
        actor.department_role = "primary"
        db.commit()
        result = stocktake_resolution.resolve(db, actor, "round_start_preview", key, {"title": "Recovery"}, "Closed tab")
        assert result["resolution"] == "NOT_APPLIED"
        stored = db.get(models.StocktakeReceipt, uuid.UUID(result["receipt_id"]))
        assert stored.response["reason"] == "Closed tab" and stored.completed_at is not None
    for sql in ["UPDATE stocktake_receipts SET response='{}' WHERE idempotency_key=:key",
                "DELETE FROM stocktake_receipts WHERE idempotency_key=:key"]:
        with migrated_engine.begin() as connection:
            with pytest.raises(IntegrityError, match="immutable"):
                connection.execute(text(sql), {"key": key})
