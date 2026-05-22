---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/scripts/migrations/migrate_erp_schema.py
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# migrate_erp_schema.py

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/scripts/migrations/migrate_erp_schema.py]]

## 원본 첫 줄 (또는 메타)

```
"""ERP 코드 체계 개편을 위한 DB 마이그레이션 스크립트.

변경 내용:
  1. items 테이블에 model_symbol 컬럼 추가
  2. item_models 조인 테이블 생성
  3. product_symbols 데이터 업데이트 (새 기호 매핑 적용)
  4. process_types 에 NA 추가

실행: python scripts/migrations/migrate_erp_schema.py
"""

import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).parent.parent.parent / "backend" / "erp.db"


def run():
    if not DB_PATH.exists():
        print(f"[오류] DB 파일을 찾을 수 없습니다: {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
```
