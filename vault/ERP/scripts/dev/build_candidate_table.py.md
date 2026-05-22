---
type: code-note
project: DEXCOWIN MES
layer: scripts
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/scripts/dev/build_candidate_table.py
tags: [vault, code-note, auto-generated, stub]
---

# build_candidate_table.py

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/scripts/dev/build_candidate_table.py]]

## 원본 첫 줄

```
"""연녹/없음/연파랑 41건 후보 보조표 생성"""
import openpyxl
import re
import sqlite3
from openpyxl.styles import PatternFill, Font, Alignment
from openpyxl.utils import get_column_letter
from pathlib import Path

ROOT = Path('_attic/data/0520 권동환 사원님 재고')
CUR = ROOT / '확정품명, 코드 추가.xlsx'
MASTER = Path('_attic/data/생산부_재고_매칭작업_최종.bak_memo13_20260518_101641.xlsx')
A_FILE = ROOT / '원본' / 'F704-03__R00__자재_재고_현황_매칭품명추가.xlsx'
DB = Path('backend/mes.db')
OUT = ROOT / '판단필요_후보표_20260521.xlsx'


def fc(cell):
    f = cell.fill
    if not f or f.patternType is None:
        return None
    try:
        return f.fgColor.rgb
    except Exception:
        return None


def tokens(s):
    if not s:
        return set()
    parts = re.findall(r'[A-Za-z0-9가-힣]{2,}', str(s))
```
