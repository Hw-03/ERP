---
type: file-explanation
source_path: "_attic/scripts/dev/extract_io_bom_parents.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# extract_io_bom_parents.py — extract_io_bom_parents.py 설명

## 이 파일은 무엇을 책임지나

`extract_io_bom_parents.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `detect_columns`
- `norm_model`
- `norm_spec`
- `norm_country`
- `norm_packing`
- `fill`
- `thin_border`
- `write_header`
- `write_row`
- `auto_col_width`
- 그 외 5개 항목

## 연결되는 파일

- [[ERP/_attic/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
"""
입출고 관리대장 3개년(2024/2025/2026) 분석 - PA/PF BOM 부모품 후보 추출

실행: python scripts/dev/extract_io_bom_parents.py
입력: data/입출고 관리대장/F704-04 (R00) {YEAR}년 제품 입출고 관리대장.xlsx
출력: data/입출고_BOM부모후보.xlsx (6시트)

산출물 시트:
  1. raw_all          : 3파일×6시트 모든 행 (원본 보존)
  2. raw_normalized   : raw_all + 정규화 4컬럼
  3. unique_5keys     : 고유 (모델·스펙·국가·거래처·Packing) 조합 (PA 후보)
  4. pf_parents       : 고유 (모델·스펙·국가·거래처) 4-key (PF 부모 후보)
  5. pa_variants      : 각 PF 부모별 Packing 변형 목록
  6. discarded        : 모델명/거래처 누락 등 제외된 행 (누락 검증용)
"""

from __future__ import annotations

import re
import sys
import io
from collections import Counter, defaultdict
from datetime import datetime, date
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils import get_column_letter

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
INPUT_DIR = ROOT / "data" / "입출고 관리대장"
OUTPUT_PATH = ROOT / "data" / "입출고_BOM부모후보.xlsx"

YEARS = [2024, 2025, 2026]


# 메인 제품 시트 (시트명 고정). 컬럼 인덱스는 헤더(R3)에서 자동 탐지.
PRODUCT_SHEETS = ["DX3000", "DX3000M", "ADX4000W", "ADX6000시리즈", "COCOON", "solo"]

# 헤더 텍스트 → 의미 컬럼 매핑 규칙 (소문자 비교, 첫 매칭 채택)
HEADER_RULES = {
    "model":    [lambda s: s == "모델명"],
    "country":  [lambda s: s == "출고국가"],
    "customer": [lambda s: s == "출고처명"],
    "kv":       [lambda s: s == "kv, ma"],
    "packing":  [lambda s: s == "packing list"],
    "serial":   [lambda s: s == "제품시리얼"],
    "shipdate": [lambda s: s == "출고일"],
}

def detect_columns(header_row) -> dict:
    """헤더 행에서 의미 컬럼 인덱스를 자동 탐지."""
```
