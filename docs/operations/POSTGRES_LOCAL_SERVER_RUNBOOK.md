# PostgreSQL 로컬 서버 운영 매뉴얼
**작성일**: 2026-05-08 | **대상**: 30명 동시 운영 서버 담당자

---

## 1. 사전 요구사항

```bash
# Docker 설치 확인
docker --version        # Docker 20.x 이상
docker compose version  # Docker Compose v2.x 이상

# Python 3.11+ 확인
python --version
```

Docker Desktop이 없으면 [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/) 에서 설치.

---

## 2. PostgreSQL 기동

```bash
# 프로젝트 루트에서 실행
docker compose -f docker/docker-compose.yml up -d postgres

# 상태 확인 (healthy 상태가 될 때까지 30초 내외 소요)
docker compose -f docker/docker-compose.yml ps postgres
```

접속 정보 (기본값):
| 항목 | 값 |
|------|-----|
| 호스트 | localhost:5432 |
| DB 이름 | mes_db |
| 사용자 | mes_user |
| 비밀번호 | mes_pass |

---

## 3. 환경변수 설정

`backend/.env` 파일을 생성(없으면) 또는 수정:

```bash
# backend/.env
DATABASE_URL=postgresql://mes_user:mes_pass@localhost:5432/mes_db
```

SQLite로 운영하던 기존 서버라면 `.env`에 해당 줄이 없거나 sqlite가 적혀 있을 수 있다.

---

## 4. 데이터베이스 마이그레이션

```bash
cd backend
python bootstrap_db.py
```

출력 예시:
```
applied=N skipped=M
Bootstrap 완료.
```

`applied` 가 0 이어도 정상 (이미 최신 상태).

---

## 5. 서버 시작

```bash
cd backend
# 30명 기준: workers 2 권장 (CPU 코어 수에 따라 조정)
python -m uvicorn app.main:app --host 0.0.0.0 --port 8010 --workers 2
```

> **주의**: `--reload` 플래그는 `--workers`와 함께 사용 불가. 운영 서버에서는 제거.

서버 시작 확인:
```bash
curl http://localhost:8010/health
# {"status":"ok"}
```

---

## 6. 운영 전 preflight 점검

매일 출근 후 서버 시작 전 실행:

```bash
python scripts/ops/preflight_30_users.py --url http://localhost:8010
```

**반드시 전체 PASS 후 직원들에게 사용 안내.**

점검 항목:
- ✅ 서버 연결
- ✅ DB 엔진 (PostgreSQL 확인)
- ✅ 재고 음수 없음
- ✅ 예약 일관성
- ✅ 미처리 요청 수
- ✅ 응답시간
- ✅ 동시 30요청

---

## 7. 정기 백업

### 자동 백업 (Windows — 작업 스케줄러 등록 권장)
```bat
scripts\ops\backup_db.bat
```

### 수동 백업 (PostgreSQL)
```bash
docker exec <postgres-container> pg_dump -U erp_user erp_db > backup_$(date +%Y%m%d).sql
```

### 수동 백업 확인
```bash
python scripts/ops/_verify_backup.py
```

---

## 8. 장애 복구

### PostgreSQL 컨테이너 재시작
```bash
docker compose -f docker/docker-compose.yml restart postgres
# 30초 대기 후
docker compose -f docker/docker-compose.yml ps postgres
```

### 서버 PC 재부팅 후 재시작 절차
1. Docker Desktop 실행 (시스템 트레이 아이콘 확인)
2. PostgreSQL 기동: `docker compose -f docker/docker-compose.yml up -d postgres`
3. 약 30초 대기
4. 서버 시작: `python -m uvicorn app.main:app --host 0.0.0.0 --port 8010 --workers 2`
5. preflight 실행: `python scripts/ops/preflight_30_users.py --url http://localhost:8010`

### 백업 복구
```bash
# 백업 파일로 복구 (PostgreSQL)
docker exec -i <postgres-container> psql -U mes_user mes_db < backup_20260508.sql

# 복구 후 마이그레이션 재실행
cd backend && python bootstrap_db.py
```

---

## 9. 방화벽 / 네트워크 설정

직원 PC에서 서버에 접속하려면 Windows 방화벽에서 포트 8010을 허용:

```powershell
# 관리자 PowerShell에서
New-NetFirewallRule -DisplayName "MES Server" -Direction Inbound -Protocol TCP -LocalPort 8010 -Action Allow
```

서버 PC 절전 방지:
- 설정 → 전원 및 절전 → 절전 모드: **없음**
- 디스플레이 끄기: **없음** (또는 원하는 시간)

---

## 10. 30명 운영 전 최종 체크리스트

- [ ] Docker Desktop 실행 중
- [ ] `docker compose ps postgres` → healthy
- [ ] `backend/.env`에 `DATABASE_URL=postgresql://...` 설정됨
- [ ] `python bootstrap_db.py` 완료
- [ ] 서버 시작 (--workers 2)
- [ ] `preflight_30_users.py` 전체 PASS
- [ ] 직원들에게 서버 IP 공유: `http://<서버IP>:8010`

---

---

## 11. pg_dump / pg_restore 예시

### 백업 생성

```bash
# 자동화 스크립트 사용 (권장)
python scripts/ops/backup_db.py --postgres --container <컨테이너명>

# 또는 직접 실행
CONTAINER=$(docker ps --filter "name=postgres" --format "{{.Names}}" | head -1)
docker exec $CONTAINER pg_dump -U mes_user mes_db > outputs/backups/mes_$(date +%Y%m%d_%H%M%S).sql
```

### 복구 (스크립트 사용)

```bash
# 운영 DB 복구 (컨테이너 기준)
python scripts/ops/restore_db.py \
    --postgres outputs/backups/mes_YYYYMMDD_HHMMSS.sql \
    --container $CONTAINER \
    --check

# 복구 후 무결성 자동 확인 포함
```

### 복구 리허설 (임시 DB로 안전하게 테스트)

```bash
# 1. 임시 DB 생성
CONTAINER=$(docker ps --filter "name=postgres" --format "{{.Names}}" | head -1)
docker exec $CONTAINER createdb -U mes_user mes_db_rehearsal

# 2. 백업 복구 to 임시 DB
docker cp outputs/backups/mes_LATEST.sql $CONTAINER:/tmp/rehearsal.sql
docker exec $CONTAINER psql -U mes_user -d mes_db_rehearsal -f /tmp/rehearsal.sql

# 3. 무결성 점검
DATABASE_URL=postgresql://mes_user:mes_pass@localhost:5432/mes_db_rehearsal \
    python scripts/ops/check_inventory_integrity.py

# 4. 임시 DB 삭제
docker exec $CONTAINER dropdb -U mes_user mes_db_rehearsal
echo "PostgreSQL 복구 리허설 완료"
```

---

## 참고 링크

- 동시성 설계 상세: `docs/research/2026-05-08-concurrent-io-hardening-audit.md`
- 30명 운영 안정성 점수: `docs/research/2026-05-08-30-user-readiness-score-100.md`
- 동시 운영 가이드: `docs/operations/CONCURRENT_LOCAL_OPERATION.md`
