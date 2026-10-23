"""Worker migration adds nullable metadata while preserving historical requests."""
import sqlite3
import io
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
import sqlalchemy as sa

from app.models import Base


def test_workers_migration_nullable_without_backfill(tmp_path: Path) -> None:
    backend = Path(__file__).resolve().parents[2]
    path = tmp_path / "shipping-workers.db"
    config = Config(str(backend / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    command.upgrade(config, "20261021_0048")
    with sqlite3.connect(path) as db:
        db.execute("INSERT INTO process_types (code,prefix,suffix,stage_order) VALUES ('PF','P','F',80)")
        db.execute("INSERT INTO items (item_id,item_name,unit,model_symbol,process_type_code,serial_no,sales_review_required) VALUES ('pf','PF','EA','4','PF',1,FALSE)")
        db.execute("INSERT INTO shipping_requests (request_id,status,base_pf_item_id,request_quantity,requested_by_name) VALUES ('req','PREPARING','pf',1,'Historical Requester')")
        db.execute("INSERT INTO shipping_request_events (event_id,request_id,event_type) VALUES ('evt','req','REQUEST_CREATED')")
        db.commit()
    command.upgrade(config, "head")
    assert ScriptDirectory.from_config(config).get_current_head() == "20261023_0050"
    with sqlite3.connect(path) as db:
        column = next(row for row in db.execute("PRAGMA table_info(shipping_requests)") if row[1] == "worker_names")
        assert column[2] == "VARCHAR(200)" and column[3] == 0 and column[4] is None
        assert db.execute("SELECT worker_names,requested_by_name FROM shipping_requests").fetchone() == (None, "Historical Requester")
        assert db.execute("SELECT request_id FROM shipping_request_events").fetchall() == [("req",)]
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []


def test_workers_migration_accepts_metadata_first_schema(tmp_path: Path) -> None:
    backend = Path(__file__).resolve().parents[2]
    path = tmp_path / "metadata-workers.db"
    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    Base.metadata.create_all(engine)
    engine.dispose()
    config = Config(str(backend / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    command.stamp(config, "20261021_0048")
    command.upgrade(config, "head")


def test_workers_migration_emits_portable_add_column() -> None:
    backend = Path(__file__).resolve().parents[2]
    output = io.StringIO()
    config = Config(str(backend / "alembic.ini"), output_buffer=output)
    config.set_main_option("sqlalchemy.url", "postgresql://localhost/unused")
    command.upgrade(config, "20261023_0049:20261023_0050", sql=True)
    assert "ALTER TABLE shipping_requests ADD COLUMN worker_names VARCHAR(200)" in output.getvalue()
