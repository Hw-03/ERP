"""공백 구간 품목 코드 재번호 도구의 회귀 테스트."""

from __future__ import annotations

import importlib.util
import sqlite3
import sys
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parents[3] / "scripts" / "dev" / "renumber_gap_item_codes.py"

RENAMES = [
    ("6", "AR", 719, 365),
    ("6", "AR", 720, 366),
    ("6", "AR", 721, 367),
    ("348", "AR", 722, 368),
    ("348", "AR", 723, 369),
    ("4", "AR", 724, 370),
    ("3", "AR", 725, 371),
    ("8", "AR", 726, 372),
    ("8", "AR", 727, 373),
    ("8", "AR", 728, 374),
    ("6", "PR", 369, 285),
    ("6", "PR", 370, 286),
    ("6", "PR", 371, 287),
    ("6", "PR", 372, 288),
    ("6", "PR", 373, 289),
    ("3", "PR", 374, 290),
    ("3", "PR", 375, 291),
    ("8", "PR", 376, 292),
    ("8", "PR", 377, 293),
]

PR_CONTIGUOUS_RENAMES = [
    ("3", "PR", 228, 185),
    ("3", "PR", 229, 186),
    ("3", "PR", 230, 187),
    ("3", "PR", 231, 188),
    ("34678", "PR", 277, 189),
    ("34678", "PR", 278, 190),
    ("34678", "PR", 279, 191),
    ("34678", "PR", 280, 192),
    ("34678", "PR", 281, 193),
    ("34678", "PR", 282, 194),
    ("34678", "PR", 283, 195),
    ("34678", "PR", 284, 196),
    ("6", "PR", 285, 197),
    ("6", "PR", 286, 198),
    ("6", "PR", 287, 199),
    ("6", "PR", 288, 200),
    ("6", "PR", 289, 201),
    ("3", "PR", 290, 202),
    ("3", "PR", 291, 203),
    ("8", "PR", 292, 204),
    ("8", "PR", 293, 205),
]


