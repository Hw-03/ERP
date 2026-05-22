---
type: file-explanation
source_path: "_attic/scripts/migrations/_archive/migrate_bf_to_af.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# migrate_bf_to_af.py — migrate_bf_to_af.py 설명

## 이 파일은 무엇을 책임지나

`migrate_bf_to_af.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

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
"""BF → AF 마이그레이션 스크립트.

기존 DB의 process_type_code='BF', category='BF' 데이터를 'AF'로 변경하고
누락 공정 코드(NR, NF, AF, PF)를 process_types 테이블에 추가한다.

사용법:
  dry-run (기본):  python scripts/migrations/migrate_bf_to_af.py
  실제 적용:       python scripts/migrations/migrate_bf_to_af.py --apply
"""

import argparse
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent.parent.parent / "backend" / "erp.db"

NEW_PROCESS_TYPES = [
    ("NR", "N", "R", 48, "튜닝 원자재"),
    ("NF", "N", "F", 52, "튜닝 F타입"),
    ("AF", "A", "F", 62, "조립 F타입"),
    ("PF", "P", "F", 72, "출하 F타입"),
]


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
    cur.execute("SELECT COUNT(*) FROM items WHERE process_type_code = 'BF'")
    bf_pt = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM items WHERE category = 'BF'")
    bf_cat = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM items WHERE erp_code LIKE '%-BF-%'")
    bf_erp = cur.fetchone()[0]
    cur.execute("SELECT code FROM process_types ORDER BY stage_order")
    existing_codes = {row[0] for row in cur.fetchall()}

    print(f"\n[현황]")
    print(f"  items.process_type_code = 'BF'  : {bf_pt}건")
    print(f"  items.category = 'BF'           : {bf_cat}건")
    print(f"  items.erp_code LIKE '%-BF-%'    : {bf_erp}건")
```
