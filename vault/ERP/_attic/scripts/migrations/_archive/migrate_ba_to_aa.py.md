---
type: file-explanation
source_path: "_attic/scripts/migrations/_archive/migrate_ba_to_aa.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# migrate_ba_to_aa.py — migrate_ba_to_aa.py 설명

## 이 파일은 무엇을 책임지나

`migrate_ba_to_aa.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `main`

## 연결되는 파일

- [[ERP/_attic/scripts/migrations/_archive/📁__archive]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
"""BA → AA 마이그레이션 스크립트.

기존 DB의 category='BA', process_type_code='BA' 데이터를 'AA'로 변경한다.
erp_code에 '-BA-' 패턴이 있으면 '-AA-'로 교체한다.

사용법:
  dry-run (기본):  python scripts/migrate_ba_to_aa.py
  실제 적용:       python scripts/migrate_ba_to_aa.py --apply
"""

import argparse
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[2] / "backend" / "erp.db"


def main(apply: bool) -> None:
    if not DB_PATH.exists():
        print(f"[ERROR] DB 파일 없음: {DB_PATH}")
        sys.exit(1)

    if apply:
        backup = DB_PATH.with_name(f"erp_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db")
        with sqlite3.connect(DB_PATH) as _src, sqlite3.connect(backup) as _dst:
            _src.backup(_dst)
        print(f"[BACKUP] {backup}")

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # ── 현황 파악 ──────────────────────────────────────────────
    cur.execute("SELECT COUNT(*) FROM items WHERE process_type_code = 'BA'")
    ba_pt = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM items WHERE category = 'BA'")
    ba_cat = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM items WHERE erp_code LIKE '%-BA-%'")
    ba_erp = cur.fetchone()[0]

    print("\n[현황]")
    print(f"  items.process_type_code = 'BA'  : {ba_pt}건")
    print(f"  items.category = 'BA'           : {ba_cat}건")
    print(f"  items.erp_code LIKE '%-BA-%'    : {ba_erp}건")

    if ba_pt == 0 and ba_cat == 0 and ba_erp == 0:
        print("\n[OK] BA 잔재 없음. 마이그레이션 불필요.")
        conn.close()
        return

    if not apply:
        print("\n[DRY-RUN] 실제 변경 없음. --apply 플래그로 실행하세요.")
        conn.close()
        return
```
