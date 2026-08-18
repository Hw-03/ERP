from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pytest

from scripts.dev.verification_policy import (
    Change,
    _load_changes_for_plan,
    _parse_name_status,
    classify_path,
    main,
    make_plan,
)


DOCS_GATE_IDS = ["docs-whitespace", "docs-link-tests", "docs-links"]


def test_smart_auto_prefers_staged_changes() -> None:
    plan = make_plan(
        mode="smart",
        change_set="auto",
        staged_changes=[Change(status="M", path="backend/app/services/items.py")],
        working_changes=[Change(status="M", path="frontend/app/page.tsx")],
        testmon_cache_exists=True,
    )

    assert plan["change_set"] == "staged"
    assert plan["selected_files"] == ["backend/app/services/items.py"]
    assert plan["ignored_files"] == ["frontend/app/page.tsx"]
    assert [gate["id"] for gate in plan["gates"]] == ["backend-testmon"]


def test_smart_auto_uses_working_changes_when_nothing_is_staged() -> None:
    plan = make_plan(
        mode="smart",
        change_set="auto",
        staged_changes=[],
        working_changes=[Change(status="M", path="frontend/app/page.tsx")],
        testmon_cache_exists=True,
    )

    assert plan["change_set"] == "working"
    assert [gate["id"] for gate in plan["gates"]] == [
        "frontend-lint-files",
        "frontend-tsc-incremental",
        "frontend-vitest-related",
    ]


def test_explicit_working_change_set_does_not_select_staged_files() -> None:
    plan = make_plan(
        mode="smart",
        change_set="working",
        staged_changes=[Change(status="M", path="frontend/app/staged.tsx")],
        working_changes=[Change(status="M", path="frontend/app/working.tsx")],
        testmon_cache_exists=True,
    )

    assert plan["selected_files"] == ["frontend/app/working.tsx"]
    assert plan["ignored_files"] == ["frontend/app/staged.tsx"]


def test_staged_and_working_change_to_same_file_stops_the_plan() -> None:
    plan = make_plan(
        mode="smart",
        change_set="auto",
        staged_changes=[Change(status="M", path="backend/app/services/items.py")],
        working_changes=[Change(status="M", path="backend/app/services/items.py")],
        testmon_cache_exists=True,
    )

    assert plan["conflicts"] == ["backend/app/services/items.py"]
    assert plan["gates"] == []


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("frontend/app/page.tsx", "frontend"),
        ("backend/app/main.py", "backend"),
        ("_dev/baselines/openapi.json", "backend"),
        ("README.md", "docs"),
        ("scripts/dev/verify_local.ps1", "infra"),
        ("mystery.bin", "unknown"),
    ],
)
def test_classify_path_assigns_verification_area(path: str, expected: str) -> None:
    assert classify_path(path) == expected


def test_frontend_test_file_is_run_directly_in_smart_mode() -> None:
    plan = make_plan(
        mode="smart",
        change_set="working",
        staged_changes=[],
        working_changes=[Change(status="M", path="frontend/app/page.test.tsx")],
        testmon_cache_exists=True,
    )

    assert [gate["id"] for gate in plan["gates"]] == [
        "frontend-lint-files",
        "frontend-tsc-incremental",
        "frontend-vitest-related",
        "frontend-direct-tests",
    ]


@pytest.mark.parametrize(
    "change",
    [
        Change(status="D", path="frontend/app/old.tsx"),
        Change(status="R", path="frontend/app/new.tsx", old_path="frontend/app/old.tsx"),
        Change(status="M", path="frontend/app/page.tsx", patch="+const page = import('./lazy')"),
        Change(status="M", path="frontend/tsconfig.json"),
        Change(status="M", path="frontend/package-lock.json"),
        Change(status="M", path="frontend/vitest.setup.ts"),
    ],
)
def test_frontend_risky_change_escalates_to_full_frontend(change: Change) -> None:
    plan = make_plan(
        mode="smart",
        change_set="working",
        staged_changes=[],
        working_changes=[change],
        testmon_cache_exists=True,
    )

    assert plan["escalations"][0]["area"] == "frontend"
    assert [gate["id"] for gate in plan["gates"]] == [
        "frontend-lint",
        "frontend-typecheck",
        "frontend-coverage",
        "frontend-build",
        "frontend-bundle-size",
    ]


