---
type: file-explanation
source_path: "scripts/dev/dump_db_to_excel.py"
importance: normal
layer: scripts
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# dump_db_to_excel.py — dump_db_to_excel.py 설명

## 이 파일은 무엇을 책임지나

`dump_db_to_excel.py`는 개발/검증/데이터 정리에 쓰는 보조 스크립트입니다.

## 업무 흐름에서의 의미

개발자가 변경 전후 품질을 확인하거나 데이터 작업을 준비할 때 사용합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `to_cell`
- `main`

## 연결되는 파일

- [[ERP/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""mes.db 전체를 엑셀 한 파일에 시트별로 덤프"""
import sqlite3
from datetime import datetime, date
from pathlib import Path

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

DB = Path('backend/mes.db')
OUT = Path('_attic/data/db_dump_20260522.xlsx')

HDR_FILL = PatternFill(start_color='305496', end_color='305496', fill_type='solid')
HDR_FONT = Font(color='FFFFFF', bold=True)
ALIGN = Alignment(horizontal='left', vertical='top', wrap_text=False)


def to_cell(v):
    if v is None:
        return ''
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, bytes):
        return v.hex()
    return v


def main():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = [r[0] for r in cur.fetchall()]

    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    summary = wb.create_sheet('_index')
    summary.append(['테이블', '행수', '컬럼수', '비고'])
    for c in range(1, 5):
        cell = summary.cell(row=1, column=c)
        cell.fill = HDR_FILL
        cell.font = HDR_FONT

    for t in tables:
        sheet_name = t[:31]
        ws = wb.create_sheet(sheet_name)

        cur.execute(f'PRAGMA table_info("{t}")')
        cols_info = cur.fetchall()
        col_names = [c[1] for c in cols_info]

        for c, name in enumerate(col_names, start=1):
            cell = ws.cell(row=1, column=c, value=name)
            cell.fill = HDR_FILL
            cell.font = HDR_FONT
```
