"""Give native PostgreSQL migrations a disposable schema across commit boundaries."""
from __future__ import annotations

from collections.abc import Iterator
import os
import uuid

import pytest
import sqlalchemy as sa


@pytest.fixture
def postgres_migration_schema_connection() -> Iterator[tuple[sa.Connection, str]]:
    """Allow Alembic enum commits; drop only this fixture's unchanged schema OID."""
    url = sa.engine.make_url(os.environ["TEST_POSTGRES_URL"])
    assert url.get_backend_name() == "postgresql"
    assert url.host in {"localhost", "127.0.0.1"}
    assert url.database and url.database.endswith("_test")
    assert os.environ.get("DEXCOWIN_POSTGRES_TEST_ACK") == "ALLOW_TEST_DB_MUTATION"
    engine = sa.create_engine(url)
    schema = "mes_pg_migration_" + uuid.uuid4().hex
    schema_oid: int | None = None
    try:
        with engine.begin() as connection:
            assert connection.scalar(sa.text("SELECT current_database()")) == url.database
            connection.execute(sa.text(f'CREATE SCHEMA "{schema}"'))
            schema_oid = connection.scalar(sa.text(
                "SELECT oid FROM pg_namespace WHERE nspname = :schema"
            ), {"schema": schema})
            assert schema_oid is not None
        with engine.connect() as connection:
            connection.execute(sa.text(f'SET search_path TO "{schema}"'))
            connection.commit()
            try:
                yield connection, schema
            finally:
                connection.rollback()
    finally:
        try:
            if schema_oid is not None:
                with engine.begin() as connection:
                    actual_oid = connection.scalar(sa.text(
                        "SELECT oid FROM pg_namespace WHERE nspname = :schema"
                    ), {"schema": schema})
                    assert actual_oid == schema_oid, "Private schema identity changed; refusing cleanup"
                    connection.execute(sa.text(f'DROP SCHEMA "{schema}" CASCADE'))
                    assert connection.scalar(sa.text(
                        "SELECT oid FROM pg_namespace WHERE nspname = :schema"
                    ), {"schema": schema}) is None
        finally:
            engine.dispose()
