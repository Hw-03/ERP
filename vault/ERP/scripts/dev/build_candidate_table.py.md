---
type: file-explanation
source_path: "scripts/dev/build_candidate_table.py"
importance: normal
layer: scripts
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# build_candidate_table.py — build_candidate_table.py 설명

## 이 파일은 무엇을 책임지나

`build_candidate_table.py`는 개발/검증/데이터 정리에 쓰는 보조 스크립트입니다.

## 업무 흐름에서의 의미

개발자가 변경 전후 품질을 확인하거나 데이터 작업을 준비할 때 사용합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `fc`
- `tokens`
- `score`
- `main`

## 연결되는 파일

- [[ERP/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
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
    return set(p.lower() for p in parts)


def score(qt, text):
    tt = tokens(text)
    if not tt:
        return 0.0
    inter = qt & tt
    if not inter:
        return 0.0
    return len(inter) / len(qt | tt)


def main():
    wb_k = openpyxl.load_workbook(CUR)
    ws_k = wb_k['26.05월_수정본']

    target_rows = {'GREEN': [], 'NONE': [], 'BLUE': []}
    for r in range(4, ws_k.max_row + 1):
        prod = ws_k.cell(row=r, column=4).value
        if not prod:
            continue
        color = fc(ws_k.cell(row=r, column=6))
        spec = ws_k.cell(row=r, column=5).value
        cur_match = ws_k.cell(row=r, column=6).value
```
