from __future__ import annotations

import importlib.util

import sqlalchemy as sa

import bootstrap.legacy_profiles as legacy_profiles


def test_legacy_profile_module_is_available():
    assert importlib.util.find_spec("bootstrap.legacy_profiles") is not None


def test_legacy_profile_module_exposes_fingerprint_contract():
    assert callable(getattr(legacy_profiles, "sqlite_schema_fingerprint", None))
    assert callable(getattr(legacy_profiles, "sqlite_business_data_fingerprint", None))
    assert callable(getattr(legacy_profiles, "find_sqlite_legacy_profile", None))
    assert getattr(legacy_profiles, "LEGACY_SQLITE_PROFILES", None) is not None


def test_reviewed_legacy_profile_fingerprints_are_exact():
    profiles = legacy_profiles.LEGACY_SQLITE_PROFILES

    assert set(profiles) == {
        "6b928be4909dedb8710baace333a3c322ca13be61cbf678ad007aa7cbab56839",
        "336f8abcaaea28b7b99bb56afe911728854696c1b208ac9d3a289e77110eae76",
    }
    assert {profile.profile_id for profile in profiles.values()} == {
        "dev_legacy_20260720",
        "employee_legacy_20260720",
    }


def test_schema_fingerprint_excludes_alembic_infrastructure_and_detects_ddl():
    engine = sa.create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql("CREATE TABLE business_rows (id INTEGER PRIMARY KEY)")
            initial = legacy_profiles.sqlite_schema_fingerprint(connection)
            connection.exec_driver_sql(
                "CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"
            )
            connection.exec_driver_sql(
                "CREATE TABLE alembic_schema_state (id INTEGER PRIMARY KEY)"
            )
            assert legacy_profiles.sqlite_schema_fingerprint(connection) == initial

            connection.exec_driver_sql(
                "CREATE INDEX ix_business_rows_id ON business_rows (id)"
            )
            assert legacy_profiles.sqlite_schema_fingerprint(connection) != initial
    finally:
        engine.dispose()


def test_business_trigger_named_like_alembic_infrastructure_is_fingerprinted():
    engine = sa.create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql(
                "CREATE TABLE business_rows (id INTEGER PRIMARY KEY)"
            )
            initial = legacy_profiles.sqlite_schema_fingerprint(connection)
            connection.exec_driver_sql(
                "CREATE TRIGGER alembic_version AFTER INSERT ON business_rows "
                "BEGIN SELECT 1; END"
            )

            assert legacy_profiles.sqlite_schema_fingerprint(connection) != initial
    finally:
        engine.dispose()


def test_business_data_fingerprint_is_order_independent_and_excludes_state_rows():
    engines = [sa.create_engine("sqlite://"), sa.create_engine("sqlite://")]
    try:
        fingerprints: list[str] = []
        for engine, rows in zip(engines, [[(1, "a"), (2, "b")], [(2, "b"), (1, "a")]]):
            with engine.begin() as connection:
                connection.exec_driver_sql(
                    "CREATE TABLE business_rows (id INTEGER PRIMARY KEY, value TEXT)"
                )
                connection.exec_driver_sql(
                    "CREATE TABLE alembic_schema_state (id INTEGER PRIMARY KEY, value TEXT)"
                )
                for row in rows:
                    connection.exec_driver_sql(
                        "INSERT INTO business_rows (id, value) VALUES (?, ?)", row
                    )
                fingerprints.append(
                    legacy_profiles.sqlite_business_data_fingerprint(connection)
                )

        assert fingerprints[0] == fingerprints[1]

        with engines[0].begin() as connection:
            before = legacy_profiles.sqlite_business_data_fingerprint(connection)
            connection.exec_driver_sql(
                "INSERT INTO alembic_schema_state (id, value) VALUES (1, 'ignored')"
            )
            assert legacy_profiles.sqlite_business_data_fingerprint(connection) == before
            connection.exec_driver_sql(
                "UPDATE business_rows SET value='changed' WHERE id=2"
            )
            assert legacy_profiles.sqlite_business_data_fingerprint(connection) != before
    finally:
        for engine in engines:
            engine.dispose()


def test_only_an_exact_reviewed_sqlite_schema_matches(
    monkeypatch,
):
    engine = sa.create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql("CREATE TABLE legacy_rows (id INTEGER PRIMARY KEY)")
            fingerprint = legacy_profiles.sqlite_schema_fingerprint(connection)
            profile = legacy_profiles.LegacySQLiteProfile(
                profile_id="test_legacy",
                schema_fingerprint=fingerprint,
            )
            monkeypatch.setattr(
                legacy_profiles,
                "LEGACY_SQLITE_PROFILES",
                {fingerprint: profile},
            )

            assert legacy_profiles.find_sqlite_legacy_profile(connection) == profile

            connection.exec_driver_sql(
                "CREATE INDEX ix_legacy_rows_id ON legacy_rows (id)"
            )
            assert legacy_profiles.find_sqlite_legacy_profile(connection) is None
    finally:
        engine.dispose()


def test_postgresql_never_matches_a_sqlite_legacy_profile():
    class PostgreSQLDialect:
        name = "postgresql"

    class PostgreSQLConnection:
        dialect = PostgreSQLDialect()

    assert (
        legacy_profiles.find_sqlite_legacy_profile(PostgreSQLConnection()) is None  # type: ignore[arg-type]
    )