def _load_subject():
    spec = importlib.util.spec_from_file_location("renumber_gap_item_codes", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("재번호 스크립트를 불러올 수 없습니다.")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
    finally:
        sys.modules.pop(spec.name, None)
    return module


def _code(model_symbol: str, process_type: str, serial_no: int) -> str:
    return f"{model_symbol}-{process_type}-{serial_no:04d}"


def _create_database(path: Path) -> dict[str, str]:
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        PRAGMA foreign_keys = ON;
        CREATE TABLE items (
            item_id TEXT PRIMARY KEY,
            item_name TEXT NOT NULL,
            model_symbol TEXT NOT NULL,
            process_type_code TEXT NOT NULL,
            serial_no INTEGER NOT NULL,
            deleted_at TEXT,
            mes_code TEXT GENERATED ALWAYS AS (
                model_symbol || '-' || process_type_code || '-' || printf('%04d', serial_no)
            ) STORED UNIQUE
        );
        CREATE TABLE bom (
            bom_id TEXT PRIMARY KEY,
            parent_item_id TEXT NOT NULL REFERENCES items(item_id),
            child_item_id TEXT NOT NULL REFERENCES items(item_id),
            quantity INTEGER NOT NULL
        );
        CREATE TABLE io_lines (
            line_id TEXT PRIMARY KEY,
            item_id TEXT NOT NULL REFERENCES items(item_id),
            mes_code_snapshot TEXT
        );
        CREATE TABLE stock_request_lines (
            line_id TEXT PRIMARY KEY,
            item_id TEXT NOT NULL REFERENCES items(item_id),
            mes_code_snapshot TEXT
        );
        CREATE TABLE handover_lines (
            line_id TEXT PRIMARY KEY,
            item_id TEXT NOT NULL REFERENCES items(item_id),
            mes_code_snapshot TEXT
        );
        """
    )
    item_ids: dict[str, str] = {}
    for index, (symbol, process_type, old_serial, _) in enumerate(RENAMES, start=1):
        item_id = f"item-{index}"
        old_code = _code(symbol, process_type, old_serial)
        item_ids[old_code] = item_id
        conn.execute(
            "INSERT INTO items (item_id, item_name, model_symbol, process_type_code, serial_no) VALUES (?, ?, ?, ?, ?)",
            (item_id, old_code, symbol, process_type, old_serial),
        )

    parent_id = item_ids["6-AR-0719"]
    child_id = item_ids["3-PR-0375"]
    conn.execute("INSERT INTO bom VALUES (?, ?, ?, ?)", ("bom-1", parent_id, child_id, 2))
    for table in ("io_lines", "stock_request_lines", "handover_lines"):
        conn.execute(
            f"INSERT INTO {table} VALUES (?, ?, ?)",
            (f"{table}-1", child_id, "3-PR-0375"),
        )
    conn.commit()
    conn.close()
    return item_ids


def _create_pr_gap_database(path: Path) -> dict[str, str]:
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        PRAGMA foreign_keys = ON;
        CREATE TABLE items (
            item_id TEXT PRIMARY KEY,
            item_name TEXT NOT NULL,
            model_symbol TEXT NOT NULL,
            process_type_code TEXT NOT NULL,
            serial_no INTEGER NOT NULL,
            deleted_at TEXT,
            mes_code TEXT GENERATED ALWAYS AS (
                model_symbol || '-' || process_type_code || '-' || printf('%04d', serial_no)
            ) STORED UNIQUE
        );
        CREATE TABLE bom (
            bom_id TEXT PRIMARY KEY,
            parent_item_id TEXT NOT NULL REFERENCES items(item_id),
            child_item_id TEXT NOT NULL REFERENCES items(item_id),
            quantity INTEGER NOT NULL
        );
        CREATE TABLE io_lines (
            line_id TEXT PRIMARY KEY,
            item_id TEXT NOT NULL REFERENCES items(item_id),
            mes_code_snapshot TEXT
        );
        CREATE TABLE stock_request_lines (
            line_id TEXT PRIMARY KEY,
            item_id TEXT NOT NULL REFERENCES items(item_id),
            mes_code_snapshot TEXT
        );
        CREATE TABLE handover_lines (
            line_id TEXT PRIMARY KEY,
            item_id TEXT NOT NULL REFERENCES items(item_id),
            mes_code_snapshot TEXT
        );
        """
    )
    item_ids: dict[str, str] = {}
    for serial_no in range(1, 185):
        item_id = f"stable-{serial_no}"
        conn.execute(
            "INSERT INTO items (item_id, item_name, model_symbol, process_type_code, serial_no) VALUES (?, ?, ?, ?, ?)",
            (item_id, item_id, "6", "PR", serial_no),
        )
    for index, (symbol, process_type, old_serial, _) in enumerate(PR_CONTIGUOUS_RENAMES, start=1):
        item_id = f"renumber-{index}"
        old_code = _code(symbol, process_type, old_serial)
        item_ids[old_code] = item_id
        conn.execute(
            "INSERT INTO items (item_id, item_name, model_symbol, process_type_code, serial_no) VALUES (?, ?, ?, ?, ?)",
            (item_id, old_code, symbol, process_type, old_serial),
        )
    parent_id = "stable-1"
    child_id = item_ids["3-PR-0291"]
    conn.execute("INSERT INTO bom VALUES (?, ?, ?, ?)", ("pr-bom", parent_id, child_id, 2))
    for table in ("io_lines", "stock_request_lines", "handover_lines"):
        conn.execute(
            f"INSERT INTO {table} VALUES (?, ?, ?)",
            (f"pr-{table}", child_id, "3-PR-0291"),
        )
    conn.commit()
    conn.close()
    return item_ids


def test_apply_renumber_updates_codes_and_snapshots_without_changing_bom_item_ids(tmp_path: Path) -> None:
    database_path = tmp_path / "mes.db"
    original_item_ids = _create_database(database_path)

    subject = _load_subject()
    report = subject.renumber_database(database_path, apply=True, backup_dir=tmp_path / "backup")

    assert report.applied is True
    assert report.renamed_count == 19
    conn = sqlite3.connect(database_path)
    try:
        for symbol, process_type, old_serial, new_serial in RENAMES:
            old_code = _code(symbol, process_type, old_serial)
            new_code = _code(symbol, process_type, new_serial)
            row = conn.execute("SELECT item_id FROM items WHERE mes_code = ?", (new_code,)).fetchone()
            assert row == (original_item_ids[old_code],)
            assert conn.execute("SELECT 1 FROM items WHERE mes_code = ?", (old_code,)).fetchone() is None

        assert conn.execute("SELECT parent_item_id, child_item_id, quantity FROM bom").fetchall() == [
            (original_item_ids["6-AR-0719"], original_item_ids["3-PR-0375"], 2)
        ]
        for table in ("io_lines", "stock_request_lines", "handover_lines"):
            assert conn.execute(f"SELECT mes_code_snapshot FROM {table}").fetchall() == [("3-PR-0291",)]
    finally:
        conn.close()


def test_preview_does_not_change_database_or_create_backup(tmp_path: Path) -> None:
    database_path = tmp_path / "mes.db"
    _create_database(database_path)
    before_bytes = database_path.read_bytes()

    subject = _load_subject()
    report = subject.renumber_database(database_path, apply=False, backup_dir=tmp_path / "backup")

    assert report.applied is False
    assert report.renamed_count == 19
    assert report.backup_path is None
    assert database_path.read_bytes() == before_bytes
    assert not (tmp_path / "backup").exists()


