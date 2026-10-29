"""Adding private memo storage preserves every pre-existing business row."""

import io
import uuid
from datetime import date
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
import sqlalchemy as sa

from app.models import Base, DailyWorkReport, DataRevision, Employee
from bootstrap.schema import check_schema, ensure_schema


BACKEND = Path(__file__).resolve().parents[2]
PREVIOUS = "20261023_0050"
REVISION = "20261029_0051"


def _config(path: Path) -> Config:
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def _business_rows(connection: sa.Connection) -> dict[str, list]:
    return {name: connection.exec_driver_sql(f'SELECT * FROM "{name}"').all()
            for name in sa.inspect(connection).get_table_names()
            if name not in {"alembic_version", "alembic_schema_state", "personal_memos"}}


def test_adds_only_empty_memos_and_preserves_existing_data(tmp_path: Path) -> None:
    config = _config(tmp_path / "memo-upgrade.db")
    command.upgrade(config, PREVIOUS)
    engine = sa.create_engine(config.get_main_option("sqlalchemy.url"))
    try:
        with engine.begin() as connection:
            employee_id = uuid.uuid4()
            connection.execute(sa.insert(Employee), {"employee_id": employee_id, "employee_code": "STAFF", "name": "Existing", "role": "staff", "department": "Assembly", "is_active": True})
            connection.execute(sa.insert(DailyWorkReport), {"work_date": date(2026, 10, 1), "employee_id": employee_id, "employee_name": "Existing", "department": "Assembly", "content": "Keep historical report"})
            before = _business_rows(connection)
            tables = set(sa.inspect(connection).get_table_names())
        assert ScriptDirectory.from_config(config).get_current_head() == REVISION
        result = ensure_schema(engine=engine)
        assert result.revision == REVISION
        assert check_schema(engine=engine).ready
        with engine.connect() as connection:
            assert _business_rows(connection) == before
            assert set(sa.inspect(connection).get_table_names()) - tables == {"personal_memos"}
            assert connection.exec_driver_sql("SELECT COUNT(*) FROM personal_memos").scalar_one() == 0
            assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
            assert sa.inspect(connection).get_pk_constraint("personal_memos")["constrained_columns"] == ["employee_id"]
            assert {column["name"] for column in sa.inspect(connection).get_columns("personal_memos")} == {"employee_id", "content", "updated_at"}
    finally:
        engine.dispose()


def test_metadata_first_upgrade_accepts_complete_memo_table(tmp_path: Path) -> None:
    config = _config(tmp_path / "metadata.db")
    engine = sa.create_engine(config.get_main_option("sqlalchemy.url"))
    try:
        Base.metadata.create_all(engine)
        with engine.begin() as connection:
            connection.execute(sa.insert(DataRevision), {"id": 1, "revision": 19})
        command.stamp(config, PREVIOUS)
        ensure_schema(engine=engine)
        assert check_schema(engine=engine).ready
    finally:
        engine.dispose()


def test_postgres_ddl_is_schema_only_and_portable() -> None:
    output = io.StringIO()
    config = Config(str(BACKEND / "alembic.ini"), output_buffer=output)
    config.set_main_option("sqlalchemy.url", "postgresql://localhost/unused")
    command.upgrade(config, f"{PREVIOUS}:{REVISION}", sql=True)
    ddl = output.getvalue()
    assert "CREATE TABLE personal_memos" in ddl
    assert "FOREIGN KEY(employee_id) REFERENCES employees (employee_id)" in ddl
    migration = ScriptDirectory.from_config(config).get_revision(REVISION).module
    assert migration.EMPLOYEE_AUTO_DEPLOY_POLICY == {"kind": "schema-only"}
