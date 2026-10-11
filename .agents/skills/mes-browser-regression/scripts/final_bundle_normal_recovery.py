"""새 manifest와 새 QA 사본으로 실제 정상 설치·마이그레이션·복구만 실행한다."""
from __future__ import annotations

import argparse
from contextlib import closing
from pathlib import Path
import sqlite3
import uuid

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
import sqlalchemy as sa

from recovery_readiness_probe import ROOT, bounded_readiness, harness

release, recovery, preflight = harness.release, harness.recovery, harness.preflight
REVISION = "20261008_0044"
OLD_REVISION = "20260928_0038"


def private_path(path: Path, root: Path) -> Path:
    """링크를 거절하고 이 작업본의 허용한 격리 영역 안으로 제한한다."""
    physical = release._physical(path).resolve()
    if not physical.is_relative_to(release._physical(root).resolve()):
        raise release.ReleaseError("Path outside private rehearsal root")
    return physical


def load_manifest(path: Path, expected_sha256: str, root: Path) -> dict:
    """명시한 manifest 바이트와 최종 0044 계약을 변경 없이 확인한다."""
    path = private_path(path, root)
    if recovery._sha(path) != expected_sha256:
        raise release.ReleaseError("Manifest hash changed")
    manifest = recovery._load(path)
    if (manifest.get("status") != "PRODUCTION_READY" or manifest.get("final_frozen_candidate") is not True
            or manifest.get("target_revision") != REVISION):
        raise release.ReleaseError("Final frozen 0044 manifest required")
    return manifest


def reserve_fixture(sandbox: Path, root: Path) -> Path:
    """이전 실패 자료를 재사용하거나 덮어쓰지 않는 새 폴더만 예약한다."""
    sandbox = private_path(sandbox, root)
    if sandbox.exists():
        raise release.ReleaseError("Fresh fixture required")
    sandbox.mkdir(parents=True)
    return sandbox / "employee"


def validate_qa(path: Path, operational: dict) -> None:
    """운영 산출물과 QA 주소 빌드를 구분하고 소스·Node·실제 파일을 결합한다."""
    receipt = recovery._load(path / "qa-receipt.json")
    if (receipt.get("status") != "QA_ONLY" or receipt.get("source") != operational["source"]
            or receipt.get("toolchain") != operational["toolchain"]
            or receipt.get("environment") != {**release.BUILD_ENV, "BACKEND_INTERNAL_URL": "http://127.0.0.1:8042"}
            or receipt.get("artifacts") != release.files(path / "frontend")):
        raise release.ReleaseError("QA artifact/source/toolchain/environment changed")


def validate_inputs(manifest: dict) -> tuple[dict, dict, dict, Path]:
    """복사 전에 모든 소스·빌드와 명시한 구 DB를 독립적으로 검증한다."""
    sources = {key: private_path(Path(manifest["snapshots"][key]), harness.OUTPUT_ROOT) for key in ("old", "new")}
    prepared = {key: private_path(Path(manifest["prepared"][key]), harness.OUTPUT_ROOT) for key in ("old", "new")}
    qa = {key: private_path(Path(manifest["qa_prepared"][key]), harness.OUTPUT_ROOT) for key in ("old", "new")}
    node = release._physical(Path(manifest["node"]))
    harness.assert_node_selection(ROOT / "_attic/runtime/frontend-node-path.txt", manifest["node_selection"])
    if node.resolve() != Path(manifest["node_selection"]["path"]).resolve():
        raise release.ReleaseError("Node differs from selected toolchain")
    old_node = private_path(Path(manifest["old_node"]), harness.OUTPUT_ROOT)
    old = recovery._load(prepared["old"] / "receipt.json")
    if old.get("status") == "CAPTURED_OPERATIONAL":
        if (old["source"] != release.files(sources["old"] / "frontend", source=True)
                or old["toolchain"] != release._toolchain(old_node)
                or old["artifacts"] != release.files(prepared["old"] / "frontend")):
            raise release.ReleaseError("Captured old operational bundle changed")
    else:
        old = release.verify(prepared["old"], sources["old"] / "frontend", old_node)
    new = release.verify(prepared["new"], sources["new"] / "frontend", node)
    old_code = release._code_files(sources["old"])
    if old_code != recovery._load(ROOT / "_attic/runtime/employee-baseline/old-code-manifest.json"):
        raise release.ReleaseError("Old code differs from preserved baseline")
    harness.assert_frozen_source(ROOT, release._code_files(sources["new"]), new["source"])
    for key, receipt in (("old", old), ("new", new)):
        validate_qa(qa[key], receipt)
    baseline = private_path(Path(manifest["baseline"]["path"]), ROOT / "_attic/runtime/employee-baseline")
    if recovery._sha(baseline) != manifest["baseline"]["sha256"]:
        raise release.ReleaseError("Baseline DB changed")
    companion = recovery.backup_manifest.manifest_path_for(baseline)
    if recovery._sha(companion) != manifest["baseline"]["manifest_sha256"]:
        raise release.ReleaseError("Baseline DB manifest changed")
    verified = recovery.backup_manifest.verify_manifest_receipt(baseline, expected_engine="sqlite")
    if verified.status not in {recovery.backup_manifest.BackupStatus.PASS, recovery.backup_manifest.BackupStatus.STRUCTURAL_ONLY}:
        raise release.ReleaseError(f"Baseline DB receipt rejected: {verified.errors}")
    with closing(sqlite3.connect(f"file:{baseline.as_posix()}?mode=ro", uri=True)) as connection:
        if connection.execute("SELECT version_num FROM alembic_version").fetchone()[0] != OLD_REVISION:
            raise release.ReleaseError("Old database revision changed")
    return sources, prepared, {"old": old, "new": new}, baseline


