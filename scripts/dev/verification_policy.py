"""DEXCOWIN MES 로컬 검증 계획을 결정하는 순수 정책 모듈."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Sequence


Area = Literal["frontend", "backend", "docs", "infra", "unknown"]
VALID_MODES = {"smart", "auto", "full", "frontend", "backend", "docs"}
VALID_CHANGE_SETS = {"auto", "staged", "working"}

FRONTEND_FULL_GATES = (
    "frontend-lint",
    "frontend-typecheck",
    "frontend-coverage",
    "frontend-build",
    "frontend-bundle-size",
)


@dataclass(frozen=True)
class Change:
    """Git 변경 한 건과 위험 판정에 필요한 최소 메타데이터."""

    status: str
    path: str
    old_path: str | None = None
    patch: str = ""


def normalize_path(path: str) -> str:
    """Git 및 Windows 경로 표현을 정책 비교용 POSIX 상대 경로로 맞춘다."""

    normalized = path.replace("\\", "/").strip().strip('"')
    while normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized


def classify_path(path: str) -> Area:
    """변경 경로를 검증 영역으로 분류하며 인프라 경로를 우선한다."""

    path = normalize_path(path)
    infra_patterns = (
        r"^scripts/",
        r"^\.github/workflows/",
        r"^docker/",
        r"^Dockerfile(?:\.|$)",
        r"^docker-compose(?:\.|$)",
        r"^package(?:-lock)?\.json$",
        r"^pyproject\.toml$",
        r"^bootstrap_db\.py$",
    )
    if any(re.search(pattern, path) for pattern in infra_patterns):
        return "infra"
    if path.startswith("backend/") or path == "_dev/baselines/openapi.json":
        return "backend"
    if path.startswith("frontend/"):
        return "frontend"
    docs_patterns = (
        r"^_attic/",
        r"^\.codex/",
        r"^\.claude/",
        r"^\.agents/",
        r"^\.github/",
        r"^_dev/",
        r"\.md$",
        r"^AGENTS\.md$",
        r"^CLAUDE\.md$",
        r"^\.gitignore$",
        r"^\.gitattributes$",
        r"^LICENSE",
        r"^README",
    )
    if any(re.search(pattern, path) for pattern in docs_patterns):
        return "docs"
    return "unknown"


def _gate(gate_id: str, area: Area, kind: str, reason: str, files: Sequence[str]) -> dict[str, Any]:
    return {
        "id": gate_id,
        "area": area,
        "kind": kind,
        "reason": reason,
        "files": list(files),
    }


def _full_backend_gates(files: Sequence[str], reason: str) -> list[dict[str, Any]]:
    return [
        _gate("backend-pytest-full", "backend", "full", reason, files),
        _gate("backend-openapi", "backend", "contract", reason, files),
    ]


def _full_frontend_gates(files: Sequence[str], reason: str) -> list[dict[str, Any]]:
    labels = {
        "frontend-lint": "strict lint",
        "frontend-typecheck": "full TypeScript check",
        "frontend-coverage": "full tests and coverage",
        "frontend-build": "production build",
        "frontend-bundle-size": "bundle size",
    }
    return [
        _gate(gate_id, "frontend", "full", f"{reason}: {labels[gate_id]}", files)
        for gate_id in FRONTEND_FULL_GATES
    ]


def _full_plan_gates(files: Sequence[str], reason: str) -> list[dict[str, Any]]:
    return [
        *_full_backend_gates(files, reason),
        *_full_frontend_gates(files, reason),
        _gate("git-status", "infra", "report", reason, files),
    ]


def _changed_lines_contain(change: Change, patterns: Sequence[str]) -> bool:
    changed_lines = (
        line[1:]
        for line in change.patch.splitlines()
        if line.startswith(("+", "-")) and not line.startswith(("+++", "---"))
    )
    return any(re.search(pattern, line) for line in changed_lines for pattern in patterns)


def _frontend_risk_reason(change: Change) -> str | None:
    path = normalize_path(change.path)
    status = change.status.upper()
    if status.startswith("D"):
        return "frontend file deletion"
    if status.startswith(("R", "C")) or change.old_path:
        return "frontend file move or copy"
    risky_paths = (
        r"^frontend/package(?:-lock)?\.json$",
        r"^frontend/tsconfig(?:\.[^/]+)?\.json$",
        r"^frontend/(?:next|vitest|playwright|postcss|tailwind)\.config\.",
        r"^frontend/(?:eslint\.config\.|\.eslintrc)",
        r"^frontend/scripts/",
        r"^frontend/.*(?:vitest|test).*setup[^/]*\.[cm]?[jt]sx?$",
    )
    if any(re.search(pattern, path, re.IGNORECASE) for pattern in risky_paths):
        return "frontend shared configuration, dependency, test setup, or verification script change"
    if _changed_lines_contain(
        change,
        (r"\bimport\s*\(", r"\brequire\s*\(", r"\bnext/dynamic\b"),
    ):
        return "frontend dynamic import change"
    return None


def _backend_risk_reason(change: Change) -> str | None:
    path = normalize_path(change.path)
    status = change.status.upper()
    if status.startswith("D"):
        return "backend file deletion"
    if status.startswith(("R", "C")) or change.old_path:
        return "backend file move or copy"
    risky_paths = (
        r"^backend/app/(?:_?database|db|models?)(?:\.py|/)",
        r"^backend/alembic/",
        r"^backend/(?:bootstrap_db\.py|schema\.sql|requirements[^/]*\.txt|pytest\.ini|alembic\.ini)$",
        r"^backend/(?:tests/)?(?:.*/)?conftest\.py$",
        r"^backend/app/(?:config|settings)\.py$",
        r"^backend/\.env",
    )
    if any(re.search(pattern, path, re.IGNORECASE) for pattern in risky_paths):
        return "backend database, model, migration, shared configuration, dependency, or test setup change"
    if _changed_lines_contain(
        change,
        (r"\bimportlib\.import_module\s*\(", r"\b__import__\s*\("),
    ):
        return "backend dynamic import change"
    return None


def _needs_openapi(changes: Sequence[Change]) -> bool:
    contract_patterns = (
        r"^backend/app/routers?(?:/|\.py$)",
        r"^backend/app/schemas?(?:/|\.py$)",
        r"^backend/app/main\.py$",
        r"^_dev/baselines/openapi\.json$",
    )
    return any(
        re.search(pattern, normalize_path(change.path))
        for change in changes
        for pattern in contract_patterns
    )


def _is_backend_runtime(change: Change) -> bool:
    runtime_paths = (
        normalize_path(path)
        for path in (change.path, change.old_path)
        if path
    )
    return any(
        path.startswith("backend/app/")
        or path.startswith("backend/alembic/")
        or path in {"backend/bootstrap_db.py", "backend/schema.sql"}
        for path in runtime_paths
    )


def _unique_changes(changes: Sequence[Change]) -> list[Change]:
    unique: dict[tuple[str, str | None], Change] = {}
    for change in changes:
        normalized = Change(
            status=change.status,
            path=normalize_path(change.path),
            old_path=normalize_path(change.old_path) if change.old_path else None,
            patch=change.patch,
        )
        unique[(normalized.path, normalized.old_path)] = normalized
    return list(unique.values())


def _paths(changes: Sequence[Change]) -> list[str]:
    return [change.path for change in changes]


def _conflicting_paths(staged: Sequence[Change], working: Sequence[Change]) -> list[str]:
    staged_paths = {path for change in staged for path in (change.path, change.old_path) if path}
    working_paths = {path for change in working for path in (change.path, change.old_path) if path}
    return sorted(staged_paths & working_paths)


def _change_areas(change: Change) -> set[Area]:
    """A move belongs to both its source and destination verification areas."""

    paths = (change.path, change.old_path)
    return {classify_path(path) for path in paths if path}


def _areas(changes: Sequence[Change]) -> list[Area]:
    present = {area for change in changes for area in _change_areas(change)}
    return [area for area in ("backend", "frontend", "docs", "infra", "unknown") if area in present]


def _smart_area_gates(
    *,
    area: Area,
    selected: Sequence[Change],
    testmon_cache_exists: bool,
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    area_changes = [change for change in selected if area in _change_areas(change)]
    files = _paths(area_changes)
    if area == "docs":
        return [_gate("docs-whitespace", "docs", "targeted", "docs-only whitespace check", files)], []
    if area == "frontend":
        risk = next((reason for change in area_changes if (reason := _frontend_risk_reason(change))), None)
        if risk:
            return _full_frontend_gates(files, risk), [{"area": "frontend", "reason": risk}]
        test_files = [
            path
            for path in files
            if re.search(r"(?:^|/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$", path)
            and "/e2e/" not in path
        ]
        gates = [
            _gate("frontend-lint-files", "frontend", "targeted", "lint changed frontend files", files),
            _gate("frontend-tsc-incremental", "frontend", "targeted", "incremental TypeScript check", files),
            _gate("frontend-vitest-related", "frontend", "targeted", "Vitest tests related to changed files", files),
        ]
        if test_files:
            gates.append(
                _gate("frontend-direct-tests", "frontend", "targeted", "directly changed Vitest files", test_files)
            )
        return gates, []
    if area == "backend":
        if not testmon_cache_exists:
            reason = "testmon cache is not built"
            return _full_backend_gates(files, reason), [{"area": "backend", "reason": reason}]
        risk = next((reason for change in area_changes if (reason := _backend_risk_reason(change))), None)
        if risk:
            return _full_backend_gates(files, risk), [{"area": "backend", "reason": risk}]
        gates = [
            _gate("backend-testmon", "backend", "targeted", "pytest-testmon affected tests", files)
        ]
        if _needs_openapi(area_changes):
            gates.append(_gate("backend-openapi", "backend", "contract", "OpenAPI contract path changed", files))
        return gates, []
    return [], []


def make_plan(
    *,
    mode: str,
    change_set: str,
    staged_changes: Sequence[Change],
    working_changes: Sequence[Change],
    testmon_cache_exists: bool,
) -> dict[str, Any]:
    """변경 집합과 캐시 상태만으로 실행할 검증 게이트를 결정한다."""

    if mode not in VALID_MODES:
        raise ValueError(f"unsupported mode: {mode}")
    if change_set not in VALID_CHANGE_SETS:
        raise ValueError(f"unsupported change set: {change_set}")
    staged = _unique_changes(staged_changes)
    working = _unique_changes(working_changes)

    if mode == "smart":
        selected_kind = "staged" if change_set == "auto" and staged else change_set
        if selected_kind == "auto":
            selected_kind = "working"
        selected = list(staged if selected_kind == "staged" else working)
        ignored = list(working if selected_kind == "staged" else staged)
        conflicts = _conflicting_paths(staged, working)
        if conflicts:
            return {
                "mode": mode,
                "change_set": selected_kind,
                "selected_files": _paths(selected),
                "ignored_files": _paths(ignored),
                "conflicts": conflicts,
                "areas": _areas(selected),
                "escalations": [],
                "gates": [],
                "testmon_cache_exists": testmon_cache_exists,
            }
    else:
        selected_kind = "all"
        selected = _unique_changes([*staged, *working])
        ignored = []
        conflicts = []

    files = _paths(selected)
    selected_areas = _areas(selected)
    escalations: list[dict[str, str]] = []
    gates: list[dict[str, Any]] = []

    if mode in {"full", "frontend", "backend", "docs"}:
        selected_areas = {
            "full": ["backend", "frontend"],
            "frontend": ["frontend"],
            "backend": ["backend"],
            "docs": ["docs"],
        }[mode]
        if mode == "full":
            gates = _full_plan_gates(files, "explicit full mode")
        elif mode == "frontend":
            gates = _full_frontend_gates(files, "explicit frontend mode")
        elif mode == "backend":
            gates = _full_backend_gates(files, "explicit backend mode")
        else:
            gates = [_gate("docs-whitespace", "docs", "targeted", "explicit docs mode", files)]
    elif mode == "auto":
        if "infra" in selected_areas or "unknown" in selected_areas:
            reason = "legacy auto escalated for infra or unknown change"
            gates = _full_plan_gates(files, reason)
            selected_areas = ["backend", "frontend", *(["docs"] if "docs" in selected_areas else [])]
        else:
            if "backend" in selected_areas:
                gates.extend(_full_backend_gates(files, "legacy auto backend scope"))
            if "frontend" in selected_areas:
                gates.extend(_full_frontend_gates(files, "legacy auto frontend scope"))
            if selected_areas == ["docs"]:
                gates.append(_gate("docs-whitespace", "docs", "targeted", "legacy auto docs scope", files))
            if "backend" in selected_areas and "frontend" in selected_areas:
                gates.append(_gate("git-status", "infra", "report", "legacy combined scope", files))
    else:
        if "infra" in selected_areas or "unknown" in selected_areas:
            area = "infra" if "infra" in selected_areas else "unknown"
            reason = f"{area} change requires full verification"
            escalations.append({"area": area, "reason": reason})
            gates = _full_plan_gates(files, reason)
            selected_areas = ["backend", "frontend"]
        else:
            for area in ("backend", "frontend", "docs"):
                if area not in selected_areas:
                    continue
                area_gates, area_escalations = _smart_area_gates(
                    area=area,
                    selected=selected,
                    testmon_cache_exists=testmon_cache_exists,
                )
                gates.extend(area_gates)
                escalations.extend(area_escalations)

            outside_backend_runtime = selected_kind == "staged" and any(
                _is_backend_runtime(change) for change in ignored
            )
            if outside_backend_runtime:
                reason = "backend runtime change exists outside selected staged changes"
                escalations = [item for item in escalations if item["area"] != "backend"]
                escalations.append({"area": "backend", "reason": reason})
                gates = [gate for gate in gates if gate["area"] != "backend"]
                gates = [*_full_backend_gates(files, reason), *gates]
                if "backend" not in selected_areas:
                    selected_areas = ["backend", *selected_areas]

    return {
        "mode": mode,
        "change_set": selected_kind,
        "selected_files": files,
        "ignored_files": _paths(ignored),
        "conflicts": conflicts,
        "areas": selected_areas,
        "escalations": escalations,
        "gates": gates,
        "testmon_cache_exists": testmon_cache_exists,
    }


def _run_git(repo_root: Path, *args: str) -> str:
    result = subprocess.run(
        [
            "git",
            "-C",
            str(repo_root),
            "-c",
            "core.quotepath=false",
            "--literal-pathspecs",
            *args,
        ],
        text=True,
        encoding="utf-8",
        errors="surrogateescape",
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"git {' '.join(args)} failed")
    return result.stdout


def _parse_name_status(output: str) -> list[Change]:
    changes: list[Change] = []
    for line in output.splitlines():
        fields = line.split("\t")
        if len(fields) < 2:
            continue
        status = fields[0]
        if status.startswith(("R", "C")) and len(fields) >= 3:
            changes.append(Change(status=status[0], old_path=fields[1], path=fields[2]))
        else:
            changes.append(Change(status=status[0], path=fields[1]))
    return changes


def _enrich_changes_with_patches(
    repo_root: Path,
    changes: Sequence[Change],
    *,
    staged: bool,
) -> list[Change]:
    """선택된 변경에만 동적 import 위험 판정용 patch를 붙인다."""

    patch_args = ["diff", "--unified=0", "--no-ext-diff"]
    if staged:
        patch_args.insert(1, "--cached")
    enriched = []
    for change in changes:
        target = change.path
        patch = _run_git(repo_root, *patch_args, "--", target) if change.status != "A" or staged else ""
        if not staged and change.status == "A":
            try:
                patch = "\n".join(f"+{line}" for line in (repo_root / target).read_text(encoding="utf-8").splitlines())
            except (OSError, UnicodeError):
                patch = ""
        enriched.append(Change(change.status, target, change.old_path, patch))
    return enriched


def _collect_changes(repo_root: Path, *, staged: bool) -> list[Change]:
    """지정 Git 저장소에서 staged 또는 working 변경 메타데이터를 수집한다."""

    diff_args = ["diff", "--name-status", "--find-renames"]
    if staged:
        diff_args.insert(1, "--cached")
    changes = _parse_name_status(_run_git(repo_root, *diff_args))
    if not staged:
        tracked = {change.path for change in changes}
        untracked = _run_git(repo_root, "ls-files", "--others", "--exclude-standard").splitlines()
        changes.extend(
            Change(status="A", path=path)
            for path in untracked
            if path not in tracked and normalize_path(path) != "backend/.testmondata"
        )
    return changes


def _load_changes_for_plan(
    repo_root: Path,
    *,
    mode: str,
    change_set: str,
) -> tuple[list[Change], list[Change]]:
    """검증 계획이 실제로 선택할 변경 집합에만 patch I/O를 수행한다."""

    staged = _collect_changes(repo_root, staged=True)
    working = _collect_changes(repo_root, staged=False)
    if mode != "smart":
        return (
            _enrich_changes_with_patches(repo_root, staged, staged=True),
            _enrich_changes_with_patches(repo_root, working, staged=False),
        )

    select_staged = change_set == "staged" or (change_set == "auto" and bool(staged))
    if select_staged:
        return _enrich_changes_with_patches(repo_root, staged, staged=True), working
    return staged, _enrich_changes_with_patches(repo_root, working, staged=False)


def main(argv: Sequence[str] | None = None) -> int:
    """Git 상태를 읽어 PowerShell이 소비할 JSON 계획을 표준 출력에 기록한다."""

    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, required=True)
    parser.add_argument("--mode", choices=sorted(VALID_MODES), default="smart")
    parser.add_argument("--change-set", choices=sorted(VALID_CHANGE_SETS), default="auto")
    args = parser.parse_args(argv)
    repo_root = args.repo_root.resolve()
    staged_changes, working_changes = _load_changes_for_plan(
        repo_root,
        mode=args.mode,
        change_set=args.change_set,
    )
    plan = make_plan(
        mode=args.mode,
        change_set=args.change_set,
        staged_changes=staged_changes,
        working_changes=working_changes,
        testmon_cache_exists=(repo_root / "backend" / ".testmondata").is_file(),
    )
    print(json.dumps(plan, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
