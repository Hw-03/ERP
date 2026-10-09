"""Preserve validator closure bytes and alias guards across Windows path limits."""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from scripts.ops import friday_profile_cutover as cutover  # noqa: E402


def _fixture_io(path: Path) -> Path:
    """Create long synthetic inputs independently from the helper being tested."""
    return Path("\\\\?\\" + str(path.absolute())) if os.name == "nt" else path


def _write_bundle(root: Path, files: dict[str, bytes]) -> None:
    """Write only the supplied tiny synthetic validator files."""
    for relative, content in files.items():
        destination = _fixture_io(root / relative)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)


def _expected_hash(files: dict[str, bytes]) -> str:
    """The public contract hashes relative names, lengths and complete raw bytes."""
    digest = hashlib.sha256()
    for relative, content in sorted(files.items()):
        name = relative.encode("utf-8")
        digest.update(len(name).to_bytes(4, "big"))
        digest.update(name)
        digest.update(len(content).to_bytes(8, "big"))
        digest.update(content)
    return digest.hexdigest()


def _bundle_files() -> dict[str, bytes]:
    """Satisfy the real anchor contract without importing or executing validators."""
    files = {name: ("# synthetic " + name + "\n").encode() for name in cutover.VALIDATOR_ANCHORS}
    files["backend/alembic/versions/revision.py"] = b"REVISION = 'synthetic'\n"
    return files


def test_io_path_preserves_non_windows_input(monkeypatch: pytest.MonkeyPatch) -> None:
    """Non-Windows callers retain even a relative input object unchanged."""
    relative = Path("relative/validator.py")
    monkeypatch.setattr(cutover, "os", SimpleNamespace(name="posix"))
    assert cutover._io_path(relative) is relative


@pytest.mark.skipif(os.name != "nt", reason="Windows local and UNC path syntax")
@pytest.mark.parametrize("raw,expected", [
    (r"C:\synthetic\validator.py", r"\\?\C:\synthetic\validator.py"),
    (r"\\synthetic-server\share\validator.py", r"\\?\UNC\synthetic-server\share\validator.py"),
    (r"\\?\C:\synthetic\validator.py", r"\\?\C:\synthetic\validator.py"),
    (r"\\?\UNC\synthetic-server\share\validator.py", r"\\?\UNC\synthetic-server\share\validator.py"),
])
def test_io_path_windows_prefix_is_idempotent(raw: str, expected: str) -> None:
    """Transport conversion does not inspect a local file or contact a UNC share."""
    value = cutover._io_path(Path(raw))
    assert str(value) == expected
    assert cutover._io_path(value) == value


def test_physical_preserves_plain_parent_traversal(tmp_path: Path) -> None:
    """A normal parent traversal retains the existing logical resolved path."""
    (tmp_path / "existing").mkdir()
    target = tmp_path / "member.py"
    target.write_bytes(b"# synthetic member\n")
    raw = tmp_path / "existing/../member.py"
    assert cutover._physical(raw, require_file=True) == target.resolve()
    if os.name == "nt":
        prefixed = _fixture_io(raw)
        assert cutover._physical(prefixed, require_file=True) == prefixed.resolve()


