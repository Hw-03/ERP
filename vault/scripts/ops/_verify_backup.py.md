---
type: code-note
project: ERP
layer: scripts
source_path: scripts/ops/_verify_backup.py
status: active
updated: 2026-04-27
source_sha: ffd95c593753
tags:
  - erp
  - scripts
  - ops-script
  - py
---

# _verify_backup.py

> [!summary] 역할
> 운영자가 백업, 복구, 점검, 정합성 확인을 할 때 실행하는 보조 스크립트다.

## 원본 위치

- Source: `scripts/ops/_verify_backup.py`
- Layer: `scripts`
- Kind: `ops-script`
- Size: `1160` bytes

## 연결

- Parent hub: [[scripts/ops/ops|scripts/ops]]
- Related: [[scripts/scripts]]

## 읽는 포인트

- 실행 전 대상 DB/파일 경로를 확인한다.
- 운영 스크립트는 백업 여부와 되돌림 절차를 먼저 본다.

## 원본 발췌

````python
"""verify_backup.bat 가 호출하는 헬퍼.

인자: 검증할 .db 파일 경로
출력: integrity_check + 핵심 테이블 행수
종료코드: integrity 가 'ok' 면 0, 그렇지 않으면 1
"""

import sqlite3
import sys


TABLES = ["items", "inventory", "transaction_logs", "bom", "admin_audit_logs"]


def main(path: str) -> int:
    c = sqlite3.connect(path)
    try:
        integrity = c.execute("PRAGMA integrity_check").fetchone()[0]
        print(f"integrity     : {integrity}")
        existing = {
            r[0]
            for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        }
        for t in TABLES:
            if t in existing:
                n = c.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
                print(f"{t:18}: {n} rows")
            else:
                print(f"{t:18}: (absent)")
        return 0 if integrity == "ok" else 1
    finally:
        c.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: _verify_backup.py <db-path>", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
