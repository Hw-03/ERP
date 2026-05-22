---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/apply_bom_memo_items.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# apply_bom_memo_items.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/apply_bom_memo_items.py]]

## 원본 첫 줄 (또는 메타)

```
"""담당자 13항목 메모 → backend/erp.db 일괄 반영.

A) 이름/문구 수정 4건
B) 통합/삭제 2건 (#2 6-AR-0355 삭제 / #9 6-AR-0185 repoint 후 삭제)
C) 신규 19항목 INSERT

- DB는 정본. BOM 부모-자식 연결은 사람이 나중에 워크벤치로(이번 범위 아님).
- 재고·입출고 등 의존행은 테스트 데이터 → 삭제 시 전부 폐기.
- 단일 트랜잭션. 멱등 가드(신규 코드 선존재 시 중단).
- foreign_keys OFF(기본) 상태에서 의존행을 동적으로 전부 수동 정리 후 items 삭제.
"""
import datetime
import shutil
import sqlite3
import sys
import uuid

sys.stdout.reconfigure(encoding="utf-8")

DB = r"backend/erp.db"

# --- A. 이름/문구 수정 (erp_code → 새 이름) ---
RENAMES = {
    "8-VA-0011": "발생부 고압B/D+튜브 최종 작업完 [DXDR-070]",
    "6-AA-0046": "ADX6000FB BODY RIGHT ASS'Y",
```
