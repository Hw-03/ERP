---
type: code-note
project: DEXCOWIN MES
layer: scripts
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/scripts/dev/backfill_audit_csv.py
tags: [vault, code-note, b-tier]
---

# backfill_audit_csv.py — 입출고 거래 → 감시용 CSV 일괄 생성

> [!summary] 역할
> DB TransactionLog를 기준으로 월별 CSV(backend/data/audit_csv/inout_YYYY-MM.csv) 재작성. Idempotent.

## 1. 이 파일의 역할
- 사용법: python scripts/dev/backfill_audit_csv.py (기본 덮어쓰기)
- AUDIT_CSV_DIR 환경변수로 저장 경로 override 가능
- DATABASE_URL 환경변수로 DB 변경 가능 (기본: SQLite)
- audit_csv.backfill_all(db, overwrite=True) 호출 → 월별 파일 생성

## 2. 실제 원본 위치
`scripts/dev/backfill_audit_csv.py` — 50줄

## 3. 주요 import
```python
from pathlib import Path
from dotenv import load_dotenv
from app.database import SessionLocal
from app.services import audit_csv
```

## 4. 어디서 쓰이는지
- 운영 초기: 거래 CSV 일괄 내보내기
- 감사 목적: CSV 아카이빙
- 외부 시스템 연동: 거래 데이터 시드

## 5. ⚠️ 위험 포인트
- **overwrite=True** — 기존 CSV 덮어쓰기. 누락된 거래 있으면 손실 가능
- app.services.audit_csv 모듈 의존 — 구현부 확인 필수
- AUDIT_CSV_DIR 누락 시 기본 경로(get_csv_dir()) 사용 — 경로 충돌 주의

## 6. 수정 전 체크
- python scripts/dev/backfill_audit_csv.py 실행 후 CSV 파일 생성 확인
- inout_YYYY-MM.csv 파일명 형식 확인
- 행 개수와 DB 거래 개수 일치 확인
