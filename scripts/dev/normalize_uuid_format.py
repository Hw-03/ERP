"""Items / inventory / bom 의 dashed UUID 를 SQLAlchemy 기본 형식(no-dash 32 hex) 으로 통일.

배경: 마스터 교체 import 가 dashed 형식("xxxxxxxx-xxxx-...")으로 들어와,
SQLAlchemy 의 UUID(as_uuid=True) 가 INSERT 시 직렬화하는 no-dash 32-hex 형식과
SQLite 의 단순 문자열 비교 기반 FK 가 매칭되지 않아 입출고가 실패함.

본 스크립트는 1회 실행으로 모든 dashed 행을 no-dash 로 정규화한다.
"""
from __future__ import annotations

import pathlib
import sqlite3
import sys

DB = pathlib.Path(r"C:\ERP\backend\erp.db")

TARGETS: list[tuple[str, str]] = [
    ("items",     "item_id"),
    ("inventory", "item_id"),
    ("inventory", "inventory_id"),
    ("bom",       "bom_id"),
    ("bom",       "parent_item_id"),
    ("bom",       "child_item_id"),
]


def main() -> int:
    if not DB.exists():
        print(f"DB not found: {DB}")
        return 2

    con = sqlite3.connect(DB)
    con.execute("PRAGMA foreign_keys = OFF")
    try:
        con.execute("BEGIN")
        for table, col in TARGETS:
            before = con.execute(
                f"SELECT count(*) FROM {table} WHERE length({col})=36"
            ).fetchone()[0]
            con.execute(
                f"UPDATE {table} SET {col} = REPLACE({col},'-','') "
                f"WHERE length({col})=36"
            )
            after = con.execute(
                f"SELECT count(*) FROM {table} WHERE length({col})=36"
            ).fetchone()[0]
            print(f"  {table}.{col}: 36-char {before} -> {after}")

        violations = con.execute("PRAGMA foreign_key_check").fetchall()
        if violations:
            print("FK CHECK FAILED:")
            for v in violations:
                print(" ", v)
            con.execute("ROLLBACK")
            return 1

        con.execute("COMMIT")
        print("OK -- committed")
        return 0
    except Exception as exc:
        con.execute("ROLLBACK")
        print(f"ERROR: {exc}")
        return 1
    finally:
        con.execute("PRAGMA foreign_keys = ON")
        con.close()


if __name__ == "__main__":
    sys.exit(main())
