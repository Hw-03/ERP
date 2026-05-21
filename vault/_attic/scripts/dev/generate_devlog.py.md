---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/generate_devlog.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# generate_devlog.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/generate_devlog.py]]

## 원본 첫 줄 (또는 메타)

```
"""
개발 현황 엑셀 생성 스크립트
실행: python _attic/scripts/dev/generate_devlog.py
출력: _attic/docs/개발현황.xlsx
"""
import subprocess
import re
from pathlib import Path
from datetime import datetime
from collections import defaultdict
from openpyxl import Workbook
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.cell.rich_text import CellRichText, TextBlock
from openpyxl.cell.text import InlineFont

OUTPUT_PATH = Path("_attic/docs/개발현황.xlsx")

# ── 색상 상수 ──────────────────────────────────────────────
HEADER_BG   = "1F4E79"
HEADER_FG   = "FFFFFF"
KPI_LABEL_BG = "2E75B6"
KPI_VALUE_BG = "DEEAF1"
DONE_BG     = "E2EFDA"
TODO_BG     = "F2F2F2"
```