def test_frontend_verification_script_escalates_to_full_frontend() -> None:
    plan = make_plan(
        mode="smart",
        change_set="working",
        staged_changes=[],
        working_changes=[
            Change(status="M", path="frontend/scripts/check-bundle-size.mjs")
        ],
        testmon_cache_exists=True,
    )

    assert plan["escalations"] == [
        {
            "area": "frontend",
            "reason": "frontend shared configuration, dependency, test setup, or verification script change",
        }
    ]
    assert [gate["id"] for gate in plan["gates"]] == [
        "frontend-lint",
        "frontend-typecheck",
        "frontend-coverage",
        "frontend-build",
        "frontend-bundle-size",
    ]


def test_backend_without_testmon_cache_escalates_to_full_backend() -> None:
    plan = make_plan(
        mode="smart",
        change_set="working",
        staged_changes=[],
        working_changes=[Change(status="M", path="backend/app/services/items.py")],
        testmon_cache_exists=False,
    )

    assert plan["escalations"] == [
        {"area": "backend", "reason": "testmon cache is not built"}
    ]
    assert [gate["id"] for gate in plan["gates"]] == [
        "backend-pytest-full",
        "backend-openapi",
    ]


@pytest.mark.parametrize(
    "change",
    [
        Change(status="M", path="backend/app/database.py"),
        Change(status="M", path="backend/app/models/item.py"),
        Change(status="M", path="backend/alembic/versions/001.py"),
        Change(status="M", path="backend/tests/conftest.py"),
        Change(status="M", path="backend/requirements.txt"),
        Change(status="D", path="backend/app/services/old.py"),
        Change(status="R", path="backend/app/services/new.py", old_path="backend/app/services/old.py"),
        Change(status="M", path="backend/app/services/plugin.py", patch="+importlib.import_module(name)"),
    ],
)
def test_backend_risky_change_escalates_to_full_backend(change: Change) -> None:
    plan = make_plan(
        mode="smart",
        change_set="working",
        staged_changes=[],
        working_changes=[change],
        testmon_cache_exists=True,
    )

    assert plan["escalations"][0]["area"] == "backend"
    assert [gate["id"] for gate in plan["gates"]] == [
        "backend-pytest-full",
        "backend-openapi",
    ]


def test_router_or_schema_change_adds_openapi_to_backend_testmon() -> None:
    plan = make_plan(
        mode="smart",
        change_set="working",
        staged_changes=[],
        working_changes=[Change(status="M", path="backend/app/routers/items.py")],
        testmon_cache_exists=True,
    )

    assert [gate["id"] for gate in plan["gates"]] == [
        "backend-testmon",
        "backend-openapi",
    ]


def test_backend_runtime_change_outside_staged_selection_escalates_backend() -> None:
    plan = make_plan(
        mode="smart",
        change_set="auto",
        staged_changes=[Change(status="M", path="backend/tests/services/test_items.py")],
        working_changes=[Change(status="M", path="backend/app/services/items.py")],
        testmon_cache_exists=True,
    )

    assert plan["escalations"] == [
        {"area": "backend", "reason": "backend runtime change exists outside selected staged changes"}
    ]
    assert [gate["id"] for gate in plan["gates"]] == [
        "backend-pytest-full",
        "backend-openapi",
    ]


def test_cross_area_rename_keeps_the_old_runtime_area_in_the_plan() -> None:
    plan = make_plan(
        mode="smart",
        change_set="working",
        staged_changes=[],
        working_changes=[
            Change(
                status="R",
                old_path="backend/app/services/legacy.py",
                path="_attic/legacy.py",
            )
        ],
        testmon_cache_exists=True,
    )

    assert plan["areas"] == ["backend", "docs"]
    assert [gate["id"] for gate in plan["gates"]] == [
        "backend-pytest-full",
        "backend-openapi",
        *DOCS_GATE_IDS,
    ]


def test_staged_cross_area_rename_counts_as_ignored_backend_runtime() -> None:
    plan = make_plan(
        mode="smart",
        change_set="auto",
        staged_changes=[Change(status="M", path="README.md")],
        working_changes=[
            Change(
                status="R",
                old_path="backend/app/services/legacy.py",
                path="_attic/legacy.py",
            )
        ],
        testmon_cache_exists=True,
    )

    assert plan["escalations"] == [
        {
            "area": "backend",
            "reason": "backend runtime change exists outside selected staged changes",
        }
    ]
    assert [gate["id"] for gate in plan["gates"]] == [
        "backend-pytest-full",
        "backend-openapi",
        *DOCS_GATE_IDS,
    ]


