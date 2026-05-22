---
type: file-explanation
source_path: "_attic/scripts/dev/build_item_image_manifest.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# build_item_image_manifest.py — build_item_image_manifest.py 설명

## 이 파일은 무엇을 책임지나

`build_item_image_manifest.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `sanitize`
- `load_master_index`
- `list_representative_images`
- `find_candidates`
- `main`

## 연결되는 파일

- [[ERP/_attic/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
"""추출 이미지 → 마스터_품목(F열) → MES 코드(P열) 매핑 + frontend/public 배치.

흐름:
  1. 마스터_품목 시트 스캔: sanitize(F 생산부 품명) → [(P MES 코드, 원본 F품명, 그룹), ...]
  2. extracted/{시트}/r{NNN}_{품목명}.{ext} 순회 (-N 접미사는 첫 장만 사용)
  3. 매칭된 이미지를 frontend/public/images/items/{MES코드}.{ext} 로 복사 (1:N이면 N번 복사)
  4. manifest.json 생성: {erp_code: filename}
  5. _unmatched.csv: 매칭 실패 이미지 + 부분일치 후보
"""
from __future__ import annotations

import csv
import json
import re
import shutil
import sys
import warnings
from collections import defaultdict
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[2]
MASTER_XLSX = ROOT / "data" / "생산부_재고_매칭작업.xlsx"
EXTRACTED_BASE = ROOT / "data" / "이미지 추출을 위한 원본" / "extracted"
PUBLIC_DIR = ROOT / "frontend" / "public" / "images" / "items"
UNMATCHED_CSV = EXTRACTED_BASE / "_unmatched.csv"

# 마스터_품목 컬럼 (1-based)
COL_그룹 = 1
COL_생산부품명 = 6
COL_MES코드 = 16

FORBIDDEN = re.compile(r'[\\/:*?"<>|]')
WHITESPACE = re.compile(r"\s+")
ROW_PREFIX = re.compile(r"^r\d{3}_")
DUP_SUFFIX = re.compile(r"-\d+$")


def sanitize(name: str) -> str:
    name = FORBIDDEN.sub(" ", str(name))
    name = WHITESPACE.sub(" ", name).strip(" .")
    return name


def load_master_index() -> dict[str, list[tuple]]:
    """sanitize(생산부품명) → [(MES코드, 원본품명, 그룹)]"""
    warnings.filterwarnings("ignore")
    wb = openpyxl.load_workbook(MASTER_XLSX, data_only=True)
    ws = wb["마스터_품목"]
    idx: dict[str, list[tuple]] = defaultdict(list)
    for r in range(2, ws.max_row + 1):
        pn_raw = ws.cell(r, COL_생산부품명).value
        if not pn_raw:
            continue
```
