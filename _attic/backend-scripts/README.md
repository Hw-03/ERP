# backend 1회성 스크립트

2026-05-29 정리로 `backend/` 루트에서 이쪽으로 이동.

## 실행 방법

```bash
cd backend
python ../_attic/backend-scripts/seed_employees.py
python ../_attic/backend-scripts/seed_bom.py
python ../_attic/backend-scripts/backup_db.py --label nightly
```

각 스크립트의 `sys.path` 는 `backend/` 를 자동 추가하도록 패치됨 (`parents[2] / "backend"`).
다른 cwd 에서 실행해도 `from app.xxx` import 가 작동한다.

## 스크립트 목록

| 파일 | 용도 |
|---|---|
| `seed.py` | 시드 데이터 일괄 적재 (CSV → DB) |
| `seed_employees.py` | 직원 26명 시드 (참조 파일 기준 동기화) |
| `seed_bom.py` | BOM 계층 시드 (Level 1·2 구조) |
| `seed_bom_complete.py` | BOM 시드 (전체) |
| `sync_excel_stock.py` | xlsx 의 재고와 DB 동기화 |
| `archive_old_logs.py` | N개월 이전 트랜잭션 로그 아카이브 |
| `backup_db.py` | `backend/mes.db` → `_attic/data/db_backups/mes_backup_<ts>.db` |