def test_apply_refuses_occupied_target_code_without_changing_database(tmp_path: Path) -> None:
    database_path = tmp_path / "mes.db"
    _create_database(database_path)
    conn = sqlite3.connect(database_path)
    conn.execute(
        "INSERT INTO items (item_id, item_name, model_symbol, process_type_code, serial_no) VALUES (?, ?, ?, ?, ?)",
        ("blocked", "blocked", "6", "AR", 365),
    )
    conn.commit()
    conn.close()
    before_bytes = database_path.read_bytes()

    subject = _load_subject()
    with pytest.raises(ValueError, match="이미 사용 중"):
        subject.renumber_database(database_path, apply=True, backup_dir=tmp_path / "backup")

    assert database_path.read_bytes() == before_bytes
    assert not (tmp_path / "backup").exists()


def test_apply_refuses_missing_target_without_changing_database(tmp_path: Path) -> None:
    database_path = tmp_path / "mes.db"
    _create_database(database_path)
    conn = sqlite3.connect(database_path)
    conn.execute("DELETE FROM items WHERE mes_code = ?", ("8-PR-0377",))
    conn.commit()
    conn.close()
    before_bytes = database_path.read_bytes()

    subject = _load_subject()
    with pytest.raises(ValueError, match="누락"):
        subject.renumber_database(database_path, apply=True, backup_dir=tmp_path / "backup")

    assert database_path.read_bytes() == before_bytes
    assert not (tmp_path / "backup").exists()


def test_apply_normalizes_all_historical_snapshots_for_a_renumbered_item(tmp_path: Path) -> None:
    database_path = tmp_path / "mes.db"
    item_ids = _create_database(database_path)
    conn = sqlite3.connect(database_path)
    conn.execute(
        "INSERT INTO io_lines VALUES (?, ?, ?)",
        ("io-unrelated-history", item_ids["348-AR-0723"], "348-AR-0003"),
    )
    conn.commit()
    conn.close()

    subject = _load_subject()
    subject.renumber_database(database_path, apply=True, backup_dir=tmp_path / "backup")

    conn = sqlite3.connect(database_path)
    try:
        assert conn.execute(
            "SELECT mes_code_snapshot FROM io_lines WHERE line_id = ?", ("io-unrelated-history",)
        ).fetchone() == ("348-AR-0369",)
    finally:
        conn.close()


def test_apply_can_be_rerun_to_normalize_snapshot_after_item_codes_are_already_renumbered(tmp_path: Path) -> None:
    database_path = tmp_path / "mes.db"
    item_ids = _create_database(database_path)
    subject = _load_subject()
    subject.renumber_database(database_path, apply=True, backup_dir=tmp_path / "first-backup")

    conn = sqlite3.connect(database_path)
    conn.execute(
        "INSERT INTO stock_request_lines VALUES (?, ?, ?)",
        ("late-history", item_ids["348-AR-0723"], "348-AR-0003"),
    )
    conn.commit()
    conn.close()

    report = subject.renumber_database(database_path, apply=True, backup_dir=tmp_path / "second-backup")

    assert report.applied is True
    conn = sqlite3.connect(database_path)
    try:
        assert conn.execute(
            "SELECT mes_code_snapshot FROM stock_request_lines WHERE line_id = ?", ("late-history",)
        ).fetchone() == ("348-AR-0369",)
    finally:
        conn.close()


def test_apply_pr_contiguous_plan_compacts_205_items_and_preserves_bom_item_ids(tmp_path: Path) -> None:
    database_path = tmp_path / "mes.db"
    item_ids = _create_pr_gap_database(database_path)

    subject = _load_subject()
    report = subject.renumber_database(
        database_path,
        renames=tuple(subject.Rename(*rename) for rename in PR_CONTIGUOUS_RENAMES),
        plan_name="pr-contiguous",
        apply=True,
        backup_dir=tmp_path / "backup",
    )

    assert report.renamed_count == 21
    conn = sqlite3.connect(database_path)
    try:
        assert [row[0] for row in conn.execute(
            "SELECT serial_no FROM items WHERE process_type_code = 'PR' ORDER BY serial_no"
        )] == list(range(1, 206))
        assert conn.execute("SELECT parent_item_id, child_item_id, quantity FROM bom").fetchall() == [
            ("stable-1", item_ids["3-PR-0291"], 2)
        ]
        for table in ("io_lines", "stock_request_lines", "handover_lines"):
            assert conn.execute(f"SELECT mes_code_snapshot FROM {table}").fetchall() == [("3-PR-0203",)]
    finally:
        conn.close()