@pytest.mark.skipif(os.name != "nt", reason="Native Windows path lengths")
@pytest.mark.parametrize("geometry", ["leaf", "anchor", "deep-tree"])
def test_long_validator_closure_preserves_hash_and_guards(
    tmp_path_factory: pytest.TempPathFactory, geometry: str,
) -> None:
    """Root length cannot hide a member, change its digest or bypass validation."""
    base = tmp_path_factory.mktemp("bundle")
    short = base / "s"
    long = base / ("q" * 40)
    files = _bundle_files()
    if geometry == "anchor":
        long = base / ("q" * (240 - len(str(base)) - 1))
        member = "backend/app/services/inventory_integrity.py"
    elif geometry == "deep-tree":
        prefix = long / "backend/app"
        component = "d" * (272 - len(str(prefix)) - 1)
        member = "backend/app/" + component + "/member.py"
        assert len(str((long / member).parent)) > 260
    else:
        prefix = long / "backend/app/models"
        member = "backend/app/models/long_" + "x" * (280 - len(str(prefix)) - 1 - len("long_.py")) + ".py"
    files[member] = b"# synthetic long closure member\n"
    target = long / member
    assert len(str(short / member)) < 260 < len(str(target))
    _write_bundle(short, files)
    _write_bundle(long, files)
    ignored = _fixture_io(long / "backend/app/__pycache__/ignored.py")
    ignored.parent.mkdir(parents=True, exist_ok=True)
    ignored.write_bytes(b"excluded cache bytes")
    expected = _expected_hash(files)
    assert cutover._physical(target, require_file=True) == target.resolve()
    assert not str(cutover._physical(target, require_file=True)).startswith("\\\\?\\")
    assert cutover.validator_bundle_sha256(short) == expected
    assert cutover.validator_bundle_sha256(long) == expected
    _fixture_io(long / "existing").mkdir()
    traversal_roots = (long / "existing/..", _fixture_io(long) / "existing/..")
    for code_root in traversal_roots:
        assert cutover.validator_bundle_sha256(code_root) == expected

    # Exercise the real recovery consumer; this reads code files, never a DB.
    from scripts.ops import employee_release_recovery as recovery

    assert recovery._validator_hash(short) == recovery._validator_hash(long)
    changed = {**files, member: files[member] + b"# changed\n"}
    _fixture_io(target).write_bytes(changed[member])
    assert cutover.validator_bundle_sha256(long) == _expected_hash(changed) != expected
    for code_root in traversal_roots:
        assert cutover.validator_bundle_sha256(code_root) == _expected_hash(changed)
    assert cutover.validator_bundle_sha256(short) == expected
    _fixture_io(long / cutover.VALIDATOR_ANCHORS[0]).unlink()
    with pytest.raises(cutover.CutoverAdmissionError, match="validator bundle is incomplete"):
        cutover.validator_bundle_sha256(long)
    for code_root in traversal_roots:
        with pytest.raises(cutover.CutoverAdmissionError, match="validator bundle is incomplete"):
            cutover.validator_bundle_sha256(code_root)
    with pytest.raises(cutover.CutoverAdmissionError, match="required file is missing"):
        cutover._physical(target.parent / "missing.py", require_file=True)
    with pytest.raises(cutover.CutoverAdmissionError, match="required file is missing"):
        cutover._physical(target.parent, require_file=True)


@pytest.mark.skipif(os.name != "nt", reason="Native Windows junction contract")
@pytest.mark.parametrize("route", ["direct", "parent-before", "prefixed-parent-before", "parent-after"])
def test_validator_bundle_refuses_a_real_junction(tmp_path: Path, route: str) -> None:
    """A transport prefix must not resolve an alias before the ancestor guard."""
    root = tmp_path / "validator"
    files = _bundle_files()
    _write_bundle(root, files)
    original, outside = root / "backend/app", tmp_path / "outside-app"
    assert original.resolve().is_relative_to(tmp_path.resolve())
    assert outside.resolve().is_relative_to(tmp_path.resolve())
    original.rename(outside)
    result = subprocess.run(["cmd.exe", "/d", "/c", "mklink", "/J", str(original), str(outside)], capture_output=True)
    assert result.returncode == 0, result.stderr
    try:
        member = original / "services/inventory_integrity.py"
        if route in {"parent-before", "prefixed-parent-before"}:
            (original.parent / "existing").mkdir()
            member = original.parent / "existing/../app/services/inventory_integrity.py"
            if route == "prefixed-parent-before":
                member = _fixture_io(member)
        elif route == "parent-after":
            member = original / "../app/services/inventory_integrity.py"
        with pytest.raises(cutover.CutoverAdmissionError, match="linked paths are not allowed"):
            cutover._physical(member, require_file=True)
        with pytest.raises(cutover.CutoverAdmissionError, match="linked paths are not allowed"):
            cutover.validator_bundle_sha256(root)
        assert (outside / "services/inventory_integrity.py").read_bytes() == files["backend/app/services/inventory_integrity.py"]
    finally:
        original.rmdir()


def test_physical_refuses_a_real_symlink(tmp_path: Path) -> None:
    """Logical aliases remain forbidden even though the target is a real file."""
    target, alias = tmp_path / "real.py", tmp_path / "alias.py"
    target.write_bytes(b"# synthetic target\n")
    try:
        alias.symlink_to(target)
    except OSError as error:
        if os.name == "nt" and error.winerror == 1314:
            pytest.skip("Creating a native Windows symlink requires permission")
        raise
    try:
        with pytest.raises(cutover.CutoverAdmissionError, match="linked paths are not allowed"):
            cutover._physical(alias, require_file=True)
    finally:
        alias.unlink()
