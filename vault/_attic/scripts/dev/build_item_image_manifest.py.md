---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/build_item_image_manifest.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# build_item_image_manifest.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/build_item_image_manifest.py]]

## 원본 첫 줄 (또는 메타)

```
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
```
