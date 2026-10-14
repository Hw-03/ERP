"""Real migrated storage permits decisions once and protects their evidence forever."""
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models
from tests.services.test_business_corrections import shipping_source, requested, approval_preview, approve


@pytest.fixture(scope="module")
def correction_engine(tmp_path_factory):
    path = tmp_path_factory.mktemp("business-correction") / "migrated.db"
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    command.upgrade(config, "head")
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    with Session(engine) as db:
        db.delete(db.get(models.StocktakeControl, 1))
        db.add(models.ProcessType(code="TR", prefix="T", suffix="R", stage_order=10))
        db.commit()

        def make_item(*, name, warehouse_qty):
            item = models.Item(item_name=name, unit="EA", model_symbol="9", process_type_code="TR", serial_no=1)
            db.add(item)
            db.flush()
            db.add(models.Inventory(item_id=item.item_id, quantity=warehouse_qty, warehouse_qty=warehouse_qty))
            db.flush()
            return item

        env, request, allocation, source, log = shipping_source(db, make_item)
        correction = requested(db, env, source)
        result = approve(db, env[1], correction, approval_preview(db, env[1], correction))
        assert result["status"] == "APPLIED" and not log.cancelled
        assert request.status == models.ShippingRequestStatusEnum.PREPARING
        assert allocation.status == "RELEASED"
        assert db.execute(text("PRAGMA foreign_key_check")).fetchall() == []
    yield engine
    engine.dispose()


@pytest.mark.parametrize("statement", [
    "UPDATE business_corrections SET status='REQUESTED'",
    "UPDATE business_corrections SET reason='changed'",
    "DELETE FROM business_corrections",
    "UPDATE business_correction_events SET payload='{}'",
    "DELETE FROM business_correction_events",
    "UPDATE business_correction_sources SET source_kind='workflow_effect'",
    "DELETE FROM business_correction_sources",
    "UPDATE business_correction_effect_links SET correction_effect_id=source_effect_id",
    "DELETE FROM business_correction_effect_links",
    "UPDATE stocktake_reservation_epochs SET observation_epoch=99",
    "DELETE FROM stocktake_reservation_epochs",
])
def test_decisions_and_lineage_are_immutable(correction_engine, statement):
    with correction_engine.begin() as connection:
        with pytest.raises(IntegrityError, match="immutable"):
            connection.execute(text(statement))