def test_docs_only_smart_plan_runs_all_maintained_docs_gates() -> None:
    plan = make_plan(
        mode="smart",
        change_set="working",
        staged_changes=[],
        working_changes=[Change(status="M", path="README.md")],
        testmon_cache_exists=True,
    )

    assert plan["areas"] == ["docs"]
    assert [gate["id"] for gate in plan["gates"]] == DOCS_GATE_IDS


def test_docs_and_infra_smart_plan_keeps_docs_gates_during_full_escalation() -> None:
    plan = make_plan(
        mode="smart",
        change_set="working",
        staged_changes=[],
        working_changes=[
            Change(status="M", path="README.md"),
            Change(status="M", path="scripts/dev/start-backend.ps1"),
        ],
        testmon_cache_exists=True,
    )

    assert [gate["id"] for gate in plan["gates"]][:3] == DOCS_GATE_IDS
    assert [gate["id"] for gate in plan["gates"]][3:] == [
        "backend-pytest-full",
        "backend-openapi",
        "frontend-lint",
        "frontend-typecheck",
        "frontend-coverage",
        "frontend-build",
        "frontend-bundle-size",
        "git-status",
    ]


def test_legacy_auto_keeps_docs_gates_with_frontend_changes() -> None:
    plan = make_plan(
        mode="auto",
        change_set="working",
        staged_changes=[],
        working_changes=[
            Change(status="M", path="README.md"),
            Change(status="M", path="frontend/app/page.tsx"),
        ],
        testmon_cache_exists=True,
    )

    assert [gate["id"] for gate in plan["gates"]][-3:] == DOCS_GATE_IDS


def test_smart_mixed_frontend_and_backend_changes_keep_both_targeted_gates() -> None:
    plan = make_plan(
        mode="smart",
        change_set="working",
        staged_changes=[],
        working_changes=[
            Change(status="M", path="frontend/app/mes/page.tsx"),
            Change(status="M", path="backend/app/services/items.py"),
        ],
        testmon_cache_exists=True,
    )

    assert plan["areas"] == ["backend", "frontend"]
    assert [gate["id"] for gate in plan["gates"]] == [
        "backend-testmon",
        "frontend-lint-files",
        "frontend-tsc-incremental",
        "frontend-vitest-related",
    ]


def test_infra_change_escalates_to_full_plan() -> None:
    plan = make_plan(
        mode="smart",
        change_set="working",
        staged_changes=[],
        working_changes=[Change(status="M", path="scripts/dev/start-backend.ps1")],
        testmon_cache_exists=True,
    )

    assert plan["escalations"] == [{"area": "infra", "reason": "infra change requires full verification"}]
    assert [gate["id"] for gate in plan["gates"]] == [
        "backend-pytest-full",
        "backend-openapi",
        "frontend-lint",
        "frontend-typecheck",
        "frontend-coverage",
        "frontend-build",
        "frontend-bundle-size",
        "git-status",
    ]


def test_legacy_auto_uses_all_changes_and_full_area_gates() -> None:
    plan = make_plan(
        mode="auto",
        change_set="auto",
        staged_changes=[Change(status="M", path="backend/app/services/items.py")],
        working_changes=[Change(status="M", path="frontend/app/page.tsx")],
        testmon_cache_exists=True,
    )

    assert plan["change_set"] == "all"
    assert plan["selected_files"] == [
        "backend/app/services/items.py",
        "frontend/app/page.tsx",
    ]
    assert [gate["id"] for gate in plan["gates"]] == [
        "backend-pytest-full",
        "backend-openapi",
        "frontend-lint",
        "frontend-typecheck",
        "frontend-coverage",
        "frontend-build",
        "frontend-bundle-size",
        "git-status",
    ]


@pytest.mark.parametrize(
    ("mode", "expected_ids"),
    [
        ("docs", DOCS_GATE_IDS),
        ("backend", ["backend-pytest-full", "backend-openapi"]),
        (
            "frontend",
            [
                "frontend-lint",
                "frontend-typecheck",
                "frontend-coverage",
                "frontend-build",
                "frontend-bundle-size",
            ],
        ),
    ],
)
def test_explicit_legacy_mode_keeps_full_area_gate(mode: str, expected_ids: list[str]) -> None:
    plan = make_plan(
        mode=mode,
        change_set="auto",
        staged_changes=[],
        working_changes=[],
        testmon_cache_exists=False,
    )

    assert [gate["id"] for gate in plan["gates"]] == expected_ids


