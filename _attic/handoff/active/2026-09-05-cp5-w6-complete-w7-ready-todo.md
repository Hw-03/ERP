# CP5 W6 완료 · W7 `IC-19` 완료 기록

## 현재 정본

- 작업 위치: `C:\ERP\.worktrees\full-code-quality-checkpoint-2`
- branch: `codex/full-code-quality-improvement`
- 완료 기준 HEAD: `b27ba39cd2cbad574fda30af9c118697086c30ad`
- W6 제품 commit: `d43ab268cb6fa9dcde94e9b93203978f3550c73d`
- W6 CI 이식성 보완 commit: `dffb8e01e713d58e3d6df678ee98c0cfc20cd1e5`, `fd34189400f63225164c007bffcf7f561b813eb6`
- W7 제품 commit: `b27ba39cd2cbad574fda30af9c118697086c30ad`
- 최종 GitHub CI: run `33934558904`, 6/6 success
- 카드 상태: `IC-03`, `IC-06`, `IC-07`, `IC-08`, `IC-17`, `IC-18`, `IC-19` 완료. CP5는 완료했고 CP6는 시작하지 않았다.
- 엄격한 잔여 IC: 13개. `IC-04`·`IC-20` required-check 외부 증거가 확보되면 11개다.

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

## W7 `IC-19` 완료 결과

별도 구현 작업 한 개가 다음 범위를 RED→최소 구현→GREEN으로 완료했다.

1. `/health/live`는 DB·schema·inventory를 조회하지 않는 process/event-loop liveness만 반환한다.
2. `/health/ready`는 DB 연결, Alembic head, 필수 dependency, W5의 blocking integrity를 판정하고 실패 시 HTTP 503을 반환한다. warning-only는 ready를 막지 않는다.
3. `/health/detailed`는 readiness와 sanitized `inventory-integrity/v1` check ID·count를 제공하고 기존 응답 필드는 additive 호환한다.
4. 서버 startup과 frontend/E2E readiness wait는 `/health/ready`, Docker와 restart 판단은 `/health/live`를 사용한다.
5. status/watch/runtime scheduler는 alive와 ready를 구분한다.
6. 직원 동기화·배포 스크립트는 정적 계약만 수정·검증했고 실제 실행하지 않았다.
7. OpenAPI baseline과 backend/frontend 테스트를 새 endpoint 계약에 exact하게 맞췄다.

## 구현된 호출 경계

- `backend/app/main.py:367`의 `/health/live`는 DB dependency가 없는 liveness다.
- `backend/app/main.py:397-596`의 `/health/ready`는 W5 `inventory_integrity_engine`을 포함한 readiness의 단일 판정 경계다.
- `backend/app/main.py:647-706`의 `/health/detailed`는 같은 readiness 결과와 sanitized integrity 요약을 사용한다.
- `scripts/dev/start-backend.ps1`, `scripts/dev/runtime-control.ps1`, `scripts/dev/status-servers.ps1`, `scripts/dev/watch-service.ps1`은 startup·alive·ready 의미에 맞게 분리됐다.
- `docker/docker-compose.yml:53`의 restart healthcheck는 `/health/live`, `frontend/tests/e2e/global-setup.ts:56`의 readiness wait는 `/health/ready`를 사용한다.

## 검증·리뷰·Git 완료 증거

1. RED와 focused GREEN 증거를 `_attic/runtime/code-quality-improvement/20260905-081356/cp5-w7-ic19/`에 보존했다.
2. backend health/runtime focused 64건, Node 20 E2E readiness 7/7, PowerShell runtime batch·crash-loop와 OpenAPI exact가 통과했다.
3. 독립 명세 리뷰와 코드 품질 리뷰는 최종 Critical/Important/Minor 0이다.
4. 실제 PostgreSQL을 연결한 full gate 18/18과 Playwright 17/17이 통과했다.
5. 품질 `backend/mes.db` SHA-256은 `D0419DC051B881DA145B466AF99490570D18C47BCAAE990C57FFD4476FE28147`로 불변이고 임시 DB·listener·frozen UI diff는 0이다.
6. 제품 commit `b27ba39cd2cbad574fda30af9c118697086c30ad`를 기존 품질 branch에만 push했고 GitHub CI run `33934558904`는 6/6 success다.

## 금지·정지 경계

- 같은 worktree를 수정하는 구현 작업은 한 번에 하나만 실행한다.
- `C:\ERP` main은 읽기 전용이며 main 동기화·수정·서버·DB 작업을 하지 않는다.
- 개발·직원 서버에는 연결·실행·검사·변경하지 않는다.
- 새 branch, branch 전환, force-push, PR, main push/merge, 실제 배포·cutover는 금지다.
- 주간보고, 모바일 하단 tab, desktop shipping step 5 카드 크기·grid·overflow를 수정하지 않는다.
- W6 리뷰의 비차단 test harness Minor 2는 실제 CI 재현이 없으면 W7 범위를 넓히지 않는다.
- W7 완료 증거를 감사 계획과 이 문서에 반영했다. CP6는 별도 사용자 지시 전 시작하지 않는다.
