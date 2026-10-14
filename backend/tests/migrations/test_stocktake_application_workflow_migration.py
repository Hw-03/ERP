"""A migrated disposable database accepts a complete count and recount cycle."""

from pathlib import Path
import uuid

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app import models
from app.services import inventory_operations, stocktake


def _execute(db, actor, kind, payload):
    return stocktake.execute(db, actor, kind, str(uuid.uuid4()), payload)


def _confirmed(db, actor, target, round_):
    started = _execute(db, actor, "count_start", {
        "target_id": target["target_id"], "expected_target_version": target["version"],
        "round_epoch": round_["epoch"],
    })
    saved = _execute(db, actor, "count_save", {
        "count_id": started["count_id"], "expected_version": started["version"],
        "fence": started["fence"],
        "quantities": {"normal": 10, "defect": 0, "b_grade": 0, "obsolete": 0},
    })
    return _execute(db, actor, "count_confirm", {
        "count_id": saved["count_id"], "expected_version": saved["version"],
        "fence": saved["fence"],
    })


def test_migrated_database_applies_then_recounts_same_cell(tmp_path):
    path = tmp_path / "count-apply-recount.db"
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    command.upgrade(config, "head")
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    try:
        with Session(engine) as db:
            db.add(models.ProcessType(code="TR", prefix="T", suffix="R", stage_order=10))
            actor = models.Employee(employee_code="MIG-APPLY", name="Counter", role="admin", department_role="primary")
            item = models.Item(item_name="Migrated count", unit="EA", model_symbol="9",
                               process_type_code="TR", serial_no=1)
            db.add_all([actor, item])
            db.flush()
            db.add(models.Inventory(item_id=item.item_id, quantity=10, warehouse_qty=10))
            db.add(models.InventoryScope(scope_key="warehouse", physical_department="창고"))
            db.add(models.InventoryScope(scope_key="tube", physical_department="튜브"))
            db.add(models.SystemSetting(setting_key="inventory_operation_cutover_at",
                                        setting_value="2000-01-01T00:00:00"))
            db.get(models.StocktakeControl, 1).inventory_mode = "POOL"
            db.commit()
            operation = inventory_operations.create_business_operation(
                db, domain="pool", action="cutover", display_label="Fixture",
                actor_name=actor.name, actor_employee_id=actor.employee_id,
            )
            db.add(models.DefectPoolCutover(actor_employee_id=actor.employee_id,
                operation_id=operation.operation_id, source_fingerprint="f" * 64,
                cutover_version=1))
            db.commit()

            proposal = _execute(db, actor, "round_start_preview", {"title": "Migrated cycle"})
            round_ = _execute(db, actor, "round_start", {
                "preview_id": proposal["preview_id"], "preview_hash": proposal["preview_hash"],
            })
            target = next(row for row in stocktake.list_targets(db, uuid.UUID(round_["round_id"]))["items"]
                          if row["item_id"] == str(item.item_id) and row["scope_id"] == "warehouse")
            first = _confirmed(db, actor, target, round_)
            application_preview = _execute(db, actor, "application_preview", {
                "round_id": round_["round_id"],
                "confirmation_revision_ids": [first["confirmation_revision_id"]],
            })
            result = _execute(db, actor, "application_apply", {
                "round_id": round_["round_id"],
                "preview_id": application_preview["preview_id"],
                "preview_hash": application_preview["preview_hash"],
            })
            current_target = db.get(models.StocktakeTarget, uuid.UUID(target["target_id"]))
            second = _confirmed(db, actor, {**target, "version": current_target.version}, round_)
            assert second["status"] == "CONFIRMED"
            assert second["count_id"] != first["count_id"]
            assert db.query(models.StocktakeApplicationLine).one().observation_epoch_after == 1
            assert db.get(models.StocktakeGate, (item.item_id, "warehouse")).observation_epoch == 1
            assert db.query(models.TransactionLog).count() == 0
            assert result["confirmation_revision_ids"] == [first["confirmation_revision_id"]]
            assert db.execute(text("PRAGMA foreign_key_check")).fetchall() == []
    finally:
        engine.dispose()
