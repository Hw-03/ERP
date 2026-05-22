---
type: file-explanation
source_path: "scripts/dev/register_blue_items.py"
importance: normal
layer: scripts
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# register_blue_items.py — register_blue_items.py 설명

## 이 파일은 무엇을 책임지나

`register_blue_items.py`는 개발/검증/데이터 정리에 쓰는 보조 스크립트입니다.

## 업무 흐름에서의 의미

개발자가 변경 전후 품질을 확인하거나 데이터 작업을 준비할 때 사용합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `fc`
- `read_plan`
- `get_parent_rows`
- `register_in_db`
- `main`

## 연결되는 파일

- [[ERP/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""진한 파랑(FF00B0F0) 21건을 DB에 신규 등록하고 권동환 엑셀에 반영.

흐름:
1. 진한파랑_등록대상_20260522.xlsx 에서 [MES_등록명, model, process_type, min_stock] 읽기
2. 권동환 엑셀의 진한 파랑 부모 행과 매핑 (행번호 기준)
3. 각 자재에 item_code 자동 부여 (max(serial_no)+1)
4. DB 트랜잭션: items + inventory + inventory_locations 등록
5. 권동환 엑셀: 부모 G열에 멀티코드, 부모 바로 아래 자식 N행 추가 (진한 초록 패턴)
"""
import shutil
import sqlite3
import uuid
from copy import copy
from datetime import datetime
from pathlib import Path

import openpyxl
from openpyxl.styles import PatternFill

DB = Path('backend/mes.db')
DB_BAK = Path(f'backend/_backup/mes_pre_blue_register_{datetime.now().strftime("%Y%m%d_%H%M%S")}.db')

PLAN = Path('_attic/data/0520 권동환 사원님 재고/진한파랑_등록대상_20260522.xlsx')
EXCEL = Path('_attic/data/0520 권동환 사원님 재고/확정품명, 코드 추가.xlsx')
EXCEL_BAK = Path('_attic/data/0520 권동환 사원님 재고/백업/확정품명, 코드 추가_파랑등록전_20260522.xlsx')

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


def read_plan():
    wb = openpyxl.load_workbook(PLAN, data_only=True)
    ws = wb.active
    plan = []
    for r in range(2, ws.max_row + 1):
        row_label = ws.cell(row=r, column=1).value
        if not row_label:
            continue
        plan.append({
            'parent_row_str': str(row_label),  # 'r635' 등
            'item_name': str(ws.cell(row=r, column=2).value).strip(),
            'model': str(ws.cell(row=r, column=3).value).strip(),
            'process_type': str(ws.cell(row=r, column=4).value).strip(),
            'min_stock': ws.cell(row=r, column=5).value,
        })
```
