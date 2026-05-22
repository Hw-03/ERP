---
type: file-explanation
source_path: "scripts/dev/expand_green_split_rows.py"
importance: normal
layer: scripts
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# expand_green_split_rows.py — expand_green_split_rows.py 설명

## 이 파일은 무엇을 책임지나

`expand_green_split_rows.py`는 개발/검증/데이터 정리에 쓰는 보조 스크립트입니다.

## 업무 흐름에서의 의미

개발자가 변경 전후 품질을 확인하거나 데이터 작업을 준비할 때 사용합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `fc`
- `load_db_names`
- `parse_parent`
- `main`

## 연결되는 파일

- [[ERP/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""진한 초록(FF00B050) 부모 6행 → 분해된 자식 22행을 부모 바로 아래에 삽입.

권동환 엑셀('확정품명, 코드 추가.xlsx')에만 영향. DB는 건드리지 않음.
"""
import re
import sqlite3
from copy import copy
from pathlib import Path

import openpyxl
from openpyxl.styles import PatternFill

CUR = Path('_attic/data/0520 권동환 사원님 재고/확정품명, 코드 추가.xlsx')
DB = Path('backend/mes.db')
GREEN = 'FF00B050'


def fc(cell):
    f = cell.fill
    if not f or f.patternType is None:
        return None
    try:
        rgb = f.fgColor.rgb
        return str(rgb) if rgb else None
    except Exception:
        return None


def load_db_names():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute('SELECT item_code, item_name FROM items WHERE item_code IS NOT NULL')
    by_code = {c.strip(): (n or '').strip() for c, n in cur.fetchall()}
    conn.close()
    return by_code


def parse_parent(ws, r):
    prod = ws.cell(row=r, column=4).value
    spec = ws.cell(row=r, column=5).value
    f_val = ws.cell(row=r, column=6).value or ''
    g_val = ws.cell(row=r, column=7).value or ''
    m = re.search(r"'([^']+)'", str(f_val))
    names = []
    if m:
        names = [n.strip() for n in m.group(1).split('&') if n.strip()]
    codes = [c.strip() for c in str(g_val).split('&') if c.strip()]
    return {'r': r, 'prod': prod, 'spec': spec, 'names': names, 'codes': codes}


def main():
    db_by_code = load_db_names()
    wb = openpyxl.load_workbook(CUR)
    ws = wb['26.05월_수정본']
```
