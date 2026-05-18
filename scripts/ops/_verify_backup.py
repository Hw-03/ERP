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
