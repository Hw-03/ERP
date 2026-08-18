"""Validate relative local Markdown links in the maintained current documents."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path, PureWindowsPath
from urllib.parse import unquote, urlsplit


DEFAULT_DOCUMENTS = (
    "README.md",
    "_attic/ONBOARDING.md",
    "_attic/docs/README.md",
    "_attic/docs/CONTEXT.md",
    "_attic/docs/GLOSSARY.md",
    "_attic/docs/ITEM_CODE_RULES.md",
    "_attic/docs/OPERATIONS.md",
    "_attic/docs/REPO_LAYOUT.md",
    "_attic/docs/ATTIC_POLICY.md",
    "_attic/docs/ERD.md",
    "_attic/docs/USER_GUIDE.md",
    "frontend/app/mes/README.md",
)


def is_absolute_local_path(value: str) -> bool:
    """Return whether a destination is an absolute POSIX, drive, or UNC path."""
    return Path(value).is_absolute() or PureWindowsPath(value).is_absolute() or value.startswith("\\\\")


def is_within_root(root: Path, path: Path) -> bool:
    """Use pathlib containment rather than unsafe string-prefix checks."""
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def resolve_within_root(root: Path, candidate: Path, display_path: str) -> tuple[Path | None, str | None]:
    """Resolve a repository path and reject traversal or symlink escapes."""
    try:
        resolved = candidate.resolve(strict=False)
    except OSError as error:
        return None, f"{display_path} -> cannot resolve local path: {error}"
    if not is_within_root(root, resolved):
        return None, f"{display_path} -> escapes repository root"
    return resolved, None


def find_closing_parenthesis(line: str, opening_index: int) -> int | None:
    """Find the Markdown link close while accepting balanced parentheses and titles."""
    depth = 1
    quote: str | None = None
    escaped = False
    for index in range(opening_index + 1, len(line)):
        char = line[index]
        if escaped:
            escaped = False
            continue
        if char == "\\":
            escaped = True
            continue
        if quote:
            if char == quote:
                quote = None
            continue
        if char in {"\"", "'"}:
            quote = char
            continue
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                return index
    return None


def parse_destination(contents: str) -> str | None:
    """Extract a destination while ignoring an optional Markdown link title."""
    contents = contents.strip()
    if not contents:
        return None
    if contents.startswith("<"):
        closing = contents.find(">", 1)
        return contents[1:closing] if closing > 1 else None

    depth = 0
    escaped = False
    for index, char in enumerate(contents):
        if escaped:
            escaped = False
            continue
        if char == "\\":
            escaped = True
        elif char == "(":
            depth += 1
        elif char == ")" and depth > 0:
            depth -= 1
        elif char.isspace() and depth == 0:
            return contents[:index]
    return contents


def markdown_destinations(markdown: str) -> list[tuple[int, str]]:
    """Return inline-link destinations, skipping images and malformed links."""
    destinations: list[tuple[int, str]] = []
    for line_number, line in enumerate(markdown.splitlines(), start=1):
        index = 0
        while index < len(line):
            label_start = line.find("[", index)
            if label_start < 0:
                break
            if label_start > 0 and line[label_start - 1] == "!":
                index = label_start + 1
                continue
            label_end = line.find("]", label_start + 1)
            if label_end < 0 or label_end + 1 >= len(line) or line[label_end + 1] != "(":
                index = label_start + 1
                continue
            closing = find_closing_parenthesis(line, label_end + 1)
            if closing is None:
                index = label_end + 2
                continue
            destination = parse_destination(line[label_end + 2:closing])
            if destination:
                destinations.append((line_number, destination))
            index = closing + 1
    return destinations


def find_broken_links(root: Path, documents: tuple[str, ...]) -> list[str]:
    """Return human-readable errors for unsafe, missing, or unreadable local links."""
    errors: list[str] = []
    try:
        root = root.resolve(strict=False)
    except OSError as error:
        return [f"repository root -> cannot resolve local path: {error}"]

    for document in documents:
        if is_absolute_local_path(document):
            errors.append(f"{document}: absolute local document path is not allowed")
            continue
        document_path, path_error = resolve_within_root(root, root / document, document)
        if path_error:
            errors.append(f"{document}: {path_error.split(' -> ', 1)[1]}")
            continue
        assert document_path is not None
        try:
            exists = document_path.is_file()
        except OSError as error:
            errors.append(f"{document}: cannot inspect maintained document: {error}")
            continue
        if not exists:
            errors.append(f"{document}: maintained document is missing")
            continue
        try:
            markdown = document_path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as error:
            errors.append(f"{document}: cannot read maintained document: {error}")
            continue

        for line_number, raw_target in markdown_destinations(markdown):
            if is_absolute_local_path(raw_target):
                errors.append(f"{document}:{line_number}: {raw_target} -> absolute local target is not allowed")
                continue
            parsed = urlsplit(raw_target)
            if not raw_target or raw_target.startswith("#") or raw_target.startswith("//") or parsed.scheme or parsed.netloc:
                continue
            path_part = unquote(parsed.path)
            if not path_part:
                continue
            resolved, path_error = resolve_within_root(root, document_path.parent / path_part, raw_target)
            if path_error:
                errors.append(f"{document}:{line_number}: {path_error}")
                continue
            assert resolved is not None
            try:
                exists = resolved.exists()
            except OSError as error:
                errors.append(f"{document}:{line_number}: {raw_target} -> cannot inspect local target: {error}")
                continue
            if not exists:
                errors.append(f"{document}:{line_number}: {raw_target} -> missing local target")
    return errors


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="repository root")
    parser.add_argument("--documents", nargs="+", default=DEFAULT_DOCUMENTS, help="maintained Markdown paths")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    errors = find_broken_links(args.root, tuple(args.documents))
    if errors:
        print("Maintained Markdown link check failed:", file=sys.stderr)
        print(*errors, sep="\n", file=sys.stderr)
        return 1
    print("Maintained Markdown links are valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