def test_pr_contiguous_plan_rejects_process_serial_collision_before_creating_backup(tmp_path: Path) -> None:
    database_path = tmp_path / "mes.db"
    _create_pr_gap_database(database_path)
    conn = sqlite3.connect(database_path)
    conn.execute(
        "INSERT INTO items (item_id, item_name, model_symbol, process_type_code, serial_no) VALUES (?, ?, ?, ?, ?)",
        ("conflicting-pr-185", "conflicting-pr-185", "6", "PR", 185),
    )
    conn.commit()
    conn.close()
    before_bytes = database_path.read_bytes()

    subject = _load_subject()
    with pytest.raises(ValueError, match="일련번호가 이미 사용"):
        subject.renumber_database(
            database_path,
            renames=tuple(subject.Rename(*rename) for rename in PR_CONTIGUOUS_RENAMES),
            plan_name="pr-contiguous",
            apply=True,
            backup_dir=tmp_path / "backup",
        )

    assert database_path.read_bytes() == before_bytes
    assert not (tmp_path / "backup").exists()


def _create_full_renumber_database(path: Path) -> dict[str, str]:
    item_ids = _create_pr_gap_database(path)
    conn = sqlite3.connect(path)
    try:
        conn.execute("DELETE FROM bom")
        for table in ("io_lines", "stock_request_lines", "handover_lines"):
            conn.execute(f"DELETE FROM {table}")
        intermediate_codes = [
            _code(symbol, process_type, new_serial)
            for symbol, process_type, _, new_serial in RENAMES
            if process_type == "PR"
        ]
        conn.execute(
            f"DELETE FROM items WHERE mes_code IN ({', '.join('?' for _ in intermediate_codes)})",
            intermediate_codes,
        )
        for code in intermediate_codes:
            item_ids.pop(code)
        for index, (symbol, process_type, old_serial, _) in enumerate(RENAMES, start=1):
            item_id = f"gap-{index}"
            old_code = _code(symbol, process_type, old_serial)
            item_ids[old_code] = item_id
            conn.execute(
                "INSERT INTO items (item_id, item_name, model_symbol, process_type_code, serial_no) VALUES (?, ?, ?, ?, ?)",
                (item_id, old_code, symbol, process_type, old_serial),
            )
        conn.execute(
            "INSERT INTO bom VALUES (?, ?, ?, ?)",
            ("rollback-bom", item_ids["6-AR-0719"], item_ids["8-PR-0377"], 2),
        )
        for table in ("io_lines", "stock_request_lines", "handover_lines"):
            conn.execute(
                f"INSERT INTO {table} VALUES (?, ?, ?)",
                (f"rollback-{table}", item_ids["8-PR-0377"], "8-PR-0377"),
            )
        conn.commit()
    finally:
        conn.close()
    return item_ids


def test_full_rollback_plan_restores_original_codes_and_snapshots(tmp_path: Path) -> None:
    database_path = tmp_path / "mes.db"
    original_item_ids = _create_full_renumber_database(database_path)
    subject = _load_subject()

    subject.renumber_database(
        database_path,
        renames=subject.AR_PR_GAP_RENAMES,
        plan_name="ar-pr-gap",
        apply=True,
        backup_dir=tmp_path / "forward-gap",
    )
    subject.renumber_database(
        database_path,
        renames=subject.PR_CONTIGUOUS_RENAMES,
        plan_name="pr-contiguous",
        apply=True,
        backup_dir=tmp_path / "forward-pr",
    )

    report = subject.renumber_database(
        database_path,
        renames=subject.FULL_ROLLBACK_RENAMES,
        plan_name="full-rollback",
        apply=True,
        backup_dir=tmp_path / "rollback",
    )

    assert report.applied is True
    assert report.renamed_count == 31
    conn = sqlite3.connect(database_path)
    try:
        for rename in subject.FULL_ROLLBACK_RENAMES:
            assert conn.execute("SELECT item_id FROM items WHERE mes_code = ?", (rename.new_code,)).fetchone() == (
                original_item_ids[rename.new_code],
            )
            assert conn.execute("SELECT 1 FROM items WHERE mes_code = ?", (rename.old_code,)).fetchone() is None
        assert conn.execute("SELECT parent_item_id, child_item_id, quantity FROM bom").fetchall() == [
            (original_item_ids["6-AR-0719"], original_item_ids["8-PR-0377"], 2)
        ]
        for table in ("io_lines", "stock_request_lines", "handover_lines"):
            assert conn.execute(f"SELECT mes_code_snapshot FROM {table} WHERE line_id = ?", (f"rollback-{table}",)).fetchone() == (
                "8-PR-0377",
            )
    finally:
        conn.close()
