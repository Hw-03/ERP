"""취소 원장 진단·복구·활성화 운영 CLI 안전장치."""

from __future__ import annotations

from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.ops.inventory_operation_admin import (
    CliSafetyError,
    ensure_apply_backup,
    parse_args,
)


def test_repair_command_requires_problem_id_and_approver():
    args = parse_args(
        [
            "repair",
            "--problem-id",
            "INT-ABC",
            "--approved-by",
            "관리자 김",
        ]
    )

    assert args.command == "repair"
    assert args.problem_id == "INT-ABC"
    assert args.approved_by == "관리자 김"
    assert args.apply is False


def test_apply_accepts_only_existing_validated_backup(tmp_path: Path):
    database = tmp_path / "mes.db"
    database.write_bytes(b"database")
    backup = tmp_path / "backup.db"
    backup.write_bytes(b"backup")

    resolved = ensure_apply_backup(
        database_url=f"sqlite:///{database.as_posix()}",
        validated_backup=backup,
        label="inventory-integrity-repair",
        verify=False,
    )

    assert resolved == backup.resolve()


def test_apply_rejects_missing_validated_backup(tmp_path: Path):
    with pytest.raises(CliSafetyError, match="백업"):
        ensure_apply_backup(
            database_url=f"sqlite:///{(tmp_path / 'mes.db').as_posix()}",
            validated_backup=tmp_path / "missing.db",
            label="inventory-integrity-repair",
            verify=False,
        )
