---
type: file-explanation
source_path: "scripts/ops/_verify_backup.py"
importance: important
layer: scripts
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# _verify_backup.py — _verify_backup.py 설명

## 이 파일은 무엇을 책임지나

`_verify_backup.py`는 운영자가 백업, 복구, 헬스체크, 정합성 확인에 쓰는 운영 스크립트입니다.

## 업무 흐름에서의 의미

운영 중 장애 대응, 백업, 복구, 정합성 점검처럼 실제 데이터 안전과 연결됩니다.

## 언제 보면 좋나

- 운영 점검, 백업, 복구, 정합성 확인이 필요할 때
- 장애 대응 절차를 검토할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `main`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/docs/operations/DAILY_OPERATION_CHECKLIST.md]] — `DAILY_OPERATION_CHECKLIST.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.
- [[ERP/docs/operations/INCIDENT_RESPONSE.md]] — `INCIDENT_RESPONSE.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.
- [[ERP/backend/app/services/integrity.py]] — `integrity.py`는 `integrity` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.

## 조심할 점

운영 스크립트는 실제 DB 파일이나 백업 파일을 건드릴 수 있습니다. 실행 전 대상 경로를 확인해야 합니다.

## 핵심 발췌

```python
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
```
