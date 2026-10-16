"""실제 install_code의 긴 격리 경로와 원복을 작은 합성 파일로 검사한다."""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from test_employee_code_release import _fixture, release


@pytest.mark.skipif(os.name != "nt", reason="실제 Windows rename 경로 계약")
@pytest.mark.parametrize("fail_after_quarantine", [False, True])
def test_retired_code_moves_to_long_quarantine_and_restores(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, fail_after_quarantine: bool,
) -> None:
    """정상 설치와 격리 이후 실패 모두 기존 바이트·메타데이터·DB를 보존한다."""
    source, employee, old_record, manifest = _fixture(tmp_path)
    recovery = old_record.parent.with_name("a" * 32)
    old_record.parent.rename(recovery)
    record = recovery / "journal.json"
    prefix = Path(".mypy_cache/3.11/app/repositories")
    target_prefix = recovery / "superseded-code/backend" / prefix
    leaf = "item_" + "x" * max(1, 264 - len(str(target_prefix)) - 1 - len("item_.meta.json")) + ".meta.json"
    relative = (prefix / leaf).as_posix()
    old_file = employee / "backend" / relative
    quarantined = recovery / "superseded-code/backend" / relative
    assert len(str(old_file)) < 260 < len(str(quarantined))
    assert len(str(target_prefix)) < 248
    old_file.parent.mkdir(parents=True, exist_ok=True)
    old_file.write_bytes(b"synthetic old code metadata")
    os.utime(old_file, (1700000000, 1700000000))
    metadata = old_file.stat().st_mtime_ns, old_file.stat().st_mode
    before = release._code_files(employee)
    journal = json.loads(record.read_text())
    journal["code_backups"]["backend"] = before["backend"]
    release._copy_files(employee / "backend", recovery / "old-backend", before["backend"])
    release._json(record, journal)
    original_copy = release._copy_files

    def copy_with_failure(origin: Path, target: Path, files: dict[str, str]) -> None:
        """실제 rename 완료 후에만 실패를 주입한다."""
        if fail_after_quarantine and origin == source / "backend":
            assert release._copy_io_path(quarantined).read_bytes() == b"synthetic old code metadata"
            raise OSError("synthetic failure after successful quarantine")
        original_copy(origin, target, files)

    monkeypatch.setattr(release, "_copy_files", copy_with_failure)
    if fail_after_quarantine:
        with pytest.raises(OSError, match="after successful quarantine"):
            release.install_code(source, record, employee, manifest)
    else:
        release.install_code(source, record, employee, manifest)
        moved = release._copy_io_path(quarantined)
        assert moved.read_bytes() == b"synthetic old code metadata"
        assert (moved.stat().st_mtime_ns, moved.stat().st_mode) == metadata
        assert not old_file.exists()
        release.verify_code(employee, manifest)
        release.rollback(record, employee)
    assert release._code_files(employee) == before
    assert old_file.read_bytes() == b"synthetic old code metadata"
    assert (old_file.stat().st_mtime_ns, old_file.stat().st_mode) == metadata
    assert (employee / "backend/mes.db").read_bytes() == b"employee database"
    assert (employee / "backend/.env").read_bytes() == b"employee settings"
    assert json.loads(record.read_text())["phase"] == "ROLLED_BACK"
