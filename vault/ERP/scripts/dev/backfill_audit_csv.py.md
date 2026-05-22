---
type: file-explanation
source_path: "scripts/dev/backfill_audit_csv.py"
importance: normal
layer: scripts
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# backfill_audit_csv.py — backfill_audit_csv.py 설명

## 이 파일은 무엇을 책임지나

`backfill_audit_csv.py`는 개발/검증/데이터 정리에 쓰는 보조 스크립트입니다.

## 업무 흐름에서의 의미

개발자가 변경 전후 품질을 확인하거나 데이터 작업을 준비할 때 사용합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `main`

## 연결되는 파일

- [[ERP/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
#!/usr/bin/env python3
"""외부 심사용 입출고 CSV 백필 / catch-up 스크립트.

DB 의 `TransactionLog` 를 기준으로 월별 CSV(`backend/data/audit_csv/inout_YYYY-MM.csv`)
를 재작성한다. Idempotent — 몇 번 실행해도 같은 결과.

사용법:
    # 기본 (기존 CSV 덮어쓰기)
    python scripts/dev/backfill_audit_csv.py

    # 저장 경로 override
    AUDIT_CSV_DIR=D:/audit python scripts/dev/backfill_audit_csv.py

    # PostgreSQL 운영 DB
    DATABASE_URL=postgresql://... python scripts/dev/backfill_audit_csv.py
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv  # noqa: E402
load_dotenv(BACKEND_DIR / ".env")

from app.database import SessionLocal  # noqa: E402
from app.services import audit_csv  # noqa: E402


def main() -> int:
    db = SessionLocal()
    try:
        result = audit_csv.backfill_all(db, overwrite=True)
    finally:
        db.close()

    print(f"백필 완료: {result['total_rows']} 행")
    print(f"저장 위치: {audit_csv.get_csv_dir()}")
    if result["months"]:
        print("월별 파일:")
        for m in result["months"]:
            print(f"  - inout_{m}.csv")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```
