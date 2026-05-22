---
type: file-explanation
source_path: "_attic/scripts/dev/sync_excel_from_db.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# sync_excel_from_db.py — sync_excel_from_db.py 설명

## 이 파일은 무엇을 책임지나

`sync_excel_from_db.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `norm`
- `clone_cell_style`
- `i_formula`
- `p_formula`
- `m_d`
- `m_e`
- `m_h`
- `m_i`
- `m_l`
- `q_link`
- 그 외 1개 항목

## 연결되는 파일

- [[ERP/_attic/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
"""담당자 참조 엑셀(생산부_재고_매칭작업_최종.xlsx) ↔ DB 단방향 동기화.

DB가 정본. 본 스크립트는 DB를 변경하지 않는다.

수행:
  1) 백업 (.bak_<ts>.xlsx)
  2) 방사구 수정: 고압진공_재고현황 R112 모델열(3,4,6,7,8)="O" + 마스터 P129="34678-VR-0039"
  3) 신규 시트 '출하_재고현황' 생성 (조립완제품_재고현황 헤더/서식 복제)
  4) DB의 PA/PF 중 '엑셀 마스터에 아직 없는' 50건을 원본시트+마스터에 append (수식·교차링크 보존)
  5) autofilter 확장 + 저장

비멱등: '출하_재고현황' 가 이미 있으면 중단(백업에서 복원 후 재실행).
"""
import datetime
import re
import shutil
import sqlite3
import sys
from copy import copy

import openpyxl
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import PatternFill

sys.stdout.reconfigure(encoding="utf-8")

XLSX = r"data/생산부_재고_매칭작업_최종.xlsx"
DB = r"backend/erp.db"
SRC_SHEET = "조립완제품_재고현황"
NEW_SHEET = "출하_재고현황"
AFTER_SHEET = "창고_재고현황"
MASTER = "마스터_품목"

DIGIT_TO_COL = {"3": 10, "4": 11, "6": 12, "7": 13, "8": 14, "?": 15}  # 원본시트 J~O


def norm(v):
    return re.sub(r"\s+", "", str(v)).upper() if v not in (None, "") else ""


def clone_cell_style(src, dst):
    """src 셀의 서식(글꼴·채우기·테두리·정렬·표시형식)을 dst 셀에 복제."""
    dst.font = copy(src.font)
    dst.fill = copy(src.fill)
    dst.border = copy(src.border)
    dst.alignment = copy(src.alignment)
    dst.protection = copy(src.protection)
    dst.number_format = src.number_format


# 원본시트 I/P 표준 수식 (행 r)
def i_formula(r):
    return (
        '=IFERROR(IF(OR($F{r}="O",$G{r}="O",$H{r}="O"),'
        'CHOOSE(MATCH($A{r},{{"튜브","고압","진공","튜닝","조립","출하"}},0),'
```
