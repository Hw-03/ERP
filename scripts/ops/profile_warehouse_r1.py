"""Profile the warehouse R1 depletion query against a deterministic temporary SQLite fixture."""

from __future__ import annotations

import argparse
import json
import sqlite3
import statistics
import sys
import tempfile
import time
from contextlib import closing
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.runtime_paths import runtime_path


REPORT_NAME = "warehouse-r1-query-profile.json"
TARGET_ITEM_ID = "target-item"
R1_QUERY = """
SELECT wbi.id, wbi.box_id, wbi.item_id, wbi.quantity
FROM warehouse_box_items AS wbi
JOIN warehouse_boxes AS wb ON wbi.box_id = wb.box_id
WHERE wbi.item_id = ? AND wbi.quantity > 0
ORDER BY wb.layer_no DESC, wb.row_no ASC, wb.jari_index ASC, wb.stack_order DESC
""".strip()


def _positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return parsed


def _create_fixture(
    connection: sqlite3.Connection,
    *,
    candidate_boxes: int,
    noise_boxes: int,
) -> None:
    """Create the current two-table/index shape without touching a persistent DB."""
    connection.executescript(
        """
        CREATE TABLE warehouse_boxes (
            box_id TEXT PRIMARY KEY,
            angle_id INTEGER NOT NULL,
            row_no INTEGER NOT NULL,
            layer_no INTEGER NOT NULL,
            jari_index INTEGER NOT NULL,
            stack_order INTEGER NOT NULL
        );
        CREATE INDEX ix_warehouse_boxes_angle_id ON warehouse_boxes (angle_id);
        CREATE INDEX ix_wh_box_coord
            ON warehouse_boxes (angle_id, row_no, layer_no, jari_index);

        CREATE TABLE warehouse_box_items (
            id TEXT PRIMARY KEY,
            box_id TEXT NOT NULL,
            item_id TEXT NOT NULL,
            quantity INTEGER NOT NULL
        );
        CREATE INDEX ix_warehouse_box_items_box_id ON warehouse_box_items (box_id);
        CREATE INDEX ix_warehouse_box_items_item_id ON warehouse_box_items (item_id);
        CREATE INDEX ix_wh_boxitem_item ON warehouse_box_items (item_id);
        """
    )

    boxes: list[tuple[str, int, int, int, int, int]] = []
    contents: list[tuple[str, str, str, int]] = []
    total_boxes = candidate_boxes + noise_boxes
    for index in range(total_boxes):
        box_id = f"box-{index:08d}"
        boxes.append(
            (
                box_id,
                (index % 20) + 1,
                (index % 10) + 1,
                (index % 5) + 1,
                index % 3,
                index % 4,
            )
        )
        item_id = TARGET_ITEM_ID if index < candidate_boxes else f"noise-{index % 100:03d}"
        contents.append((f"content-{index:08d}", box_id, item_id, (index % 9) + 1))

    connection.executemany(
        """
        INSERT INTO warehouse_boxes
            (box_id, angle_id, row_no, layer_no, jari_index, stack_order)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        boxes,
    )
    connection.executemany(
        """
        INSERT INTO warehouse_box_items (id, box_id, item_id, quantity)
        VALUES (?, ?, ?, ?)
        """,
        contents,
    )
    connection.commit()


def _profile(
    connection: sqlite3.Connection,
    *,
    candidate_boxes: int,
    noise_boxes: int,
    repeats: int,
) -> dict:
    plan_rows = connection.execute(
        f"EXPLAIN QUERY PLAN {R1_QUERY}",
        (TARGET_ITEM_ID,),
    ).fetchall()
    candidate_row_count = connection.execute(
        """
        SELECT COUNT(*)
        FROM warehouse_box_items
        WHERE item_id = ? AND quantity > 0
        """,
        (TARGET_ITEM_ID,),
    ).fetchone()[0]

    connection.execute(R1_QUERY, (TARGET_ITEM_ID,)).fetchall()
    elapsed_ms: list[float] = []
    result_row_count = 0
    for _ in range(repeats):
        started = time.perf_counter_ns()
        rows = connection.execute(R1_QUERY, (TARGET_ITEM_ID,)).fetchall()
        elapsed_ms.append((time.perf_counter_ns() - started) / 1_000_000)
        result_row_count = len(rows)

    return {
        "fixture": {
            "candidate_boxes": candidate_boxes,
            "noise_boxes": noise_boxes,
            "total_boxes": candidate_boxes + noise_boxes,
        },
        "candidate_row_count": candidate_row_count,
        "result_row_count": result_row_count,
        "explain_query_plan": [
            {"id": row[0], "parent": row[1], "notused": row[2], "detail": row[3]}
            for row in plan_rows
        ],
        "timing_ms": {
            "repeats": repeats,
            "minimum": round(min(elapsed_ms), 6),
            "median": round(statistics.median(elapsed_ms), 6),
            "maximum": round(max(elapsed_ms), 6),
        },
        "indexes_profiled": [
            "ix_warehouse_box_items_item_id",
            "ix_wh_boxitem_item",
            "ix_warehouse_box_items_box_id",
            "ix_wh_box_coord",
        ],
        "index_decision": "measurement-only; no index or migration added",
        "follow_up": "Compare this report with production-scale candidate counts before changing indexes.",
        "sqlite_version": sqlite3.sqlite_version,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate-boxes", type=_positive_int, default=2_000)
    parser.add_argument("--noise-boxes", type=_positive_int, default=20_000)
    parser.add_argument("--repeats", type=_positive_int, default=20)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    with tempfile.TemporaryDirectory(prefix="mes-r1-profile-") as temp_dir:
        database_path = Path(temp_dir) / "profile.db"
        with closing(sqlite3.connect(database_path)) as connection:
            _create_fixture(
                connection,
                candidate_boxes=args.candidate_boxes,
                noise_boxes=args.noise_boxes,
            )
            report = _profile(
                connection,
                candidate_boxes=args.candidate_boxes,
                noise_boxes=args.noise_boxes,
                repeats=args.repeats,
            )

    report_dir = runtime_path("reports", create=True)
    report_path = report_dir / REPORT_NAME
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"report": str(report_path), **report}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
