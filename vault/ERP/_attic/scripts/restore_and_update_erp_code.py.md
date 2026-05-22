---
type: file-explanation
source_path: "_attic/scripts/restore_and_update_erp_code.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# restore_and_update_erp_code.py — restore_and_update_erp_code.py 설명

## 이 파일은 무엇을 책임지나

`restore_and_update_erp_code.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `parse_erp_code`

## 연결되는 파일

- [[ERP/_attic/scripts/📁_scripts]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
"""
DB restore + ERP code update (sort_order 1:1 match with Excel row index)
- Never matches by item_name
- Excel data row N (row 2 = N=1) -> DB sort_order N
"""
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

import openpyxl

BASE = Path(__file__).resolve().parent.parent
DB_PATH = BASE / "backend" / "erp.db"
BACKUP_SRC = BASE / "backend" / "erp_backup_20260430_094340.db"
EXCEL_PATH = BASE / "outputs" / "inventory_cleanup" / "생산부_재고_매칭작업_정리본_공정순번.xlsx"

# ── 1. backup current DB ───────────────────────────────────────────────────────
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
pre_restore_backup = BASE / "backend" / f"erp_before_restore_{ts}.db"
shutil.copy2(DB_PATH, pre_restore_backup)
print(f"[1] current DB backed up: {pre_restore_backup.name}")

# ── 2. restore from backup ─────────────────────────────────────────────────────
shutil.copy2(BACKUP_SRC, DB_PATH)
print(f"[2] DB restored: {BACKUP_SRC.name} -> erp.db")

# ── 3. verify restored DB ─────────────────────────────────────────────────────
conn = sqlite3.connect(str(DB_PATH))
conn.row_factory = sqlite3.Row
cur = conn.cursor()

cur.execute("SELECT COUNT(*) FROM items")
total = cur.fetchone()[0]
assert total == 722, f"items count error: {total} (expected 722)"

cur.execute("SELECT sort_order FROM items ORDER BY sort_order")
sort_orders = [r[0] for r in cur.fetchall()]
expected = list(range(1, 723))
missing = sorted(set(expected) - set(sort_orders))
extra = sorted(set(sort_orders) - set(expected))
assert not missing, f"sort_order missing: {missing}"
assert not extra, f"sort_order unexpected: {extra}"
print(f"[3] restore OK: {total} items, sort_order 1~722 complete")

# ── 4. read Excel ──────────────────────────────────────────────────────────────
wb = openpyxl.load_workbook(str(EXCEL_PATH))
sheet_name = "ERP_코드" if "ERP_코드" in wb.sheetnames else wb.sheetnames[0]
ws = wb[sheet_name]
print(f"[4] Excel sheet: '{sheet_name}', total rows: {ws.max_row}")

# data rows: row 2~723 -> sort_order 1~722
excel_rows = {}  # sort_order -> {erp_code, item_name}
for row_idx in range(2, ws.max_row + 1):
```
