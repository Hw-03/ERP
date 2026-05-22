---
type: file-explanation
source_path: "scripts/dev/a_file_mes_code_apply.py"
importance: normal
layer: scripts
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# a_file_mes_code_apply.py — a_file_mes_code_apply.py 설명

## 이 파일은 무엇을 책임지나

`a_file_mes_code_apply.py`는 개발/검증/데이터 정리에 쓰는 보조 스크립트입니다.

## 업무 흐름에서의 의미

개발자가 변경 전후 품질을 확인하거나 데이터 작업을 준비할 때 사용합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `main`

## 연결되는 파일

- [[ERP/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""A 파일(_매칭품명추가.xlsx)에 MES 코드 칸(F열) 끼워넣고 DB와 정합성 검증.

- A의 E열 '매칭 확정 품명' → 마스터 K(확정 품명) → 마스터 P(MES 코드) → A 새 F열
- 메타 표기 행 (예: '(매칭작업에서 삭제됨)') 은 F열도 비움
- 작업 후 DB(items 테이블)와 대조: MES 코드 존재 여부 + 품명/규격 일치 여부 리포트
"""
import re
import shutil
import sqlite3
from collections import defaultdict
from pathlib import Path

import openpyxl
from openpyxl.styles import PatternFill

ROOT = Path(__file__).resolve().parents[2]
A_SRC = ROOT / '_attic' / 'data' / '0520 권동환 사원님 재고' / 'F704-03__R00__자재_재고_현황_매칭품명추가.xlsx'
A_BAK = A_SRC.with_name(A_SRC.stem + '_원본백업_20260520.xlsx')
MATCH = ROOT / '_attic' / 'data' / '생산부_재고_매칭작업_최종.bak_memo13_20260518_101641.xlsx'
DB = ROOT / 'backend' / 'mes.db'

FILL_UNMATCH = PatternFill(start_color='D9D9D9', end_color='D9D9D9', fill_type='solid')
FILL_DB_MISS = PatternFill(start_color='FFC7CE', end_color='FFC7CE', fill_type='solid')  # 연빨강 = DB와 불일치


def main():
    # 1) 백업
    if not A_BAK.exists():
        shutil.copy(A_SRC, A_BAK)
        print(f'백업 생성: {A_BAK.name}')
    else:
        print(f'백업 이미 존재: {A_BAK.name}')

    # 2) 마스터 K → MES 코드 매핑
    print('마스터 K(확정품명) → MES 코드 인덱스 ...')
    wb_m = openpyxl.load_workbook(MATCH, data_only=True)
    ws_master = wb_m['마스터_품목']
    k_to_mes = {}
    k_to_master_row = {}
    for r in range(2, ws_master.max_row + 1):
        k = ws_master.cell(row=r, column=11).value
        mes = ws_master.cell(row=r, column=16).value
        if k and mes:
            k_to_mes[str(k).strip()] = str(mes).strip()
            k_to_master_row[str(k).strip()] = r
    print(f'  인덱스: {len(k_to_mes)}개')

    # 3) DB items 인덱스
    print('DB items 인덱스 ...')
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute('SELECT item_code, item_name, spec FROM items')
    db_by_code = {}
    for code, name, spec in cur.fetchall():
        if code:
```
