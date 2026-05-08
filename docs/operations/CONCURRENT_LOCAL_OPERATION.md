# 30명 동시 운영 가이드
**작성일**: 2026-05-08

---

## SQLite vs PostgreSQL 안전 범위

| 항목 | SQLite (기본) | PostgreSQL (권장) |
|------|--------------|------------------|
| 동시 쓰기 안전 범위 | **10명 이하** | **30명 이상** |
| 재고 락 방식 | WAL + busy_timeout 직렬화 | row-level FOR UPDATE |
| 동시 승인 충돌 | 대기 후 멱등 처리 | row lock으로 직렬화 |
| 503 발생 가능성 | 10명 초과 동시 쓰기 시 높음 | 거의 없음 |
| 설정 난이도 | 없음 (기본값) | Docker 설치 필요 |

**결론**: 30명 동시 운영은 PostgreSQL을 사용하세요.

---

## PostgreSQL 전환 방법

### 1. docker-compose.yml 설정

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: mes_db
      POSTGRES_USER: mes
      POSTGRES_PASSWORD: mes_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

### 2. DATABASE_URL 변경

`.env` 파일 (또는 서버 환경변수):

```
DATABASE_URL=postgresql://mes:mes_password@localhost:5432/mes_db
```

SQLite(기본):
```
DATABASE_URL=sqlite:///./mes.db
```

### 3. 마이그레이션 실행

```bash
cd backend
python bootstrap_db.py
```

---

## 서버 PC 운영 주의사항

### 필수 체크리스트 (30명 운영 시작 전)

- [ ] PostgreSQL 실행 확인: `docker ps | grep postgres`
- [ ] `DATABASE_URL` 환경변수 설정 확인
- [ ] `python bootstrap_db.py` — 마이그레이션 완료 확인
- [ ] 서버 시작: `python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`
- [ ] 접속 확인: `http://<서버IP>:8000/health` → `{"status": "ok"}`

### SQLite로 운영 시 (10명 이하)

- `mes.db` 파일은 서버 PC의 `backend/` 폴더에 위치
- 작업 전 반드시 백업: `cp mes.db mes.db.backup.$(date +%Y%m%d)`
- 동시 사용자 10명 초과 시 503 오류 발생 가능 (자동 재시도 필요)

---

## 자주 발생하는 오류와 대처법

### 503 Service Unavailable
**원인**: SQLite busy_timeout(5초) 초과 — 동시 쓰기 경합  
**대처**: 잠시 후 재시도. 지속 발생 시 PostgreSQL 전환 필요.

### 409 Conflict — "요청 코드 생성 충돌"
**원인**: 극히 드문 request_code 충돌 (1/65,536 확률)  
**대처**: 화면을 새로고침 후 다시 요청.

### 409 Conflict — "이미 처리된 요청입니다"
**원인**: 네트워크 재전송으로 동일 요청이 중복 도착  
**대처**: 정상 동작 — 기존 요청이 반환됨. 별도 조치 불필요.

---

## 부하 테스트 실행 방법

실제 서버 대상 30명 시나리오 테스트:

```bash
# 사전 확인 (실행 없음)
python scripts/ops/load_test_30_users.py --url http://서버IP:8000 --dry-run

# 실제 실행 (테스트 DB 필수)
python scripts/ops/load_test_30_users.py --url http://서버IP:8000 --users 30 --rounds 3 --confirm
```

**주의**: `--confirm` 없이는 실행되지 않습니다. TEST- 코드의 직원/품목만 사용합니다.  
결과는 `outputs/load_test/YYYYMMDD_HHMMSS_report.json`에 저장됩니다.

---

## 백엔드 동시성 테스트

```bash
cd backend
python -m pytest tests/concurrency/ -v
```

| 테스트 | 내용 |
|--------|------|
| `test_reserve_concurrent.py` | 30스레드 동시 reserve — 음수 재고 없음 |
| `test_approve_concurrent.py` | 10스레드 동시 approve — 중복 처리 없음 |
| `test_request_code_unique.py` | 100스레드 동시 생성 — 코드 중복 없음 |
