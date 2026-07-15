# 일일 운영 체크리스트 — DEXCOWIN MES

> 30명 동시 운영 기준. 매 근무일 시작 전, 운영 중, 종료 시 수행.

---

## 1. 아침 시작 점검 (오전 8시 전)

```
[ ] DB 백업 실행
    scripts\ops\backup_db.bat

[ ] 운영 readiness 게이트
    scripts\ops\operational_readiness.bat

[ ] 서버 상태 확인
    scripts\ops\healthcheck.bat

[ ] 재고 무결성 점검 (서버 없이 직접 DB)
    python scripts/ops/check_inventory_integrity.py

[ ] 미처리 요청 확인 (전일 잔여 RESERVED 요청)
    - GET /api/stock-requests?status=reserved
    - 50건 초과 시 창고 담당자에게 알림
```

**판정 기준:**
- `operational_readiness.bat` 마지막 줄이 `PASS operational readiness` → 운영 시작 가능
- WARN missing transaction effects는 과거 거래의 자동 역취소 근거 부족 경고이며, FAIL이 아니면 신규 입출고 시작 차단 조건은 아님. 해당 과거 거래 자동 취소는 거부되므로 필요 시 히스토리/현재 재고 대조 후 별도 보정 거래로 처리
- `FAIL latest backup` → `backup_db.bat` 실행 후 readiness 재실행
- 그 외 readiness 또는 healthcheck FAIL 1건 이상 → 입출고 시작 금지, 장애 대응 절차 참조: docs/operations/INCIDENT_RESPONSE.md

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
    powershell -Command "New-Item -ItemType Directory -Force _attic/runtime/reports | Out-Null"
    python scripts/ops/check_inventory_integrity.py > _attic/runtime/reports/integrity_noon.txt

[ ] 미승인 요청 재확인
    - 점심 전 제출된 요청 모두 처리되었는지 확인
```

---

## 5. 퇴근 전 마무리 (오후 6시)

```
[ ] DB 최종 백업
    scripts\ops\backup_db.bat

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
    - _attic/runtime/backups/sqlite/ 에 정식 백업 최신 10개 보관 여부
    - mes_PRE-* 스냅샷이 정식 백업 10개 보존 계산에서 제외되는지 확인

[ ] 성능 추이 확인 (부하 테스트)
    python scripts/ops/load_test_30_users.py --url http://localhost:8011 --confirm
    결과: _attic/runtime/reports/load-test/ 폴더 확인

[ ] 동시성 테스트 실행 (개발 환경)
    cd backend && python -m pytest tests/concurrency/ -v

[ ] 로그 정리
    - _attic/runtime/logs/ 의 운영 정책 초과 파일 정리

[ ] 운영 이슈 주간보고 업데이트
    - docs/주간보고.md 작성
```

---

## 참조 문서

| 상황 | 문서 |
|------|------|
| 장애 발생 | [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) |
| 운영 시작 게이트 | [scripts/ops/operational_readiness.bat](../../scripts/ops/operational_readiness.bat) |
| DB 백업/복구 | [scripts/ops/backup_db.bat](../../scripts/ops/backup_db.bat), [verify_backup.bat](../../scripts/ops/verify_backup.bat), [restore_db.bat](../../scripts/ops/restore_db.bat) |
| PostgreSQL 전환 | [POSTGRES_LOCAL_SERVER_RUNBOOK.md](POSTGRES_LOCAL_SERVER_RUNBOOK.md) |
| 동시 운영 | [CONCURRENT_LOCAL_OPERATION.md](CONCURRENT_LOCAL_OPERATION.md) |
| 30명 부하 테스트 | [scripts/ops/load_test_30_users.py](../../scripts/ops/load_test_30_users.py) |
| 무결성 점검 | [scripts/ops/check_inventory_integrity.py](../../scripts/ops/check_inventory_integrity.py) |
## WARN missing transaction effects 처리 기준

`operational_readiness.bat`가 `WARN missing transaction effects: N`을 보여도 마지막 줄이 `PASS operational readiness`이면 당일 신규 입출고 시작을 막는 조건은 아니다. 이 경고는 과거 거래 로그에 자동 취소 근거가 부족하다는 뜻이다.

샘플 확인이 필요하면 아래 명령을 직접 실행한다.

```bat
python scripts\ops\check_inventory_integrity.py
```

직접 실행 결과에는 `transaction_type`, `count`, `sample_log_id`, `sample_mes_code`가 표시된다. 해당 과거 거래를 취소 버튼으로 되돌리려 하지 말고, 히스토리와 현재 재고를 대조한 뒤 필요한 경우 별도 보정 거래로 처리한다.

---

## Inventory Cutover Day

엑셀 운영을 중단하고 DEXCOWIN MES 기준 재고로 전환하는 날에는 일반 일일 체크리스트보다 먼저 아래 절차를 수행한다.

```
[ ] 업무 사용 중지
[ ] 기준 재고 입력 파일 준비
[ ] dry-run 실행
    python scripts\ops\inventory_cutover.py C:\path\real_inventory.csv

[ ] dry-run 요약 확인
    - items updated 예상 수량 확인
    - unknown/duplicate/missing mes_code 없음 확인
    - 삭제 예정 history/map 수량 확인

[ ] 실제 적용
    python scripts\ops\inventory_cutover.py C:\path\real_inventory.csv --apply --confirm START-OVER

[ ] 재고 무결성 확인
    python scripts\ops\check_inventory_integrity.py

[ ] 운영 준비 확인
    scripts\ops\operational_readiness.bat

[ ] PASS operational readiness 확인 후 업무 시작
```

상세 절차는 `_attic/docs/operations/INVENTORY_CUTOVER_RUNBOOK.md`를 따른다.
