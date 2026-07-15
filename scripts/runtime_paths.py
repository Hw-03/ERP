"""Resolve permanent DEXCOWIN MES runtime artifact paths."""

from __future__ import annotations

import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RUNTIME_ROOT = PROJECT_ROOT / "_attic" / "runtime"


class RuntimePathError(ValueError):
    """Raised before an artifact path can escape MES_RUNTIME_ROOT."""


def runtime_root() -> Path:
    """Return the absolute runtime root, resolving relative overrides from the repo root."""
    configured = os.environ.get("MES_RUNTIME_ROOT")
    root = Path(configured).expanduser() if configured else DEFAULT_RUNTIME_ROOT
    if not root.is_absolute():
        root = PROJECT_ROOT / root
    return root.resolve()


def runtime_path(*parts: str, create: bool = False) -> Path:
    """Return a contained runtime path and optionally create it after validation."""
    root = runtime_root()
    candidate = root.joinpath(*parts).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise RuntimePathError(f"runtime path is outside MES_RUNTIME_ROOT: {candidate}") from exc
    if create:
        candidate.mkdir(parents=True, exist_ok=True)
    return candidate
