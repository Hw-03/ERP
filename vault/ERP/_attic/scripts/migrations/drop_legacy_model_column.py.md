---
type: file-explanation
source_path: "_attic/scripts/migrations/drop_legacy_model_column.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# drop_legacy_model_column.py — drop_legacy_model_column.py 설명

## 이 파일은 무엇을 책임지나

`drop_legacy_model_column.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `main`

## 연결되는 파일

- [[ERP/_attic/scripts/migrations/📁_migrations]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
"""Migration: DROP COLUMN legacy_model FROM items.

Usage:
    cd backend
    python ../scripts/migrations/drop_legacy_model_column.py
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import sqlalchemy as sa  # noqa: E402
from app.database import engine  # noqa: E402


def main() -> None:
    with engine.connect() as conn:
        result = conn.execute(
            sa.text("SELECT COUNT(*) FROM pragma_table_info('items') WHERE name='legacy_model'")
        )
        if result.scalar() == 0:
            print("legacy_model column does not exist — nothing to do.")
            return

    with engine.begin() as conn:
        conn.execute(sa.text("DROP INDEX IF EXISTS ix_items_legacy_model"))
        conn.execute(sa.text("ALTER TABLE items DROP COLUMN legacy_model"))

    print("Done: legacy_model column removed from items table.")


if __name__ == "__main__":
    main()
```
