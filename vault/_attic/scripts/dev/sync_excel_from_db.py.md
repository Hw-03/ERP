---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/sync_excel_from_db.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# sync_excel_from_db.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/sync_excel_from_db.py]]

## 원본 첫 줄 (또는 메타)

```
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
```
