---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/migrations/reapply_erp_codes.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# reapply_erp_codes.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/migrations/reapply_erp_codes.py]]

## 원본 첫 줄 (또는 메타)

```
"""971개 품목의 ERP 코드를 새 체계(다중 모델 기호)로 일괄 재부여.

사용법:
  python scripts/migrations/reapply_erp_codes.py           # dry-run (기본)
  python scripts/migrations/reapply_erp_codes.py --apply   # 실제 DB 반영

규칙:
  - legacy_model 컬럼 기반으로 model_symbol 파생
  - process_type_code 기존 값 + model_symbol 조합으로 시리얼 1부터 재부여
  - "공용"/None legacy_model 품목 → model_symbol="" (NULL), erp_code=NULL 유지
  - item_models 조인 테이블에 (item_id, slot) 삽입
"""

import sys
import sqlite3
import argparse
from pathlib import Path
from collections import defaultdict

DB_PATH = Path(__file__).parent.parent.parent / "backend" / "erp.db"

LEGACY_MODEL_TO_SLOT = {
    "DX3000":    1,
    "COCOON":    2,
    "SOLO":      3,
```
