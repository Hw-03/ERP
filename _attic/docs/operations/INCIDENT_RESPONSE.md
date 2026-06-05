# 장애 대응 매뉴얼
**작성일**: 2026-05-08 | **대상**: DEXCOWIN MES 서버 담당자

---

## 즉시 연락처

> 담당자 정보를 여기에 기재하세요.

---

## 1. 재고 음수 발생

**증상**: preflight 또는 check_inventory_integrity.py 에서 음수 재고 감지

### 즉시 조치

```bash
# 1. 서버 즉시 중단 (추가 손상 방지)
# Ctrl+C 또는 프로세스 종료

# 2. 백업 생성
python scripts/ops/backup_db.py

# 3. 무결성 상세 점검
python scripts/ops/check_inventory_integrity.py

# 4. 음수 품목 조회 (SQLite)
sqlite3 backend/mes.db "SELECT i.item_id, it.item_code, i.warehouse_qty, i.quantity FROM inventory i JOIN item it ON it.item_id = i.item_id WHERE i.warehouse_qty < 0 OR i.quantity < 0;"
```

### 복구

```sql
-- 음수 warehouse_qty 0으로 정정 (원인 파악 후 적용)
UPDATE inventory SET warehouse_qty = 0 WHERE warehouse_qty < 0;
UPDATE inventory SET quantity = warehouse_qty + (
    SELECT COALESCE(SUM(quantity), 0) FROM inventory_location WHERE item_id = inventory.item_id
) WHERE item_id = '<문제 item_id>';
```

### 재개 조건

- `check_inventory_integrity.py` 전체 PASS
- preflight 전체 PASS

---

## 2. 503 연속 발생

**증상**: 직원들이 "서버 과부하 — 잠시 후 다시 시도하세요." 메시지를 지속적으로 받음

### 원인 판단

| 패턴 | 원인 | 조치 |
|------|------|------|
| SQLite 사용 중, 동시 사용자 10명 초과 | `database is locked` busy_timeout 초과 | PostgreSQL 전환 (필수) |
| PostgreSQL 사용 중, 503 발생 | 서버 과부하 또는 connection pool 고갈 | workers 수 증가, pool_size 확인 |
| 간헐적 (10분에 1~2건) | 순간 부하 집중 | 무시 or --workers 증가 |

### SQLite → PostgreSQL 전환 (긴급)

```bash
# 1. 서버 중단
# 2. Docker PostgreSQL 기동
docker compose -f docker/docker-compose.yml up -d postgres

# 3. .env 수정
echo "DATABASE_URL=postgresql://mes_user:mes_pass@localhost:5432/mes_db" >> backend/.env

# 4. 마이그레이션
cd backend && python bootstrap_db.py

# 5. 서버 재시작
python -m uvicorn app.main:app --host 0.0.0.0 --port 8010 --workers 2

# 6. preflight
python scripts/ops/preflight_30_users.py --url http://localhost:8010
```

---

## 3. 서버 다운 (응답 없음)

**증상**: `/health` 엔드포인트 무응답, 직원 전체 접속 불가

### 재시작 절차

```bash
# 1. 프로세스 확인
ps aux | grep uvicorn

# 2. 강제 종료 (필요시)
kill -9 <PID>

# 3. PostgreSQL 상태 확인
docker compose -f docker/docker-compose.yml ps postgres

# PostgreSQL이 멈춘 경우
docker compose -f docker/docker-compose.yml restart postgres
# 30초 대기

# 4. 서버 재시작
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8010 --workers 2

# 5. 확인
curl http://localhost:8010/health
python scripts/ops/preflight_30_users.py --url http://localhost:8010
```

---

## 4. 데이터 손상 의심 / 백업 복구

### SQLite 복구 (권장: restore_db.py 사용)

```bash
# 최신 백업 확인
ls -lt outputs/backups/mes_*.db | head -5

# 복구 (현재 DB를 .pre-restore로 자동 백업 후 복구)
python scripts/ops/restore_db.py \
    --sqlite outputs/backups/mes_YYYYMMDD_HHMMSS.db \
    --target backend/mes.db \
    --check

# 무결성 자동 확인됨 (--check 플래그)
```

### PostgreSQL 복구 (권장: restore_db.py 사용)

```bash
# 최신 백업 확인
ls -lt outputs/backups/mes_*.sql | head -5

# Docker 컨테이너 기준 복구
CONTAINER=$(docker ps --filter "name=postgres" --format "{{.Names}}" | head -1)
python scripts/ops/restore_db.py \
    --postgres outputs/backups/mes_YYYYMMDD_HHMMSS.sql \
    --container $CONTAINER \
    --check

# 직접 호스트 기준
python scripts/ops/restore_db.py \
    --postgres outputs/backups/mes_YYYYMMDD_HHMMSS.sql \
    --host localhost --port 5432 --user mes_user --dbname mes_db \
    --check
```

### 복구 후 필수 검증

```bash
# 무결성 점검
python scripts/ops/check_inventory_integrity.py

# preflight 전체 통과 확인
python scripts/ops/preflight_30_users.py --url http://localhost:8010
```

### 복구 리허설 (매주 금요일 권장)

```bash
# 1. 현재 상태 백업
python scripts/ops/backup_db.py

# 2. 임시 경로에 복구 테스트 (운영 DB 미변경)
python scripts/ops/restore_db.py \
    --sqlite outputs/backups/mes_LATEST.db \
    --target /tmp/mes_rehearsal_test.db \
    --check

# 3. 임시 DB 무결성 직접 확인
DATABASE_URL=sqlite:////tmp/mes_rehearsal_test.db \
    python scripts/ops/check_inventory_integrity.py

# 4. 정상 확인 후 임시 파일 삭제
rm /tmp/mes_rehearsal_test.db
echo "복구 리허설 완료"
```

---

## 5. 409 Conflict 빈발

**증상**: 직원들이 "이미 처리된 요청입니다." 메시지를 받으나 작업이 완료되지 않은 것처럼 보임

### 원인

- `client_request_id` 중복 감지 → 기존 요청 반환 (정상 동작)
- 화면 새로고침 후 재시도하면 정상 진행

### 확인

```bash
# 최근 409 발생 현황
grep "409" <서버 로그> | tail -20
```

- 409는 정상 멱등 응답. 실제 재고 이상이 없으면 조치 불필요.

---

## 6. 재고 총량 불일치

**증상**: `check_inventory_integrity.py` 에서 총량 불일치 감지

### 수동 재동기화

```bash
# 서버 API 활용 (정합성 복구 엔드포인트)
curl -X POST http://localhost:8010/api/settings/sync-totals -H "Content-Type: application/json" -d '{"pin": "<관리자PIN>"}'
```

---

## 7. 정기 점검 체크리스트

매일 출근 후:
```bash
python scripts/ops/preflight_30_users.py --url http://localhost:8010
```

주 1회:
```bash
python scripts/ops/backup_db.py
python scripts/ops/check_inventory_integrity.py
```

---

## 참고

- PostgreSQL 운영 매뉴얼: `docs/operations/POSTGRES_LOCAL_SERVER_RUNBOOK.md`
- 동시 운영 가이드: `docs/operations/CONCURRENT_LOCAL_OPERATION.md`
- 30명 안정성 점수: `docs/research/2026-05-08-30-user-readiness-score.md`
