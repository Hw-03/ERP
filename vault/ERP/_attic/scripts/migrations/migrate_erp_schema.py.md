---
type: file-explanation
source_path: "_attic/scripts/migrations/migrate_erp_schema.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# migrate_erp_schema.py — migrate_erp_schema.py 설명

## 이 파일은 무엇을 책임지나

`migrate_erp_schema.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `run`

## 연결되는 파일

- [[ERP/_attic/scripts/migrations/📁_migrations]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
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

    print("=== ERP 스키마 마이그레이션 시작 ===")

    # 1. items 테이블에 model_symbol 컬럼 추가
    existing_cols = {row[1] for row in cur.execute("PRAGMA table_info(items)").fetchall()}
    if "model_symbol" not in existing_cols:
        cur.execute("ALTER TABLE items ADD COLUMN model_symbol TEXT")
        print("[1/4] items.model_symbol 컬럼 추가 완료")
    else:
        print("[1/4] items.model_symbol 이미 존재 — 스킵")

    # 2. item_models 조인 테이블 생성
    cur.execute("""
        CREATE TABLE IF NOT EXISTS item_models (
            item_id TEXT NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
            slot    INTEGER NOT NULL REFERENCES product_symbols(slot),
            PRIMARY KEY (item_id, slot)
        )
    """)
    print("[2/4] item_models 테이블 생성 완료 (이미 있으면 무시)")

    # 3. product_symbols 데이터 업데이트
    NEW_SYMBOLS = [
        # (slot, symbol, model_name, is_finished_good, is_reserved)
        (1, "3", "DX3000",    False, False),
        (2, "7", "COCOON",    False, False),
        (3, "8", "SOLO",      False, False),
        (4, "4", "ADX4000W",  False, False),
        (5, "6", "ADX6000FB", False, False),
    ]
```
