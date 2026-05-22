---
type: file-explanation
source_path: "_attic/scripts/dev/extract_excel_images.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# extract_excel_images.py — extract_excel_images.py 설명

## 이 파일은 무엇을 책임지나

`extract_excel_images.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `sanitize`
- `sniff_ext`
- `extract`
- `write_csv`
- `run_one`
- `main`

## 연결되는 파일

- [[ERP/_attic/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
"""생산부 자재 xlsx의 이미지 추출 + 품목 매칭 CSV 생성.

지원 시트(시트마다 컬럼 위치가 달라 SHEETS 테이블로 관리):
  - 고압        : 2026.05_생산부 자재_고압,진공,튜닝파트.xlsx
  - 조립 자재    : 2026.05_생산부 자재_조립,출하파트.xlsx
  - 튜브        : 2026.05_생산부 자재_튜브 파트.xlsx

산출:
  data/이미지 추출을 위한 원본/extracted/{시트명}/r{NNN}_{품목명}.{jpg|png}
  data/이미지 추출을 위한 원본/extracted/{시트명}/extracted_index.csv

화질 보존: openpyxl이 보관한 원본 바이트(img._data())를 그대로 write_bytes 한다. 재인코딩 없음.
WMF/EMF/WDP 등은 openpyxl이 지원하지 않아 자동으로 drop 됨 (경고로 표시).
"""
from __future__ import annotations

import csv
import re
import sys
import warnings
from collections import Counter
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT / "data" / "이미지 추출을 위한 원본"
OUT_BASE = SRC_DIR / "extracted"

# 시트별 설정: (xlsx 파일명, 시트명, 분류 col, 모델 col or None, 품목 col)
SHEETS: list[dict] = [
    {
        "xlsx": "2026.05_생산부 자재_고압,진공,튜닝파트.xlsx",
        "sheet": "고압",
        "col_분류": 3,
        "col_모델": 4,
        "col_품목": 5,
    },
    {
        "xlsx": "2026.05_생산부 자재_조립,출하파트.xlsx",
        "sheet": "조립 자재",
        "col_분류": 2,
        "col_모델": 3,
        "col_품목": 4,
    },
    {
        "xlsx": "2026.05_생산부 자재_튜브 파트.xlsx",
        "sheet": "튜브",
        "col_분류": 2,
        "col_모델": None,
        "col_품목": 3,
    },
]

FORBIDDEN = re.compile(r'[\\/:*?"<>|]')
```
