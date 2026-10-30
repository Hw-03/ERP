"""Exercise cache deletion in disposable trees, never the running environments."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time

import pytest

ROOT = Path(__file__).resolve().parents[3]
TOOL = ROOT / "scripts/ops/frontend_preparation_cache.py"
NOW = datetime(2026, 10, 13, 0, tzinfo=timezone.utc)


def module():
    assert TOOL.is_file(), "deployment cache retention is not implemented"
    spec = importlib.util.spec_from_file_location("frontend_preparation_cache", TOOL)
    result = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = result
    spec.loader.exec_module(result)
    return result


def write(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8")


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def release(root: Path, key: str, *, hours: int = 48) -> Path:
    path = root / (key * 64)
    content = {
        "package.json": '{"name":"fixture"}',
        "package-lock.json": "locked-" + key,
        "app/page.tsx": "source-" + key,
        "node_modules/next/package.json": "dependency-" + key,
        ".next-prod/BUILD_ID": "build-" + key,
        ".next-prod/server/page.js": "compiled-" + key,
        ".next/cache/item": "development-cache",
    }
    for name, value in content.items():
        write(path / "frontend" / name, value)
    source = {name: digest(value) for name, value in content.items()
              if not name.startswith(("node_modules/", ".next"))}
    write(path / "receipt.json", json.dumps({
        "status": "READY", "prepared_at": (NOW - timedelta(hours=hours)).isoformat(),
        "source": source, "artifacts": {name: digest(value) for name, value in content.items()},
    }))
    for name in ("install.log", "build.log", "bundle.log"):
        write(path / name, "historical verification " + key)
    return path


def fixture(tmp_path: Path):
    m = module()
    repo, employee = tmp_path / "repo", tmp_path / "employee"
    policy = m.CachePolicy(repo, employee, now=lambda: NOW)
    newest = release(policy.roots[0], "a")
    old = release(policy.roots[0], "b")
    receipt = json.loads((newest / "receipt.json").read_text())
    for name in receipt["artifacts"]:
        target = employee / "frontend" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((newest / "frontend" / name).read_bytes())
    record = employee / "_attic/runtime/frontend-releases" / ("1" * 32) / "journal.json"
    write(record, json.dumps({"employee_root": str(employee), "phase": "CONFIRMED",
                             "incoming_frontend": receipt["artifacts"]}))
    return m, policy, newest, old, record


def retained_bytes(path: Path) -> dict[str, bytes]:
    return {str(p): p.read_bytes() for p in path.rglob("*") if p.is_file()
            and not any(part in {"node_modules", ".next", ".next-prod", "frontend-cache-policy"} for part in p.parts)}


def test_failed_build_without_surviving_children_can_expire(tmp_path):
    m, policy, _, old, _ = fixture(tmp_path)
    with policy.operation():
        policy.pin(old)
        result = policy.run_command([sys.executable, "-c", "raise SystemExit(2)"],
                                    old / "frontend", os.environ.copy(), old / "failed.log")
    assert result == 2
    state = m.read_json(policy.preparation_path(old))
    assert not policy.child_busy(state)
    state["pid"] = 99999999
    state["expires_at"] = (NOW - timedelta(hours=1)).isoformat()
    policy.save_preparation(old, state)
    policy.cleanup(apply=True)
    assert not old.joinpath("frontend/node_modules").exists()


def test_detached_descendant_remains_protected_after_launcher_exits(tmp_path):
    m, policy, _, old, _ = fixture(tmp_path)
    script = "import subprocess,sys; subprocess.Popen([sys.executable,'-c','import time; time.sleep(5)'])"
    with policy.operation():
        policy.pin(old)
        assert policy.run_command([sys.executable, "-c", script], old / "frontend",
                                  os.environ.copy(), old / "descendant.log") == 0
    state = m.read_json(policy.preparation_path(old))
    assert policy.child_busy(state)


def test_killed_preparation_parent_does_not_release_surviving_child(tmp_path):
    m, policy, _, old, _ = fixture(tmp_path)
    ready = tmp_path / "child-ready"
    child_code = f"from pathlib import Path; import time; Path({str(ready)!r}).touch(); time.sleep(3)"
    parent_code = (
        "from pathlib import Path; import os,sys; "
        f"sys.path.insert(0,{str(TOOL.parent)!r}); "
        "from frontend_preparation_cache import CachePolicy; "
        f"p=CachePolicy(Path({str(policy.repo)!r}),Path({str(policy.employee)!r})); "
        f"r=Path({str(old)!r}); "
        "\nwith p.operation():\n p.pin(r)\n "
        f"p.run_command([sys.executable,'-c',{child_code!r}],r/'frontend',os.environ.copy(),r/'child.log')"
    )
    with subprocess.Popen([sys.executable, "-c", parent_code]) as parent:
        deadline = time.monotonic() + 10
        while not ready.exists() and time.monotonic() < deadline:
            time.sleep(0.02)
        assert ready.exists()
        parent.terminate()
        parent.wait(timeout=5)
    state = m.read_json(policy.preparation_path(old))
    state["expires_at"] = (NOW - timedelta(hours=1)).isoformat()
    policy.save_preparation(old, state)
    assert not m.alive(state)
    assert policy.child_busy(state)
    policy.cleanup(apply=True)
    assert (old / "frontend/node_modules").exists()


@pytest.mark.parametrize("name", ["C:relative", "../file", "file:stream", "a//b", "./file"])
def test_manifest_rejects_noncanonical_paths(name):
    assert not module().CachePolicy.valid_manifest({name: "a" * 64})


def test_source_manifest_inside_generated_leaf_is_preserved(tmp_path):
    _, policy, _, old, _ = fixture(tmp_path)
    path = old / "receipt.json"
    value = json.loads(path.read_text())
    value["source"]["node_modules/original.jpg"] = digest("original")
    write(old / "frontend/node_modules/original.jpg", "original")
    write(path, json.dumps(value))
    policy.cleanup(apply=True)
    assert (old / "frontend/node_modules/original.jpg").read_text() == "original"


@pytest.mark.parametrize("registered", [True, False])
def test_vendor_shared_directory_requires_recorded_generated_hashes(tmp_path, registered):
    _, policy, _, old, _ = fixture(tmp_path)
    relative = "node_modules/next/dist/shared/runtime.js"
    write(old / "frontend" / relative, "generated vendor")
    if registered:
        path = old / "receipt.json"
        value = json.loads(path.read_text())
        value["artifacts"][relative] = digest("generated vendor")
        write(path, json.dumps(value))
    policy.cleanup(apply=True)
    assert (old / "frontend/node_modules").exists() is (not registered)


@pytest.mark.parametrize("evidence", ["match", "changed", "unregistered", "own_receipt"])
def test_failed_vendor_cache_requires_installed_artifact_evidence(
    tmp_path_factory: pytest.TempPathFactory, evidence: str,
) -> None:
    m, policy, newest, old, record = fixture(tmp_path_factory.mktemp("vendor"))
    relative = "node_modules/pkg/data/f.ts"
    for root in (newest / "frontend", old / "frontend", policy.employee / "frontend"):
        write(root / relative, "generated vendor fixture")
    receipt = json.loads((newest / "receipt.json").read_text())
    if evidence != "unregistered":
        receipt["artifacts"][relative] = digest("generated vendor fixture")
    write(newest / "receipt.json", json.dumps(receipt))
    journal = json.loads(record.read_text())
    journal["incoming_frontend"] = receipt["artifacts"]
    write(record, json.dumps(journal))
    if evidence != "own_receipt":
        (old / "receipt.json").unlink()
    if evidence == "changed":
        write(old / "frontend" / relative, "unverified user content")
    state = policy.pin(old)
    state.update(pid=99999999, expires_at=(NOW - timedelta(hours=1)).isoformat())
    policy.save_preparation(old, state)
    employee_before = {str(p): p.read_bytes() for p in policy.employee.rglob("*") if p.is_file()}
    retained_before = retained_bytes(policy.repo)

    result = policy.cleanup(apply=True)

    matched = evidence == "match"
    assert result["status"] == ("COMPLETED" if matched else "WARNING")
    assert (old / "frontend/node_modules").exists() is (not matched)
    assert (newest / "frontend/node_modules").exists()
    assert retained_bytes(policy.repo) == retained_before
    assert {str(p): p.read_bytes() for p in policy.employee.rglob("*") if p.is_file()} == employee_before
    assert m.read_json(record)["phase"] == "CONFIRMED"


def test_failed_build_cache_does_not_borrow_installed_artifact_evidence(tmp_path: Path) -> None:
    _, policy, newest, old, record = fixture(tmp_path)
    relative = ".next-prod/data/original.txt"
    for root in (newest / "frontend", old / "frontend", policy.employee / "frontend"):
        write(root / relative, "not a verified dependency")
    receipt = json.loads((newest / "receipt.json").read_text())
    receipt["artifacts"][relative] = digest("not a verified dependency")
    write(newest / "receipt.json", json.dumps(receipt))
    journal = json.loads(record.read_text())
    journal["incoming_frontend"] = receipt["artifacts"]
    write(record, json.dumps(journal))
    (old / "receipt.json").unlink()
    state = policy.pin(old)
    state.update(pid=99999999, expires_at=(NOW - timedelta(hours=1)).isoformat())
    policy.save_preparation(old, state)

    assert policy.cleanup(apply=True)["status"] == "WARNING"
    assert (old / "frontend" / relative).read_text() == "not a verified dependency"


@pytest.mark.skipif(os.name != "nt", reason="Windows generated cache path handling")
@pytest.mark.parametrize("kind", ["file", "directory"])
def test_windows_cleanup_removes_generated_files_beyond_legacy_path_limit(tmp_path: Path, kind: str) -> None:
    _, policy, newest, old, _ = fixture(tmp_path)
    target = old / "frontend/.next-prod/server" / ("x" * 180 + ".js" if kind == "file" else "x" * 180 + "/page.js")
    assert len(str(target)) > 260
    write(Path("\\\\?\\" + str(target)), "generated long path")

    result = policy.cleanup(apply=True)

    assert result["status"] == "COMPLETED"
    assert not (old / "frontend/.next-prod").exists()
    assert (newest / "frontend/.next-prod").exists()


def test_preview_does_not_delete_or_rewrite_sources_logs_or_receipts(tmp_path):
    _, policy, newest, old, _ = fixture(tmp_path)
    before = retained_bytes(policy.repo)
    report = policy.cleanup()
    assert report["status"] == "PREVIEW"
    assert report["retained_release"] == str(newest)
    assert len(report["targets"]) == 3
    assert (old / "frontend/node_modules").exists()
    assert retained_bytes(policy.repo) == before


def test_apply_only_removes_old_generated_leaves_and_is_idempotent(tmp_path):
    _, policy, newest, old, _ = fixture(tmp_path)
    write(old / "frontend/.env.local", "private setting")
    write(old / "frontend/original.xlsx", "original workbook")
    write(policy.repo / "backend/mes.db", "protected database")
    write(policy.repo / "shared/photo.jpg", "original picture")
    before = retained_bytes(policy.repo)
    result = policy.cleanup(apply=True)
    assert result["status"] == "COMPLETED"
    assert len(result["removed"]) == 3
    assert result["removed_bytes"] > 0
    assert newest.joinpath("frontend/node_modules").exists()
    assert not old.joinpath("frontend/node_modules").exists()
    assert retained_bytes(policy.repo) == before
    assert policy.cleanup(apply=True)["removed"] == []


@pytest.mark.parametrize("reason", ["pending", "bad_journal", "bad_receipt", "wrong_install", "ambiguous"])
def test_uncertain_latest_install_never_deletes(tmp_path, reason):
    _, policy, newest, old, record = fixture(tmp_path)
    if reason == "pending":
        write(record.parent.parent / ("2" * 32) / "journal.json", '{"phase":"MIGRATING"}')
    elif reason == "bad_journal":
        write(record, "corrupt")
    elif reason == "bad_receipt":
        write(newest / "receipt.json", "corrupt")
    elif reason == "wrong_install":
        write(policy.employee / "frontend/.next-prod/BUILD_ID", "other-build")
    else:
        import shutil
        shutil.copytree(newest, policy.roots[1] / newest.name)
    assert policy.cleanup(apply=True)["status"] == "SKIPPED"
    assert (old / "frontend/.next-prod").exists()


def test_confirmed_binding_pins_one_actual_install_and_does_not_edit_evidence(tmp_path):
    _, policy, newest, old, record = fixture(tmp_path)
    record_before = record.read_bytes()
    receipt_before = (newest / "receipt.json").read_bytes()
    policy.remember_install(newest, record)
    assert policy.cleanup()["retained_release"] == str(newest)
    assert record.read_bytes() == record_before
    assert (newest / "receipt.json").read_bytes() == receipt_before
    write(policy.state_root / "latest-installed.json", "corrupt")
    assert policy.cleanup(apply=True)["status"] == "SKIPPED"
    assert (old / "frontend/node_modules").exists()


@pytest.mark.parametrize("hours", [0, 23, 24, 72])
def test_fresh_preparation_retained_until_24_hours(tmp_path, hours):
    _, policy, _, old, _ = fixture(tmp_path)
    receipt = json.loads((old / "receipt.json").read_text())
    receipt["prepared_at"] = (NOW - timedelta(hours=hours)).isoformat()
    write(old / "receipt.json", json.dumps(receipt))
    policy.cleanup(apply=True)
    assert (old / "frontend/node_modules").exists() is (hours < 24)


def test_session_protects_gaps_between_prepare_and_install(tmp_path):
    m, policy, _, old, _ = fixture(tmp_path)
    token = policy.begin_session(os.getpid())
    assert policy.cleanup(apply=True)["status"] == "SKIPPED"
    with pytest.raises(m.CacheBusy):
        with policy.operation():
            pass
    with policy.operation(session=token):
        policy.pin(old)
    policy.end_session(token)
    assert (old / "frontend/node_modules").exists()
    policy.cleanup(apply=True)
    assert (old / "frontend/node_modules").exists()


@pytest.mark.parametrize("birth", [None, "alive"])
def test_unknown_or_live_child_overrides_expired_pin(tmp_path, monkeypatch, birth):
    m, policy, _, old, _ = fixture(tmp_path)
    state = policy.pin(old)
    state["expires_at"] = (NOW - timedelta(days=2)).isoformat()
    state["child"] = {"pid": 12345, "birth": "alive", "status": "RUNNING"}
    policy.save_preparation(old, state)
    monkeypatch.setattr(m, "process_birth", lambda _pid: birth)
    policy.cleanup(apply=True)
    assert (old / "frontend/node_modules").exists()


def test_unknown_spawn_and_corrupt_preparation_state_are_preserved(tmp_path):
    _, policy, _, old, _ = fixture(tmp_path)
    state = policy.pin(old)
    state["expires_at"] = (NOW - timedelta(days=2)).isoformat()
    state["child"] = {"status": "STARTING"}
    policy.save_preparation(old, state)
    policy.cleanup(apply=True)
    assert (old / "frontend/node_modules").exists()
    write(policy.preparation_path(old), "corrupt")
    policy.cleanup(apply=True)
    assert (old / "frontend/node_modules").exists()


@pytest.mark.parametrize("protected", ["secret.db", "mes.db-wal", "source.xlsx", ".env.local", ".npmrc"])
def test_protected_files_inside_generated_target_block_that_target(tmp_path, protected):
    _, policy, _, old, _ = fixture(tmp_path)
    path = old / "frontend/node_modules" / protected
    write(path, "protected")
    policy.cleanup(apply=True)
    assert path.read_text() == "protected"


def test_junction_to_shared_original_is_not_traversed(tmp_path):
    _, policy, _, old, _ = fixture(tmp_path)
    shared = tmp_path / "shared"
    write(shared / "photo.jpg", "original")
    link = old / "frontend/node_modules/shared-link"
    if os.name == "nt":
        command = ["cmd.exe", "/c", "mklink", "/J", str(link), str(shared)]
        assert subprocess.run(command, capture_output=True, check=False).returncode == 0
    else:
        link.symlink_to(shared, target_is_directory=True)
    try:
        policy.cleanup(apply=True)
        assert (shared / "photo.jpg").read_text() == "original"
        assert link.exists()
    finally:
        # Remove only the test link itself, never a recursive command.
        if os.name == "nt":
            link.rmdir()
        else:
            link.unlink()


@pytest.mark.parametrize("bytes_count,removed", [(512, False), (513, True)])
def test_download_limit_preserves_npm_logs(tmp_path, bytes_count, removed):
    _, policy, _, _, _ = fixture(tmp_path)
    policy.download_limit = 512
    cache = policy.roots[0] / "npm-cache"
    write(cache / "_cacache/content/item", "x" * bytes_count)
    write(cache / "_logs/check.log", "verification")
    policy.cleanup(apply=True)
    assert (cache / "_cacache").exists() is (not removed)
    assert (cache / "_logs/check.log").read_text() == "verification"


def test_legacy_downloads_are_evicted_first_at_combined_limit(tmp_path):
    _, policy, _, _, _ = fixture(tmp_path)
    policy.download_limit = 512
    write(policy.roots[0] / "npm-cache/_cacache/item", "x" * 400)
    write(policy.roots[1] / "npm-cache/_cacache/item", "x" * 200)
    policy.cleanup(apply=True)
    assert (policy.roots[0] / "npm-cache/_cacache").exists()
    assert not (policy.roots[1] / "npm-cache/_cacache").exists()


def test_partial_delete_failure_reports_warning_and_can_retry(tmp_path, monkeypatch):
    m, policy, newest, old, _ = fixture(tmp_path)
    original = m.remove_tree
    def fail_one(path):
        if path.name == "node_modules":
            raise PermissionError("fixture lock")
        original(path)
    monkeypatch.setattr(m, "remove_tree", fail_one)
    result = policy.cleanup(apply=True)
    assert result["status"] == "WARNING"
    assert result["errors"]
    assert newest.joinpath("frontend/node_modules").exists()
    monkeypatch.setattr(m, "remove_tree", original)
    assert policy.cleanup(apply=True)["status"] == "COMPLETED"
    assert not old.joinpath("frontend/node_modules").exists()


def test_operation_lock_is_exclusive_across_processes(tmp_path):
    _, policy, _, _, _ = fixture(tmp_path)
    code = (
        "import sys; from pathlib import Path; "
        f"sys.path.insert(0,{str(TOOL.parent)!r}); "
        "from frontend_preparation_cache import CachePolicy; "
        f"p=CachePolicy(Path({str(policy.repo)!r}),Path({str(policy.employee)!r})); "
        "print(p.cleanup(apply=True)['status'])"
    )
    with policy.operation():
        result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=False)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "SKIPPED"


def test_release_cli_obeys_the_deployment_session_lock(tmp_path, monkeypatch):
    monkeypatch.syspath_prepend(str(ROOT))
    from scripts.ops import frontend_preparation_cache as cache
    policy = cache.CachePolicy(tmp_path / "repo", tmp_path / "employee")
    token = policy.begin_session(os.getpid())
    tool = ROOT / "scripts/ops/employee_frontend_release.py"
    spec = importlib.util.spec_from_file_location("cache_cli_fixture", tool)
    target = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = target
    spec.loader.exec_module(target)
    monkeypatch.setattr(cache, "CachePolicy", lambda *_args, **_kwargs: policy)
    monkeypatch.delenv(cache.SESSION_ENV, raising=False)
    monkeypatch.setattr(sys, "argv", [str(tool), "check-pending", "--employee-root", str(policy.employee)])
    assert target.main() == 9
    monkeypatch.setenv(cache.SESSION_ENV, token)
    assert target.main() == 0
    policy.end_session(token)
