# CP5 W6 완료 · W7 `IC-19` 진입 TODO

## 현재 정본

- 작업 위치: `C:\ERP\.worktrees\full-code-quality-checkpoint-2`
- branch: `codex/full-code-quality-improvement`
- 실행 기준 HEAD: `fd34189400f63225164c007bffcf7f561b813eb6`
- W6 제품 commit: `d43ab268cb6fa9dcde94e9b93203978f3550c73d`
- W6 CI 이식성 보완 commit: `dffb8e01e713d58e3d6df678ee98c0cfc20cd1e5`, `fd34189400f63225164c007bffcf7f561b813eb6`
- 최종 GitHub CI: run `33923104275`, 6/6 success
- 카드 상태: `IC-03`, `IC-06`, `IC-07`, `IC-08`, `IC-17`, `IC-18` 완료. CP5의 남은 단일 카드는 W7 `IC-19`다.
- 엄격한 잔여 IC: 14개. `IC-04`·`IC-20` required-check 외부 증거가 확보되면 12개다.

## W6 완료 계약과 증거

1. `backup-manifest/v1`은 artifact 뒤에 원자 publish하며 SHA-256·size·engine·Alembic revision·schema fingerprint·data revision·snapshot hash·검증 receipt를 보존한다.
2. manifest 없는 기존 backup은 `LEGACY_UNVERIFIED`이고 새 PASS로 승격하지 않는다.
3. SQLite online backup은 WAL을 포함하며 source 후속 WAL commit 뒤 이전 backup은 stale다.
4. restore는 staged DB에서 Alembic head·schema·FK·W5 integrity를 통과한 뒤에만 target 교체를 허용한다.
5. PostgreSQL dump는 폐기 가능한 임시 DB에 먼저 복구·검증하고 검증 전 target을 drop하지 않는다.
6. retention·NAS·cleanup은 artifact와 manifest를 한 쌍으로 처리한다.
7. SQLite manifest 146/146, retention 11/11, 실제 PostgreSQL 28/28, canonical PostgreSQL runner 129 scenarios 100%가 통과했다.
8. 최종 GitHub CI run `33923104275`의 6개 job이 모두 success다.
9. 제품 독립 리뷰는 Critical/Important/Minor 0이다. 마지막 test-only CI 이식성 보완은 Critical/Important 0, 비차단 Minor 2다.
10. 증거 정본은 `_attic/runtime/code-quality-improvement/20260904-082523/cp5-w6-ic18/`이다.
11. 품질 `backend/mes.db` 기준 SHA-256은 `D0419DC051B881DA145B466AF99490570D18C47BCAAE990C57FFD4476FE28147`이며 W6 전후 불변이다.
12. W6 종료 기준 일회용 PostgreSQL DB는 0이고 8021·3100·3300·55432 listener도 0이다. W7은 이 값을 오염 없는 시작·종료 기준으로 사용한다.

## 다음 단일 작업: W7 `IC-19`

별도 구현 작업 한 개가 다음 범위만 RED→최소 구현→GREEN으로 수행한다.

1. `/health/live`는 DB·schema·inventory를 조회하지 않는 process/event-loop liveness만 반환한다.
2. `/health/ready`는 DB 연결, Alembic head, 필수 dependency, W5의 blocking integrity를 판정하고 실패 시 HTTP 503을 반환한다. warning-only는 ready를 막지 않는다.
3. `/health/detailed`는 readiness와 sanitized `inventory-integrity/v1` check ID·count를 제공하고 기존 응답 필드는 한 release 동안 additive 호환한다.
4. 서버 startup, frontend/E2E readiness wait는 `/health/ready`를 사용한다.
5. Docker와 restart 판단은 `/health/live`만 사용해 data mismatch가 restart loop를 만들지 않게 한다.
6. status/watch/runtime scheduler는 alive와 ready를 구분해 nonzero readiness를 정상처럼 표시하지 않는다.
7. 직원 동기화·배포 스크립트는 정적 계약 테스트만 하며 실제 실행하지 않는다.
8. OpenAPI baseline과 backend/frontend 테스트를 새 endpoint 계약에 exact하게 맞춘다.

## 확인된 호출 경계

- `backend/app/main.py`의 기존 `/health/live`는 DB dependency와 `SELECT 1`을 사용하므로 첫 RED 대상이다.
- 같은 파일의 `/health/detailed`와 W5 `inventory_integrity_engine`을 ready/detailed의 단일 판정 경계로 연결한다.
- `scripts/dev/start-backend.ps1`, `scripts/dev/runtime-control.ps1`, `scripts/dev/status-servers.ps1`, `scripts/dev/runtime-task-control.ps1`의 startup/status consumer를 실제 의미에 맞게 전환한다.
- `docker/docker-compose.yml`의 restart healthcheck는 `/health/live`를 유지한다.
- `frontend/tests/e2e/global-setup.ts`의 readiness wait는 `/health/ready`를 사용한다.
- 기존 출발 테스트는 `backend/tests/routers/test_health_smoke.py`와 `backend/tests/services/test_inventory_integrity_contract.py`다.

## 검증·리뷰·Git 순서

1. health endpoint와 운영 consumer의 실패 테스트를 먼저 작성해 RED를 보존한다.
2. 최소 제품 변경으로 focused GREEN을 만든다.
3. backend health/integrity, PowerShell runtime/static contract, E2E readiness와 OpenAPI exact를 검증한다.
4. 독립 명세 리뷰와 코드 품질 리뷰의 Critical/Important를 0으로 만든다.
5. `git diff --check`와 staged smart gate를 통과한다.
6. 최종 통합 위험 때문에 전체 `verify_local.ps1 -Mode full -DbReadOnlyCheck -IncludeE2E`를 한 번 실행한다.
7. 품질 `backend/mes.db` hash, 격리 DB, 8021·3100·3300·55432 listener, frozen UI diff를 재확인한다.
8. 기존 품질 branch에만 commit/push하고 GitHub CI 6/6 success를 확인한다.
9. 감사 계획과 active handoff를 실제 commit·CI·증거에 맞춰 닫은 뒤 CP5 Goal만 완료한다.

## 금지·정지 경계

- 같은 worktree를 수정하는 구현 작업은 한 번에 하나만 실행한다.
- `C:\ERP` main은 읽기 전용이며 main 동기화·수정·서버·DB 작업을 하지 않는다.
- 개발·직원 서버에는 연결·실행·검사·변경하지 않는다.
- 새 branch, branch 전환, force-push, PR, main push/merge, 실제 배포·cutover는 금지다.
- 주간보고, 모바일 하단 tab, desktop shipping step 5 카드 크기·grid·overflow를 수정하지 않는다.
- W6 리뷰의 비차단 test harness Minor 2는 실제 CI 재현이 없으면 W7 범위를 넓히지 않는다.
- W7 완료 전 CP5 Goal을 완료하지 않고, CP5 완료 뒤에도 CP6는 시작하지 않는다.
