---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/generate_inventory_template.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# generate_inventory_template.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/generate_inventory_template.py]]

## 원본 첫 줄 (또는 메타)

```
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

```
