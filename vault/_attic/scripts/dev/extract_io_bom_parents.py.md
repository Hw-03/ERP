---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/dev/extract_io_bom_parents.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# extract_io_bom_parents.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/dev/extract_io_bom_parents.py]]

## 원본 첫 줄 (또는 메타)

```
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

```
