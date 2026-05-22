---
type: file-explanation
source_path: "_attic/scripts/dev/sync_excel_memo13.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# sync_excel_memo13.py — sync_excel_memo13.py 설명

## 이 파일은 무엇을 책임지나

`sync_excel_memo13.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `norm`
- `core`
- `link_cols`
- `clone_style`
- `m_d`
- `m_e`
- `m_h`
- `m_i`
- `m_l`
- `o_i`
- 그 외 3개 항목

## 연결되는 파일

- [[ERP/_attic/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
"""담당자 엑셀(생산부_재고_매칭작업_최종.xlsx) ↔ DB 13항목 재동기화.

DB 정본 → Excel 단방향. 물리 삭제 + 시트간 참조(N↔R·Q·수식) 전체 재계산.

핵심: openpyxl delete_rows 는 수식을 재번역하지 않으므로, 삭제 후
모든 수식을 '현재 행번호 템플릿'으로 재생성해 결정적으로 복구한다.

비멱등: 신규 코드가 이미 마스터 P 에 있으면 중단(백업 복원 후 재실행).
"""
import datetime
import re
import shutil
import sqlite3
import sys
from copy import copy

import openpyxl
from openpyxl.styles import PatternFill
from openpyxl.formatting.rule import FormulaRule  # noqa: F401  (호환용 import)

sys.stdout.reconfigure(encoding="utf-8")

XLSX = r"data/생산부_재고_매칭작업_최종.xlsx"
DB = r"backend/erp.db"
MASTER = "마스터_품목"
ORIGIN_SHEETS = [
    "튜브파트_재고현황",
    "고압진공_재고현황",
    "조립자재_재고현황",
    "조립완제품_재고현황",
    "창고_재고현황",
    "출하_재고현황",
]

RENAMES = {
    "8-VA-0011": "발생부 고압B/D+튜브 최종 작업完 [DXDR-070]",
    "6-AA-0046": "ADX6000FB BODY RIGHT ASS'Y",
    "46-AR-0100": "ADX4000W, ADX6000 16핀 FFC Cable (사파리 공용)",
    "6-AR-0113": "ADX6000 BOTTOM BLOCK",
}
DELETE_CODES = ["6-AR-0355", "6-AR-0185"]
NEW_CODES = [
    "6-AR-0356", "7-AR-0357", "7-AR-0358", "7-AR-0359",
    "4-AR-0360", "4-AR-0361", "4-AR-0362", "4-AR-0363",
    "4-AA-0077", "6-AA-0078", "4-AF-0043", "8-AF-0044",
    "6-PR-0182", "6-PR-0183", "6-PR-0184",
    "3-PA-0027", "6-PA-0028", "6-PA-0029", "6-PA-0030",
]
MODEL_NAME = {"3": "DX3000", "4": "ADX4000W", "6": "ADX6000", "7": "COCOON", "8": "SOLO"}
DIGIT_COL = {"3": 10, "4": 11, "6": 12, "7": 13, "8": 14, "?": 15}  # 원본 J~O
SHEET_BY_PT0 = {"A": "조립", "P": "출하"}  # 부서(A열)
MARK_COL = {"R": 6, "A": 7, "F": 8}  # 원본 F/G/H


def norm(v):
```
