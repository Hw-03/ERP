---
type: file-explanation
source_path: "_attic/scripts/dev/generate_inventory_template.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# generate_inventory_template.py — generate_inventory_template.py 설명

## 이 파일은 무엇을 책임지나

`generate_inventory_template.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `build_input_sheet`
- `build_guide_sheet`
- `main`

## 연결되는 파일

- [[ERP/_attic/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
"""
실제 재고 입력용 엑셀 양식 (data/재고_입력_양식.xlsx) 생성기.

사용법:
    py scripts/dev/generate_inventory_template.py

산출물:
    data/재고_입력_양식.xlsx
      Sheet1 "재고입력"  : 12컬럼 입력표 + 드롭다운 + 예시 3행
      Sheet2 "작성가이드" : 공정코드/모델 설명, 작성 규칙
"""

from __future__ import annotations

from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation


ROOT = Path(__file__).resolve().parent.parent.parent
OUTPUT_PATH = ROOT / "data" / "재고_입력_양식.xlsx"

# 데이터 행을 얼마나 미리 만들어 둘지 (드롭다운 + 테두리 적용 범위)
PREFILL_ROWS = 500

# 컬럼 정의: (헤더, 필수등급, DB필드, 폭, 예시1, 예시2, 예시3)
#   필수등급: "R"=필수(빨강), "W"=권장(노랑), "O"=선택(회색)
COLUMNS: list[tuple[str, str, str, int, str, str, str]] = [
    ("품목명",   "R", "Item.item_name",         26, "텅스텐 필라멘트", "세라믹 애자 70kV",  "DX3000 완제품"),
    ("공정코드", "R", "Item.process_type_code", 12, "TR",             "HA",                "PF"),
    ("현재수량", "R", "Inventory.quantity",     11, 120,              15,                   3),
    ("규격",     "W", "Item.spec",              22, "Ø0.3 × L50",      "70kV 절연",         "DX3000-STD"),
    ("단위",     "W", "Item.unit",              8,  "EA",             "EA",                "SET"),
    ("부서",     "W", "Inventory.location",     10, "튜브",           "고압",              "출하"),
    ("모델",     "W", "Item.legacy_model",      12, "공용",           "DX3000",            "DX3000"),
    ("품번",     "O", "Item.item_code",         14, "",               "",                  ""),
    ("자재분류", "O", "Item.legacy_item_type",  14, "필라멘트",       "애자",              "완제품"),
    ("공급사",   "O", "Item.supplier",          18, "삼성특수금속",   "한성세라믹",        "자체생산"),
    ("안전재고", "O", "Item.min_stock",         10, 20,               5,                   1),
    ("바코드",   "O", "Item.barcode",           14, "",               "",                  ""),
]

# 드롭다운 값 목록 (DB 시드와 일치해야 함: process_types 18종 / DepartmentEnum)
DROPDOWNS: dict[str, list[str]] = {
    "공정코드": [
        "TR", "TA", "TF",
        "HR", "HA", "HF",
        "VR", "VA", "VF",
        "NR", "NA", "NF",
        "AR", "AA", "AF",
        "PR", "PA", "PF",
    ],
```
