---
type: file-explanation
source_path: "_attic/scripts/dev/import_inventory_cleanup.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# import_inventory_cleanup.py — import_inventory_cleanup.py 설명

## 이 파일은 무엇을 책임지나

`import_inventory_cleanup.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `main`

## 연결되는 파일

- [[ERP/_attic/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
"""
import_inventory_cleanup.py — CLI 래퍼.

핵심 로직은 backend/app/services/seed_cleanup.py 에 있음.

Usage:
    cd backend
    python ../scripts/dev/import_inventory_cleanup.py [--dry-run]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal
from app.services.seed_cleanup import run_cleanup_import, DEFAULT_EXCEL_PATH


def main(dry_run: bool = False) -> None:
    print(f"엑셀 경로: {DEFAULT_EXCEL_PATH}")
    db = SessionLocal()
    try:
        result = run_cleanup_import(db, dry_run=dry_run)
        print(f"rows: {result['rows']}, total_qty: {result['total_qty']}, ok: {result['ok']}")
        if result["errors"]:
            for e in result["errors"]:
                print(f"[경고] {e}")
        if dry_run:
            print("[dry-run] DB 변경 없이 종료.")
        else:
            print("[완료]" if result["ok"] else "[경고] 일부 검증 실패.")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="DB 변경 없이 파싱/검증만 실행")
    args = parser.parse_args()
    main(dry_run=args.dry_run)
```
