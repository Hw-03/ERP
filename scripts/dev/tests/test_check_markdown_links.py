"""Tests for the maintained-current Markdown link checker CLI."""

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.dev.check_markdown_links import DEFAULT_DOCUMENTS, find_broken_links


REPO_ROOT = Path(__file__).parents[3]
SCRIPT = Path(__file__).parents[1] / "check_markdown_links.py"


class MarkdownLinkCheckerTests(unittest.TestCase):
    def run_checker(self, root: Path, *documents: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(root), "--documents", *documents],
            capture_output=True,
            text=True,
            check=False,
        )

    def test_default_documents_include_current_reference_documents(self) -> None:
        self.assertIn("_attic/docs/ATTIC_POLICY.md", DEFAULT_DOCUMENTS)
        self.assertIn("_attic/docs/ERD.md", DEFAULT_DOCUMENTS)
        self.assertIn("_attic/docs/REPO_LAYOUT.md", DEFAULT_DOCUMENTS)
        self.assertIn("_attic/docs/USER_GUIDE.md", DEFAULT_DOCUMENTS)
        self.assertEqual(find_broken_links(REPO_ROOT, DEFAULT_DOCUMENTS), [])

    def test_reports_a_missing_relative_link(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "README.md").write_text("[missing](guides/missing.md)\n", encoding="utf-8")

            result = self.run_checker(root, "README.md")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("README.md", result.stderr)
        self.assertIn("guides/missing.md", result.stderr)

    def test_skips_external_urls_and_anchors(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "guides").mkdir()
            (root / "guides" / "current.md").write_text("# Current\n", encoding="utf-8")
            (root / "README.md").write_text(
                "\n".join(
                    [
                        "[current](guides/current.md)",
                        "[external](https://example.com/guide)",
                        "[anchor](#current)",
                        "[mail](mailto:team@example.com)",
                        "[malformed](guides/current.md",
                    ],
                )
                + "\n",
                encoding="utf-8",
            )

            result = self.run_checker(root, "README.md")

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_rejects_document_paths_outside_the_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "root"
            root.mkdir()
            outside = root.parent / "outside.md"
            outside.write_text("# Outside\n", encoding="utf-8")

            result = self.run_checker(root, "../outside.md")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("../outside.md", result.stderr)
        self.assertIn("escapes repository root", result.stderr)

    def test_rejects_relative_link_traversal_after_url_decoding(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "root"
            root.mkdir()
            (root / "README.md").write_text("[outside](%2e%2e/outside.md)\n", encoding="utf-8")
            (root.parent / "outside.md").write_text("# Outside\n", encoding="utf-8")

            result = self.run_checker(root, "README.md")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("README.md:1", result.stderr)
        self.assertIn("%2e%2e/outside.md", result.stderr)
        self.assertIn("escapes repository root", result.stderr)

    def test_rejects_windows_drive_and_unc_link_targets(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "README.md").write_text(
                "[drive](C:\\outside.md)\n[unc](\\\\server\\share\\outside.md)\n",
                encoding="utf-8",
            )

            result = self.run_checker(root, "README.md")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("C:\\outside.md", result.stderr)
        self.assertIn("\\\\server\\share\\outside.md", result.stderr)
        self.assertIn("absolute local target", result.stderr)

    def test_rejects_targets_that_escape_through_a_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "root"
            root.mkdir()
            outside = root.parent / "outside"
            outside.mkdir()
            (outside / "guide.md").write_text("# Outside\n", encoding="utf-8")
            try:
                (root / "guides").symlink_to(outside, target_is_directory=True)
            except OSError as error:
                self.skipTest(f"symlink creation unavailable: {error}")
            (root / "README.md").write_text("[outside](guides/guide.md)\n", encoding="utf-8")

            result = self.run_checker(root, "README.md")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("guides/guide.md", result.stderr)
        self.assertIn("escapes repository root", result.stderr)

    def test_accepts_angle_balanced_parentheses_and_titled_destinations(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            docs = root / "docs"
            docs.mkdir()
            (docs / "a (b).md").write_text("# Parentheses\n", encoding="utf-8")
            (docs / "a(b).md").write_text("# Parentheses\n", encoding="utf-8")
            (docs / "current.md").write_text("# Current\n", encoding="utf-8")
            (root / "README.md").write_text(
                "\n".join(
                    [
                        "[angle](<docs/a (b).md>)",
                        "[balanced](docs/a(b).md)",
                        "[titled](docs/current.md \"Current guide\")",
                    ],
                )
                + "\n",
                encoding="utf-8",
            )

            result = self.run_checker(root, "README.md")

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_reports_document_decode_errors_without_a_traceback(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "README.md").write_bytes(b"\xff\xfe")

            result = self.run_checker(root, "README.md")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("README.md", result.stderr)
        self.assertIn("cannot read", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_reports_target_filesystem_errors_without_a_traceback(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            document = root / "README.md"
            document.write_text("[current](guides/current.md)\n", encoding="utf-8")

            with patch("scripts.dev.check_markdown_links.Path.exists", side_effect=OSError("filesystem unavailable")):
                errors = find_broken_links(root, ("README.md",))

        self.assertEqual(len(errors), 1)
        self.assertIn("README.md:1", errors[0])
        self.assertIn("cannot inspect local target", errors[0])


if __name__ == "__main__":
    unittest.main()
