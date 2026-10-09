"""공급업체 범위 마이그레이션은 FK와 이력 행을 보존한다."""
import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy import create_engine


def test_scope_migration_preserves_referenced_supplier(tmp_path):
    path = tmp_path / "supplier-scope.db"
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    command.upgrade(config, "20261007_0040")
    with sqlite3.connect(path) as db:
        db.execute("INSERT INTO suppliers(supplier_id,name,normalized_name) VALUES ('existing','Acme','acme')")
        db.execute("CREATE TABLE scope_history (id NUMERIC PRIMARY KEY, supplier_id NUMERIC REFERENCES suppliers(supplier_id) ON DELETE RESTRICT, snapshot TEXT)")
        db.execute("INSERT INTO scope_history VALUES ('history','existing','original')")

    def enable_fk(connection, record):
        connection.execute("PRAGMA foreign_keys=ON")

    event.listen(Engine, "connect", enable_fk)
    try:
        command.upgrade(config, "20261008_0041")
    finally:
        event.remove(Engine, "connect", enable_fk)
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT supplier_id,scope FROM suppliers").fetchall() == [("existing", "warehouse")]
        assert db.execute("SELECT * FROM scope_history").fetchall() == [("history", "existing", "original")]
        db.execute("INSERT INTO suppliers(supplier_id,name,normalized_name,scope) VALUES ('tube','Acme','acme','tube')")
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
        try:
            db.execute("INSERT INTO suppliers(supplier_id,name,normalized_name,scope) VALUES ('duplicate','Acme','acme','tube')")
        except sqlite3.IntegrityError:
            pass
        else:
            raise AssertionError("scope-local duplicate accepted")


def test_scope_upgrade_supports_bootstrap_injected_transaction(tmp_path):
    path = tmp_path / "bootstrap-supplier-scope.db"
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    command.upgrade(config, "20261007_0040")
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    try:
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "20261008_0041")
            assert connection.exec_driver_sql("SELECT scope FROM suppliers").fetchall() == []
    finally:
        engine.dispose()


def test_ensure_schema_upgrades_supplier_scope(tmp_path):
    from bootstrap.schema import ensure_schema
    path = tmp_path / "ensure-supplier-scope.db"
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    command.upgrade(config, "20261007_0040")
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    try:
        assert ensure_schema(engine=engine).revision == "20261008_0044"
    finally:
        engine.dispose()
