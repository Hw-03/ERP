"""Boundary tests use temporary fake checkouts only; no servers or product DB access."""

from __future__ import annotations

from contextlib import ExitStack
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
from types import ModuleType
import unittest
from unittest.mock import patch


HERE = Path(__file__).resolve().parent


def load_tool(name: str, path: Path) -> ModuleType:
    """Load a hyphenated CLI file without invoking its main entry point."""
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load diagnostic tool: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


EXPORT = load_tool("mes_flaky_export_source", HERE / "export-source.py")
BOM = load_tool("mes_flaky_bom_apply", HERE / "bom/apply-bom-diagnostics.py")


class GuardTests(unittest.TestCase):
    def setUp(self) -> None:
        """Keep every writable fixture beneath one disposable directory."""
        self.temporary = tempfile.TemporaryDirectory(prefix="mes-flaky-guards-")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name).resolve()
        self.checkout = self.base / "checkout"
        self.runner = self.base / "runner-temp"
        self.checkout.mkdir()
        self.runner.mkdir()
        self.event = self.base / "push.json"
        self.event.write_text(json.dumps({"head_commit": {"message": EXPORT.MARKER}}), encoding="utf-8")
        self.ci = {
            "CI": "true", "GITHUB_ACTIONS": "true", "GITHUB_REF": EXPORT.BRANCH,
            "GITHUB_EVENT_NAME": "push", "GITHUB_EVENT_PATH": str(self.event),
            "RUNNER_TEMP": str(self.runner), "GITHUB_SHA": "a" * 40,
        }

    def write_manifest(self, files: dict[str, str], root: Path | None = None) -> Path:
        """Create an input receipt outside both the fake checkout and export."""
        path = self.base / "manifest.json"
        path.write_text(json.dumps({"root": str(root or self.checkout), "files": files}), encoding="utf-8")
        return path

    def make_symlink(self, path: Path, destination: Path) -> None:
        """Linux CI exercises this guard; Windows without symlink rights may skip it."""
        try:
            path.symlink_to(destination, target_is_directory=destination.is_dir())
        except OSError as error:
            self.skipTest(f"symlink creation unavailable: {error.__class__.__name__}")

    def test_export_rejects_local_environment_before_creating_output(self) -> None:
        """A branch/event lookalike must not authorize a local source export."""
        local = {**self.ci, "GITHUB_ACTIONS": "false", "GITHUB_EVENT_NAME": "workflow_dispatch"}
        root = self.runner / "diagnosis"
        with patch.dict(os.environ, local, clear=True), patch.object(
            EXPORT, "git", side_effect=AssertionError("local export reached git")
        ), self.assertRaises(ValueError):
            EXPORT.prepare(self.checkout, root)
        self.assertFalse(root.exists())

    def test_branch_event_and_push_marker_are_required(self) -> None:
        """Dispatch is explicit; a push must also carry the exact diagnostic marker."""
        with patch.dict(os.environ, self.ci, clear=True):
            EXPORT.ci_guard()
        for overrides in ({"GITHUB_REF": "refs/heads/main"}, {"GITHUB_EVENT_NAME": "pull_request"}):
            with self.subTest(overrides=overrides), patch.dict(os.environ, {**self.ci, **overrides}, clear=True):
                with self.assertRaises(ValueError):
                    EXPORT.ci_guard()
        self.event.write_text(json.dumps({"head_commit": {"message": "ordinary change"}}), encoding="utf-8")
        with patch.dict(os.environ, self.ci, clear=True), self.assertRaises(ValueError):
            EXPORT.ci_guard()
        with patch.dict(os.environ, {**self.ci, "GITHUB_EVENT_NAME": "workflow_dispatch"}, clear=True):
            EXPORT.ci_guard()

    def test_export_root_must_be_separate_runner_temp_child(self) -> None:
        """Reject ancestor/descendant overlap even when both are under runner.temp."""
        nested_checkout = self.runner / "nested-checkout"
        nested_checkout.mkdir()
        with patch.dict(os.environ, self.ci, clear=True):
            self.assertEqual(EXPORT.checked_root(self.runner / "diagnosis", self.checkout), self.runner / "diagnosis")
            for root, checkout in (
                (self.runner, self.checkout),
                (self.base / "outside", self.checkout),
                (nested_checkout / "diagnosis", nested_checkout),
                (nested_checkout, nested_checkout / "nested"),
            ):
                checkout.mkdir(parents=True, exist_ok=True)
                with self.subTest(root=root, checkout=checkout), self.assertRaises(ValueError):
                    EXPORT.checked_root(root, checkout)

    def test_export_sha_mismatch_stops_before_copy_or_external_commands(self) -> None:
        """A trigger/checkout mismatch must not start patching or copy any source."""
        sentinel = self.checkout / "source.txt"
        sentinel.write_text("checkout sentinel", encoding="utf-8")
        root = self.runner / "diagnosis"
        with patch.dict(os.environ, self.ci, clear=True), patch.object(
            EXPORT, "git", return_value=("b" * 40 + "\n").encode()
        ), patch.object(EXPORT.subprocess, "run") as command:
            with self.assertRaisesRegex(ValueError, "SHA"):
                EXPORT.prepare(self.checkout, root)
        command.assert_not_called()
        self.assertFalse((root / "source").exists())
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "checkout sentinel")

    def test_manifest_rejects_relative_absolute_and_symlink_escape(self) -> None:
        """Hashing must stay inside its declared source root."""
        outside = self.base / "outside.txt"
        outside.write_text("outside sentinel", encoding="utf-8")
        for relative in ("../outside.txt", str(outside)):
            with self.subTest(relative=relative), self.assertRaises(ValueError):
                EXPORT.manifest(self.checkout, [relative])
        link = self.checkout / "linked.txt"
        self.make_symlink(link, outside)
        with self.assertRaises(ValueError):
            EXPORT.manifest(self.checkout, ["linked.txt"])

    def test_verify_reports_hash_mismatch_without_rewriting_source(self) -> None:
        """A mutation is a concrete failed receipt, never an automatic restoration."""
        source = self.checkout / "source.txt"
        source.write_text("changed", encoding="utf-8")
        expected = hashlib.sha256(b"original").hexdigest()
        manifest = self.write_manifest({"source.txt": expected})
        output = self.runner / "verification.json"
        with self.assertRaises(ValueError):
            EXPORT.verify(self.checkout, manifest, output)
        receipt = json.loads(output.read_text(encoding="utf-8"))
        self.assertFalse(receipt["unchanged"])
        self.assertEqual(receipt["changes"][0]["path"], "source.txt")
        self.assertEqual(source.read_text(encoding="utf-8"), "changed")

    def test_verify_rejects_manifest_root_mismatch(self) -> None:
        manifest = self.write_manifest({}, root=self.runner)
        output = self.runner / "verification.json"
        with self.assertRaises(ValueError):
            EXPORT.verify(self.checkout, manifest, output)
        self.assertFalse(output.exists())

    def test_verify_rejects_manifest_path_escape(self) -> None:
        outside = self.base / "outside.txt"
        outside.write_text("outside sentinel", encoding="utf-8")
        expected = hashlib.sha256(outside.read_bytes()).hexdigest()
        manifest = self.write_manifest({"../outside.txt": expected})
        output = self.runner / "verification.json"
        with self.assertRaises(ValueError):
            EXPORT.verify(self.checkout, manifest, output)
        self.assertFalse(output.exists())
        self.assertEqual(outside.read_text(encoding="utf-8"), "outside sentinel")

    def test_verify_receipt_cannot_overwrite_checkout(self) -> None:
        source = self.checkout / "source.txt"
        source.write_text("checkout sentinel", encoding="utf-8")
        manifest = self.write_manifest({"source.txt": hashlib.sha256(source.read_bytes()).hexdigest()})
        with self.assertRaises(ValueError):
            EXPORT.verify(self.checkout, manifest, source)
        self.assertEqual(source.read_text(encoding="utf-8"), "checkout sentinel")

    def test_bom_rejects_both_git_directory_and_worktree_git_file(self) -> None:
        """Both ordinary clones and linked worktrees must be refused before hashing."""
        for kind in ("directory", "file"):
            root = self.runner / kind
            root.mkdir()
            if kind == "directory":
                (root / ".git").mkdir()
            else:
                (root / ".git").write_text("gitdir: fake-worktree", encoding="utf-8")
            before = sorted(str(path.relative_to(root)) for path in root.rglob("*"))
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                BOM.prepare(root)
            self.assertEqual(sorted(str(path.relative_to(root)) for path in root.rglob("*")), before)

    def test_bom_hash_drift_is_rejected_before_apply(self) -> None:
        root = self.runner / "source"
        root.mkdir()
        source = root / BOM.SOURCE
        source.parent.mkdir(parents=True)
        source.write_text("unexpected source", encoding="utf-8")
        before = source.read_bytes()
        with patch.object(sys, "argv", ["apply-bom-diagnostics.py", "--sourcecopy", str(root), "--apply"]):
            with self.assertRaises(ValueError):
                BOM.main()
        self.assertEqual(source.read_bytes(), before)
        self.assertFalse((root / "frontend/tests/e2e/_bom-diag-fixture.ts").exists())

    def test_bom_apply_rejects_parent_symlink_into_checkout(self) -> None:
        """A .git-free root must not write through frontend/ into an original checkout."""
        root = self.runner / "source"
        root.mkdir()
        frontend = self.checkout / "frontend"
        frontend.mkdir()
        self.make_symlink(root / "frontend", frontend)
        helpers = self.base / "helpers"
        helpers.mkdir()
        for name in ("bom-diag-fixture.ts", "bom-diag-native.js"):
            (helpers / name).write_text("diagnostic helper", encoding="utf-8")
        fixtures = {
            BOM.SOURCE: "source fixture\n",
            BOM.SPEC: 'import { test } from "./_common-expectations";\n',
            BOM.QUANTITY: "quantity fixture\n",
        }
        for relative, value in fixtures.items():
            candidate = self.checkout / relative
            candidate.parent.mkdir(parents=True, exist_ok=True)
            candidate.write_text(value, encoding="utf-8")
        (root / ".mes-flaky-export.json").write_text(json.dumps({
            "source": str(root), "checkout": str(self.checkout), "commit": BOM.EXPECTED_HEAD,
        }), encoding="utf-8")
        hashes = {relative: BOM.text_sha256(value) for relative, value in fixtures.items()}
        with ExitStack() as stack:
            stack.enter_context(patch.object(BOM, "HERE", helpers))
            stack.enter_context(patch.object(BOM, "EXPECTED_TEXT_SHA256", hashes))
            stack.enter_context(patch.object(BOM, "instrument_source", return_value="instrumented source\n"))
            stack.enter_context(patch.object(sys, "argv", ["apply-bom-diagnostics.py", "--sourcecopy", str(root), "--apply"]))
            with self.assertRaises(ValueError):
                BOM.main()
        for relative, value in fixtures.items():
            self.assertEqual((self.checkout / relative).read_text(encoding="utf-8"), value)
        self.assertFalse((frontend / "tests/e2e/_bom-diag-fixture.ts").exists())


if __name__ == "__main__":
    unittest.main()
