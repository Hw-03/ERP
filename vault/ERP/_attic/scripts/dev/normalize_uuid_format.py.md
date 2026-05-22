---
type: file-explanation
source_path: "_attic/scripts/dev/normalize_uuid_format.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# normalize_uuid_format.py — normalize_uuid_format.py 설명

## 이 파일은 무엇을 책임지나

`normalize_uuid_format.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `main`

## 연결되는 파일

- [[ERP/_attic/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
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
```
