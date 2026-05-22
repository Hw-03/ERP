---
type: file-explanation
source_path: "scripts/dev/update_excel_blue_after_db.py"
importance: normal
layer: scripts
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# update_excel_blue_after_db.py — update_excel_blue_after_db.py 설명

## 이 파일은 무엇을 책임지나

`update_excel_blue_after_db.py`는 개발/검증/데이터 정리에 쓰는 보조 스크립트입니다.

## 업무 흐름에서의 의미

개발자가 변경 전후 품질을 확인하거나 데이터 작업을 준비할 때 사용합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `fc`
- `load_db_index`
- `parse_memo_items`
- `main`

## 연결되는 파일

- [[ERP/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""DB에 이미 등록된 진한 파랑 21건을 권동환 엑셀에 반영.

행번호가 아닌 F열 메모(따옴표 안 품명) 기준으로 매칭. DB는 건드리지 않음.
"""
import re
import shutil
import sqlite3
from copy import copy
from datetime import datetime
from pathlib import Path

import openpyxl
from openpyxl.styles import PatternFill

DB = Path('backend/mes.db')
EXCEL = Path('_attic/data/0520 권동환 사원님 재고/확정품명, 코드 추가.xlsx')
EXCEL_BAK = Path(f'_attic/data/0520 권동환 사원님 재고/백업/확정품명, 코드 추가_파랑반영전_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx')
BLUE = 'FF00B0F0'


def fc(cell):
    f = cell.fill
    if not f or f.patternType is None:
        return None
    try:
        rgb = f.fgColor.rgb
        return str(rgb) if rgb else None
    except Exception:
        return None


def load_db_index():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute('SELECT item_code, item_name FROM items WHERE item_code IS NOT NULL')
    by_name = {}
    for code, name in cur.fetchall():
        if name:
            by_name[name.strip()] = code.strip()
    conn.close()
    return by_name


def parse_memo_items(f_val):
    """F열 메모에서 따옴표 안 텍스트 추출, ','로 split하여 자재 이름 리스트 반환."""
    m = re.search(r"'([^']+)'", str(f_val or ''))
    if not m:
        return []
    raw = m.group(1)
    return [n.strip() for n in raw.split(',') if n.strip()]


def main():
    by_name = load_db_index()
    print(f'DB item_code 인덱스: {len(by_name)}')
```
