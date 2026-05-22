---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/migrations/_archive/fix_legacy_items.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# fix_legacy_items.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/migrations/_archive/fix_legacy_items.py]]

## 원본 첫 줄 (또는 메타)

```
# -*- coding: utf-8 -*-
"""
1. inventory_locations.department 영문 → 한글 마이그레이션
2. 부서 미배정 품목 보완 (category 기반 자동 배정)
"""
import sqlite3, uuid
from datetime import datetime

DB_PATH = r"c:\ERP\backend\erp.db"

DEPT_MIGRATION = {
    "ASSEMBLY":      "조립",
    "HIGH_VOLTAGE":  "고압",
    "VACUUM":        "진공",
    "TUNING":        "튜닝",
    "TUBE":          "튜브",
    "SHIPPING":      "출하",
    "RESEARCH":      "연구",
    "SALES":         "영업",
    "ETC":           "기타",
    # AS는 그대로
}

# 카테고리 코드 → 부서
CATEGORY_TO_DEPT = {
```