def run(manifest_path: Path, manifest_sha256: str) -> Path:
    """보호 경로를 건드리지 않고 실제 설치/복구 함수와 소유 lifecycle을 실행한다."""
    manifest = load_manifest(manifest_path, manifest_sha256, harness.OUTPUT_ROOT)
    sources, prepared, receipts, baseline = validate_inputs(manifest)
    executor_sha = recovery._sha(Path(__file__))
    employee = reserve_fixture(harness.FIXTURE_ROOT / ("n-" + uuid.uuid4().hex[:8]), harness.FIXTURE_ROOT)
    sandbox = employee.parent
    lifecycle = harness.IsolatedLifecycle(employee)
    lifecycle.assert_stopped(employee)
    old_code = release._code_files(sources["old"])
    for area in ("backend", "scripts"):
        release._copy_files(sources["old"] / area, employee / area, old_code[area])
    release._copy_files(sources["old"], employee, old_code["root"])
    release._copy_files(prepared["old"] / "frontend", employee / "frontend", receipts["old"]["artifacts"])
    old_node = employee / "_attic/runtime/tools/old-node"
    release._copy_files(Path(manifest["old_node"]).parent, old_node, receipts["old"]["toolchain"]["files"])
    config_path = employee / "_attic/runtime/frontend-node-path.txt"
    config_path.write_text(str(old_node / "node.exe") + "\n", encoding="utf-8")
    backup = employee / "_attic/runtime/backups/sqlite/old.db"
    backup.parent.mkdir(parents=True)
    recovery.restore_db._copy_live_sqlite(baseline, backup)
    original_manifest = recovery._load(recovery.backup_manifest.manifest_path_for(baseline))
    release._json(recovery.backup_manifest.manifest_path_for(backup),
                  recovery.backup_manifest.build_structural_sqlite_manifest(
                      backup, published_name=backup.name, source_snapshot=original_manifest["source_snapshot"]))
    database = employee / "backend/mes.db"
    recovery.restore_db._copy_live_sqlite(backup, database)
    before, old_selection = recovery._state(employee), release._previous_node(employee)
    removed = {"employees": frozenset({"level"})}
    rows = preflight.snapshot_existing_rows(database, removed_columns=removed)
    release._json(sandbox / "input.json", {"manifest": str(manifest_path), "sha256": manifest_sha256,
                                          "executor_sha256": executor_sha, "before": before})
    qa = {key: Path(value) / "frontend" for key, value in manifest["qa_prepared"].items()}
    original_stop, original_assert = recovery._stop_services, recovery._assert_stopped
    try:
        with bounded_readiness():
            lifecycle.start_and_query(qa["old"], old_node / "node.exe", OLD_REVISION)
            load_manifest(manifest_path, manifest_sha256, harness.OUTPUT_ROOT)
            record = release.install(prepared["new"], sources["new"] / "frontend", Path(manifest["node"]), employee)
            code_record = release.snapshot_code(sources["new"], sandbox / "manifests")
            release.install_code(sources["new"], record, employee, code_record)
            admission = recovery.begin(record, employee, backup)
            config = Config(str(employee / "backend/alembic.ini"))
            config.set_main_option("script_location", str(employee / "backend/alembic"))
            if ScriptDirectory.from_config(config).get_current_head() != REVISION:
                raise release.ReleaseError("Installed migration head changed")
            engine = sa.create_engine(f"sqlite:///{database.as_posix()}")
            try:
                with engine.connect() as connection:
                    connection.exec_driver_sql("PRAGMA foreign_keys=ON")
                    connection.commit()
                    config.attributes["connection"] = connection
                    with harness.managed_migration(connection, REVISION):
                        for revision in (*harness.REVISIONS, REVISION):
                            command.upgrade(config, revision)
                            connection.commit()
                            preflight.assert_existing_rows_unchanged(database, rows, frozenset(), removed_columns=removed)
                            with closing(sqlite3.connect(database)) as check:
                                if check.execute("PRAGMA foreign_key_check").fetchall():
                                    raise release.ReleaseError("Foreign keys changed during migration")
            finally:
                engine.dispose()
            with closing(sqlite3.connect(database)) as check:
                for table, column in (("shipping_requests", "submission_payload_hash"),
                                      ("departments", "display_name"), ("transaction_logs", "item_snapshot")):
                    if check.execute(f'SELECT count(*) FROM "{table}" WHERE "{column}" IS NOT NULL').fetchone()[0]:
                        raise release.ReleaseError("Unexpected nullable-field backfill")
            selected_node = Path(config_path.read_text(encoding="utf-8").strip())
            lifecycle.start_and_query(qa["new"], selected_node, REVISION, keep_running=True)
            recovery._stop_services, recovery._assert_stopped = lifecycle.stop, lifecycle.assert_stopped
            recovery.recover(record, employee, recovery._sha(admission))
            if recovery._state(employee) != before or release._previous_node(employee) != old_selection:
                raise release.ReleaseError("Old bundle was not restored exactly")
            recovery.cutover.compare_exact_database(backup, database)
            lifecycle.start_and_query(qa["old"], old_node / "node.exe", OLD_REVISION)
            if recovery._state(employee) != before or release._previous_node(employee) != old_selection:
                raise release.ReleaseError("Restored startup changed the old bundle")
            validate_inputs(load_manifest(manifest_path, manifest_sha256, harness.OUTPUT_ROOT))
            if recovery._sha(Path(__file__)) != executor_sha:
                raise release.ReleaseError("Normal executor changed")
            result = sandbox / "normal-result.json"
            payload = {"status": "PASS", "mode": "normal-first-attempt", "resume": False,
                       "input_sha256": manifest_sha256, "executor_sha256": executor_sha,
                       "employee": str(employee), "revisions": [OLD_REVISION, REVISION, OLD_REVISION],
                       "recovery_receipt_sha256": recovery._sha(record.parent / "recovery.json"),
                       "old_database_code_frontend_node_exact": True, "migration_rows_preserved": True,
                       "nullable_backfill_absent": True, "lifecycle": lifecycle.events,
                       "production_services_or_tasks_changed": False}
    except BaseException as error:
        release._json(sandbox / "normal-failure.json", {"status": "FAIL", "error": str(error), "lifecycle": lifecycle.events})
        raise
    finally:
        recovery._stop_services, recovery._assert_stopped = original_stop, original_assert
        lifecycle.stop(employee)
    release._json(result, payload)
    return result


def main() -> None:
    """새 manifest의 명시한 해시 없이 실제 복구를 시작하지 않는다."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifacts", type=Path, required=True)
    parser.add_argument("--artifacts-sha256", required=True)
    args = parser.parse_args()
    print(run(args.artifacts, args.artifacts_sha256), flush=True)


if __name__ == "__main__":
    main()
