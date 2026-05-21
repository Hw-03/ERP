---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/normalize_uuid_format.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# normalize_uuid_format.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/normalize_uuid_format.py]]

## 원본 첫 줄 (또는 메타)

```
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

```