def test_explicit_full_keeps_docs_gates_when_docs_changed() -> None:
    plan = make_plan(
        mode="full",
        change_set="working",
        staged_changes=[],
        working_changes=[Change(status="M", path="README.md")],
        testmon_cache_exists=True,
    )

    assert [gate["id"] for gate in plan["gates"]][:3] == DOCS_GATE_IDS


def test_name_status_parser_preserves_both_rename_paths() -> None:
    assert _parse_name_status("R100\tbackend/app/old.py\tbackend/app/new.py\n") == [
        Change(status="R", old_path="backend/app/old.py", path="backend/app/new.py")
    ]


def test_cli_reads_real_git_changes_and_emits_staged_first_json(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    staged = tmp_path / "backend" / "app" / "services" / "items.py"
    staged.parent.mkdir(parents=True)
    staged.write_text("VALUE = 1\n", encoding="utf-8")
    (tmp_path / "backend" / ".testmondata").touch()
    subprocess.run(["git", "-C", str(tmp_path), "add", staged.relative_to(tmp_path)], check=True)
    working = tmp_path / "frontend" / "app" / "page.tsx"
    working.parent.mkdir(parents=True)
    working.write_text("export default function Page() { return null }\n", encoding="utf-8")

    assert main(["--repo-root", str(tmp_path)]) == 0

    plan = json.loads(capsys.readouterr().out)
    assert plan["change_set"] == "staged"
    assert plan["selected_files"] == ["backend/app/services/items.py"]
    assert plan["ignored_files"] == ["frontend/app/page.tsx"]


def test_cli_preserves_unicode_paths_from_git(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    target = tmp_path / "frontend" / "app" / "한글품목.test.ts"
    target.parent.mkdir(parents=True)
    target.write_text("export const value = 1\n", encoding="utf-8")

    assert main(["--repo-root", str(tmp_path), "--change-set", "working"]) == 0

    plan = json.loads(capsys.readouterr().out)
    assert plan["selected_files"] == ["frontend/app/한글품목.test.ts"]


def test_cli_reads_patch_for_literal_next_dynamic_route_path(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    subprocess.run(
        ["git", "-C", str(tmp_path), "config", "user.email", "test@example.com"],
        check=True,
    )
    subprocess.run(
        ["git", "-C", str(tmp_path), "config", "user.name", "Verification Test"],
        check=True,
    )
    target = tmp_path / "frontend" / "app" / "items" / "[slug]" / "page.tsx"
    target.parent.mkdir(parents=True)
    target.write_text("export const load = () => null\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(tmp_path), "add", "."], check=True)
    subprocess.run(["git", "-C", str(tmp_path), "commit", "-qm", "baseline"], check=True)
    target.write_text("export const load = () => import('./detail')\n", encoding="utf-8")

    assert main(["--repo-root", str(tmp_path), "--change-set", "working"]) == 0

    plan = json.loads(capsys.readouterr().out)
    assert plan["escalations"] == [
        {"area": "frontend", "reason": "frontend dynamic import change"}
    ]


def test_smart_cli_reads_patches_only_for_the_selected_change_set(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, ...]] = []

    def fake_run_git(_repo_root: Path, *args: str) -> str:
        calls.append(args)
        if "--name-status" in args:
            if "--cached" in args:
                return "M\tfrontend/app/staged.tsx\n"
            return "M\tfrontend/app/ignored.tsx\n"
        if args[:3] == ("ls-files", "--others", "--exclude-standard"):
            return ""
        if "--unified=0" in args:
            if args[-1] == "frontend/app/ignored.tsx":
                raise AssertionError("ignored working patch must not be loaded")
            return "+export const load = () => import('./detail')\n"
        raise AssertionError(f"unexpected git call: {args}")

    monkeypatch.setattr("scripts.dev.verification_policy._run_git", fake_run_git)

    staged, working = _load_changes_for_plan(
        tmp_path,
        mode="smart",
        change_set="staged",
    )

    assert staged[0].patch.startswith("+export const load")
    assert working == [Change(status="M", path="frontend/app/ignored.tsx")]
    patch_targets = [args[-1] for args in calls if "--unified=0" in args]
    assert patch_targets == ["frontend/app/staged.tsx"]
