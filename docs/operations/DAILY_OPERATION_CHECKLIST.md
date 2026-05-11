# 일일 운영 체크리스트 — DEXCOWIN MES

> 30명 동시 운영 기준. 매 근무일 시작 전, 운영 중, 종료 시 수행.

---

## 1. 아침 시작 점검 (오전 8시 전)

```
[ ] 서버 상태 확인
    python scripts/ops/preflight_30_users.py --url http://localhost:8000

[ ] 재고 무결성 점검 (서버 없이 직접 DB)
    python scripts/ops/check_inventory_integrity.py

[ ] 미처리 요청 확인 (전일 잔여 RESERVED 요청)
    - GET /api/stock-requests?status=reserved
    - 50건 초과 시 창고 담당자에게 알림

[ ] DB 백업 실행
    python scripts/ops/backup_db.py
```

**판정 기준:**
- preflight 전 항목 PASS → 운영 가능
- FAIL 1건 이상 → 장애 대응 절차 참조: docs/operations/INCIDENT_RESPONSE.md

---

## 2. 운영 전 확인 (첫 작업 시작 시)

```
[ ] PostgreSQL 확인 (DATABASE_URL 환경변수)
    echo $DATABASE_URL  # postgresql:// 로 시작해야 함

[ ] 로그인 담당자 PIN 확인
    - 모든 창고 담당자 PIN 설정 여부 확인

[ ] 동시 사용자 수 예측
    - 30명 초과 예상 시: 팀장에게 보고, PostgreSQL 연결풀 점검
```

---

## 3. 운영 중 모니터링 (30분마다)

```
[ ] 503 오류 발생 여부
    - 서버 로그 확인: 'database is locked' → BEGIN IMMEDIATE 정상 작동 중
    - 503 연속 3건 이상 → INCIDENT_RESPONSE.md §2 참조

[ ] 요청 대기 적체 여부
    - RESERVED 상태 요청이 급격히 증가하면 창고 담당자에게 승인 촉구

[ ] 재고 이상 여부
    - 음수 재고 알림 발생 시 즉시 ops/check_inventory_integrity.py 실행
```

---

## 4. 점심 시간 점검 (오전 근무 종료 후)

```
[ ] 재고 스냅샷 (필요 시)
    python scripts/ops/check_inventory_integrity.py > outputs/logs/integrity_noon.txt

[ ] 미승인 요청 재확인
    - 점심 전 제출된 요청 모두 처리되었는지 확인
```

---

## 5. 퇴근 전 마무리 (오후 6시)

```
[ ] DB 최종 백업
    python scripts/ops/backup_db.py

[ ] 오늘 처리 건수 확인
    - GET /health/detailed → transaction_logs 카운트 확인

[ ] 미처리 요청 0건 확인
    - GET /api/stock-requests?status=reserved
    - 잔여 요청 있으면 내일 첫 작업으로 처리 예약

[ ] 재고 무결성 최종 점검
    python scripts/ops/check_inventory_integrity.py

[ ] 서버 상태 보고 (팀장 Slack/메신저)
    형식: "금일 MES 정상 운영. 처리 건수 N건. 이상 없음."
    또는: "금일 MES [이상 내용]. 내일 [조치 계획]."
```

---

## 6. 주간 점검 (매주 금요일 퇴근 전)

```
[ ] 백업 파일 보관 확인
    - outputs/backups/ 에 주간 백업 파일 최소 5개 보관 여부
    - 오래된 백업(30일 초과) 정리

[ ] 성능 추이 확인 (부하 테스트)
    python scripts/ops/load_test_30_users.py --url http://localhost:8000 --confirm
    결과: outputs/load_test/ 폴더 확인

[ ] 동시성 테스트 실행 (개발 환경)
    cd backend && python -m pytest tests/concurrency/ -v

[ ] 로그 정리
    - outputs/logs/ 7일 초과 파일 정리

[ ] 운영 이슈 주간보고 업데이트
    - docs/주간보고.md 작성
```

---

## 참조 문서

| 상황 | 문서 |
|------|------|
| 장애 발생 | [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) |
| DB 백업/복구 | [scripts/ops/backup_db.py](../../scripts/ops/backup_db.py), [restore_db.py](../../scripts/ops/restore_db.py) |
| PostgreSQL 전환 | [POSTGRES_LOCAL_SERVER_RUNBOOK.md](POSTGRES_LOCAL_SERVER_RUNBOOK.md) |
| 동시 운영 | [CONCURRENT_LOCAL_OPERATION.md](CONCURRENT_LOCAL_OPERATION.md) |
| 30명 부하 테스트 | [scripts/ops/load_test_30_users.py](../../scripts/ops/load_test_30_users.py) |
| 무결성 점검 | [scripts/ops/check_inventory_integrity.py](../../scripts/ops/check_inventory_integrity.py) |
