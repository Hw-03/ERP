---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/sync_excel_memo13.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# sync_excel_memo13.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/sync_excel_memo13.py]]

## 원본 첫 줄 (또는 메타)

```
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
```
