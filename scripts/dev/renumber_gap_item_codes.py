"""AR·PR 공백 이후 품목 코드를 안전하게 연속 번호로 재배정한다.

기본 실행은 읽기 전용 점검이다. 실제 변경은 ``--apply``를 명시해야 하며,
변경 전 SQLite 백업을 생성하고 모든 검증이 통과한 하나의 트랜잭션만 커밋한다.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable


PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.ops.maintenance_backup import create_sqlite_snapshot  # noqa: E402
from scripts.runtime_paths import runtime_path  # noqa: E402


@dataclass(frozen=True)
class Rename:
    model_symbol: str
    process_type_code: str
    old_serial_no: int
    new_serial_no: int

    @property
    def old_code(self) -> str:
        return f"{self.model_symbol}-{self.process_type_code}-{self.old_serial_no:04d}"

    @property
    def new_code(self) -> str:
        return f"{self.model_symbol}-{self.process_type_code}-{self.new_serial_no:04d}"


AR_PR_GAP_RENAMES: tuple[Rename, ...] = (
    Rename("6", "AR", 719, 365),
    Rename("6", "AR", 720, 366),
    Rename("6", "AR", 721, 367),
    Rename("348", "AR", 722, 368),
    Rename("348", "AR", 723, 369),
    Rename("4", "AR", 724, 370),
    Rename("3", "AR", 725, 371),
    Rename("8", "AR", 726, 372),
    Rename("8", "AR", 727, 373),
    Rename("8", "AR", 728, 374),
    Rename("6", "PR", 369, 285),
    Rename("6", "PR", 370, 286),
    Rename("6", "PR", 371, 287),
    Rename("6", "PR", 372, 288),
    Rename("6", "PR", 373, 289),
    Rename("3", "PR", 374, 290),
    Rename("3", "PR", 375, 291),
    Rename("8", "PR", 376, 292),
    Rename("8", "PR", 377, 293),
)

PR_CONTIGUOUS_RENAMES: tuple[Rename, ...] = (
    Rename("3", "PR", 228, 185),
    Rename("3", "PR", 229, 186),
    Rename("3", "PR", 230, 187),
    Rename("3", "PR", 231, 188),
    Rename("34678", "PR", 277, 189),
    Rename("34678", "PR", 278, 190),
    Rename("34678", "PR", 279, 191),
    Rename("34678", "PR", 280, 192),
    Rename("34678", "PR", 281, 193),
    Rename("34678", "PR", 282, 194),
    Rename("34678", "PR", 283, 195),
    Rename("34678", "PR", 284, 196),
    Rename("6", "PR", 285, 197),
    Rename("6", "PR", 286, 198),
    Rename("6", "PR", 287, 199),
    Rename("6", "PR", 288, 200),
    Rename("6", "PR", 289, 201),
    Rename("3", "PR", 290, 202),
    Rename("3", "PR", 291, 203),
    Rename("8", "PR", 292, 204),
    Rename("8", "PR", 293, 205),
)


def _build_full_rollback_renames() -> tuple[Rename, ...]:
    """Compose the 31 original code assignments from the two forward renumber plans."""
    original_pr_serial_by_intermediate_code = {
        (rename.model_symbol, rename.process_type_code, rename.new_serial_no): rename.old_serial_no
        for rename in AR_PR_GAP_RENAMES
        if rename.process_type_code == "PR"
    }
    ar_rollbacks = tuple(
        Rename(
            rename.model_symbol,
            rename.process_type_code,
            rename.new_serial_no,
            rename.old_serial_no,
        )
        for rename in AR_PR_GAP_RENAMES
        if rename.process_type_code == "AR"
    )
    pr_rollbacks = tuple(
        Rename(
            rename.model_symbol,
            rename.process_type_code,
            rename.new_serial_no,
            original_pr_serial_by_intermediate_code.get(
                (rename.model_symbol, rename.process_type_code, rename.old_serial_no),
                rename.old_serial_no,
            ),
        )
        for rename in PR_CONTIGUOUS_RENAMES
    )
    return ar_rollbacks + pr_rollbacks


FULL_ROLLBACK_RENAMES = _build_full_rollback_renames()

RENAMES_BY_PLAN = {
    "ar-pr-gap": AR_PR_GAP_RENAMES,
    "pr-contiguous": PR_CONTIGUOUS_RENAMES,
    "full-rollback": FULL_ROLLBACK_RENAMES,
}

SNAPSHOT_TABLES = ("io_lines", "stock_request_lines", "handover_lines")


@dataclass(frozen=True)
class RenumberReport:
    applied: bool
    renamed_count: int
    snapshot_updated_count: int
    bom_edge_count: int
    backup_path: str | None


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (table_name,)
    ).fetchone()
    return row is not None


def _placeholders(values: Iterable[object]) -> str:
    return ", ".join("?" for _ in values)


def _load_target_items(conn: sqlite3.Connection, renames: tuple[Rename, ...]) -> dict[str, str]:
    item_ids: dict[str, str] = {}
    for rename in renames:
        rows = conn.execute(
            """
            SELECT item_id, model_symbol, process_type_code, serial_no, mes_code, deleted_at
            FROM items
            WHERE mes_code IN (?, ?)
            """,
            (rename.old_code, rename.new_code),
        ).fetchall()
        if not rows:
            raise ValueError(f"재번호 대상 품목이 누락되었습니다: {rename.old_code}")
        if len(rows) > 1:
            raise ValueError(f"새 품목 코드가 이미 사용 중입니다: {rename.new_code}")
        item_id, model_symbol, process_type, serial_no, mes_code, deleted_at = rows[0]
        if (model_symbol, process_type, serial_no, mes_code, deleted_at) not in (
            (
                rename.model_symbol,
                rename.process_type_code,
                rename.old_serial_no,
                rename.old_code,
                None,
            ),
            (
                rename.model_symbol,
                rename.process_type_code,
                rename.new_serial_no,
                rename.new_code,
                None,
            ),
        ):
            raise ValueError(f"재번호 대상의 현재 상태가 예상과 다릅니다: {rename.old_code}")
        item_ids[rename.old_code] = item_id
    return item_ids


def _validate_target_codes_are_free(
    conn: sqlite3.Connection, item_ids: dict[str, str], renames: tuple[Rename, ...]
) -> None:
    new_codes = [rename.new_code for rename in renames]
    rows = conn.execute(
        f"SELECT item_id, mes_code FROM items WHERE mes_code IN ({_placeholders(new_codes)})", new_codes
    ).fetchall()
    expected_item_ids = {rename.new_code: item_ids[rename.old_code] for rename in renames}
    occupied = sorted(
        mes_code for item_id, mes_code in rows if expected_item_ids.get(mes_code) != item_id
    )
    if occupied:
        raise ValueError(f"새 품목 코드가 이미 사용 중입니다: {occupied}")

    for rename in renames:
        assigned_item_ids = {
            row[0]
            for row in conn.execute(
                "SELECT item_id FROM items WHERE process_type_code = ? AND serial_no = ?",
                (rename.process_type_code, rename.new_serial_no),
            ).fetchall()
        }
        expected_item_id = item_ids[rename.old_code]
        if assigned_item_ids and assigned_item_ids != {expected_item_id}:
            raise ValueError(
                f"{rename.process_type_code} 일련번호가 이미 사용 중입니다: {rename.new_serial_no}"
            )


def _bom_edges(conn: sqlite3.Connection, item_ids: Iterable[str]) -> list[tuple[object, ...]]:
    if not _table_exists(conn, "bom"):
        return []
    ids = list(item_ids)
    return conn.execute(
        f"""
        SELECT bom_id, parent_item_id, child_item_id, quantity
        FROM bom
        WHERE parent_item_id IN ({_placeholders(ids)}) OR child_item_id IN ({_placeholders(ids)})
        ORDER BY bom_id
        """,
        ids + ids,
    ).fetchall()


def _assert_integrity(
    conn: sqlite3.Connection,
    item_ids: dict[str, str],
    before_bom_edges: list[tuple[object, ...]],
    renames: tuple[Rename, ...],
) -> None:
    for rename in renames:
        row = conn.execute("SELECT item_id FROM items WHERE mes_code = ?", (rename.new_code,)).fetchone()
        if row != (item_ids[rename.old_code],):
            raise ValueError(f"재번호 결과가 올바르지 않습니다: {rename.new_code}")
        if conn.execute("SELECT 1 FROM items WHERE mes_code = ?", (rename.old_code,)).fetchone():
            raise ValueError(f"이전 품목 코드가 남아 있습니다: {rename.old_code}")

    after_bom_edges = _bom_edges(conn, item_ids.values())
    if after_bom_edges != before_bom_edges:
        raise ValueError("BOM 연결이 변경되었습니다.")

    snapshot_updated_count = 0
    for table_name in SNAPSHOT_TABLES:
        if not _table_exists(conn, table_name):
            continue
        for rename in renames:
            unexpected = conn.execute(
                f"""
                SELECT COUNT(*) FROM {table_name}
                WHERE item_id = ? AND mes_code_snapshot IS NOT NULL AND mes_code_snapshot != ?
                """,
                (item_ids[rename.old_code], rename.new_code),
            ).fetchone()[0]
            if unexpected:
                raise ValueError(f"{table_name}의 품목 코드 스냅샷이 새 코드로 통일되지 않았습니다.")

    for rename in renames:
        count = conn.execute(
            "SELECT COUNT(*) FROM items WHERE process_type_code = ? AND serial_no = ?",
            (rename.process_type_code, rename.new_serial_no),
        ).fetchone()[0]
        if count != 1:
            raise ValueError(
                f"{rename.process_type_code} 일련번호가 유일하지 않습니다: {rename.new_serial_no}"
            )

    integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity != "ok":
        raise ValueError(f"SQLite 무결성 검사 실패: {integrity}")
    foreign_keys = conn.execute("PRAGMA foreign_key_check").fetchall()
    if foreign_keys:
        raise ValueError(f"외래 키 검사 실패: {foreign_keys}")
def _create_backup(database_path: Path, plan_name: str) -> Path:
    """Create a pre-renumber snapshot in the permanent runtime tree."""
    return create_sqlite_snapshot(database_path, f"renumber-{plan_name}")


def _write_report(
    report_dir: Path, report: RenumberReport, plan_name: str, renames: tuple[Rename, ...]
) -> None:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    report_path = report_dir / f"{plan_name}-renumber-report-{timestamp}.json"
    report_path.write_text(
        json.dumps(
            {
                "plan": plan_name,
                "report": asdict(report),
                "renames": [asdict(rename) for rename in renames],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def renumber_database(
    database_path: Path,
    *,
    renames: tuple[Rename, ...] = AR_PR_GAP_RENAMES,
    plan_name: str = "ar-pr-gap",
    apply: bool,
) -> RenumberReport:
    """점검하거나, 명시적으로 요청된 경우에만 지정된 품목 코드를 재번호한다."""
    database_path = Path(database_path)
    if not database_path.is_file():
        raise FileNotFoundError(f"DB 파일을 찾을 수 없습니다: {database_path}")

    conn = sqlite3.connect(database_path)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        item_ids = _load_target_items(conn, renames)
        _validate_target_codes_are_free(conn, item_ids, renames)
        before_bom_edges = _bom_edges(conn, item_ids.values())
        if not apply:
            return RenumberReport(
                applied=False,
                renamed_count=len(renames),
                snapshot_updated_count=0,
                bom_edge_count=len(before_bom_edges),
                backup_path=None,
            )
    finally:
        conn.close()

    backup_path = _create_backup(database_path, plan_name)
    conn = sqlite3.connect(database_path)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        conn.execute("BEGIN IMMEDIATE")
        item_ids = _load_target_items(conn, renames)
        _validate_target_codes_are_free(conn, item_ids, renames)
        before_bom_edges = _bom_edges(conn, item_ids.values())

        snapshot_updated_count = 0
        for rename in renames:
            conn.execute(
                "UPDATE items SET serial_no = ? WHERE item_id = ? AND serial_no = ?",
                (rename.new_serial_no, item_ids[rename.old_code], rename.old_serial_no),
            )
        for table_name in SNAPSHOT_TABLES:
            if not _table_exists(conn, table_name):
                continue
            for rename in renames:
                cursor = conn.execute(
                    f"""
                    UPDATE {table_name}
                    SET mes_code_snapshot = ?
                    WHERE item_id = ? AND mes_code_snapshot IS NOT NULL AND mes_code_snapshot != ?
                    """,
                    (rename.new_code, item_ids[rename.old_code], rename.new_code),
                )
                snapshot_updated_count += cursor.rowcount

        _assert_integrity(conn, item_ids, before_bom_edges, renames)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    report = RenumberReport(
        applied=True,
        renamed_count=len(renames),
        snapshot_updated_count=snapshot_updated_count,
        bom_edge_count=len(before_bom_edges),
        backup_path=str(backup_path),
    )
    report_dir = runtime_path("reports", "maintenance", create=True)
    _write_report(report_dir, report, plan_name, renames)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=Path("backend/mes.db"))
    parser.add_argument("--plan", choices=tuple(RENAMES_BY_PLAN), default="ar-pr-gap")
    parser.add_argument("--apply", action="store_true", help="검증 후 실제 DB를 변경합니다.")
    args = parser.parse_args()

    try:
        report = renumber_database(
            args.database,
            renames=RENAMES_BY_PLAN[args.plan],
            plan_name=args.plan,
            apply=args.apply,
        )
    except (FileNotFoundError, ValueError, sqlite3.Error) as error:
        print(f"[실패] {error}")
        return 1

    mode = "적용" if report.applied else "점검"
    print(
        f"[{mode}] 대상={report.renamed_count}건, BOM 연결={report.bom_edge_count}건, "
        f"스냅샷 갱신={report.snapshot_updated_count}건"
    )
    if report.backup_path:
        print(f"[백업] {report.backup_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
