# CP5 W5 완료 · W6 `IC-18` TODO [완료]

## 현재 정본

- 작업 위치: `C:\ERP\.worktrees\full-code-quality-checkpoint-2`
- branch: `codex/full-code-quality-improvement`
- W6 최종 제품·CI 보완 HEAD: `fd34189400f63225164c007bffcf7f561b813eb6`
- W6 제품 commit: `d43ab268cb6fa9dcde94e9b93203978f3550c73d`
- W6 CI 이식성 보완 commit: `dffb8e01e713d58e3d6df678ee98c0cfc20cd1e5`, `fd34189400f63225164c007bffcf7f561b813eb6`
- 최종 GitHub CI: run `33923104275`, 6/6 success
- 카드 상태: `IC-03`, `IC-06`, `IC-07`, `IC-08`, `IC-17`, `IC-18` 완료. CP5 W6 완료. 다음 단일 범위는 W7 `IC-19`다.
- 엄격한 잔여 IC: 14개. `IC-04`·`IC-20` required-check 외부 증거가 확보되면 12개다.

## W5 완료 계약

1. CLI, 관리자 API, `/health/detailed`는 같은 순수 `inventory-integrity/v1` engine의 check ID·severity·count·samples·blocking verdict를 소비한다.
2. 종료 코드는 `0=pass 또는 warning-only`, `1=blocking data violation`, `2=사용/config 오류`, `3=DB/schema/tool 오류`다.
3. 총량·음수, location pending, StockRequest 상태·예약, ShippingAllocation 상태·위치 초과, box/활성 zone/unplaced 합계·중복·고아를 blocking으로 검사한다.
4. contract v2 effect 누락·손상·owner·중복·semantic 위반은 blocking이다. contract v1 missing effect는 cutover 이전에만 warning이며 cutoff 이후 기록을 v1로 낮춰 우회할 수 없다.
5. 누락 SQLite 경로는 파일을 생성하지 않고 config/DB 오류로 실패한다.
6. 관리자 화면은 새 시각 체계를 만들지 않고 기존 섹션 안에서 v1 check ID·severity·count를 표시한다.

## W5 검증 증거

- SQLite contract 37/37.
- W5 전용 실제 PostgreSQL 16 matrix 22/22.
- 관련 backend 회귀 204/204.
- 관리자 UI 3/3, frontend typecheck·ESLint 통과.
- Ruff와 변경 파일 대상 mypy 통과.
- 독립 명세 리뷰와 코드 품질 리뷰 최종 Critical/Important/Minor 0.
- staged smart gate는 infra 변경으로 full 영역에 승격됐다. Node 24·PostgreSQL 환경 누락은 mutation 전에 fail-closed했으며, ignored Node 20.20.2와 폐기 가능한 PostgreSQL 16.15를 준비한 뒤 PostgreSQL 필수 runner를 100%·skip 0으로 재실행했다. 같은 staged snapshot의 frontend lint·app/test/E2E type·전체 coverage·production build·bundle과 backend Ruff·대상 mypy가 통과했다.
- W5 full backend pytest와 OpenAPI exact check를 통과했고, 제품 commit 뒤 GitHub CI run `33606010198`의 6개 job이 모두 success다.
- 증거 경로: `_attic/runtime/code-quality-improvement/20260902-135134/cp5-w5-ic17/`
- 품질 `backend/mes.db` SHA-256은 `D0419DC051B881DA145B466AF99490570D18C47BCAAE990C57FFD4476FE28147`로 불변이다.
- 일회용 `test_cp5_w5_staged` DB 0, 55432·8021·3100·3300 listener 0, 격리 PostgreSQL cluster 정상 종료.
- 동결 UI 변경 0, `C:\ERP-dev` 접근 0, `C:\ERP` main 수정·stage·commit 0.

## [완료] W6 `IC-18`

별도 구현 작업 한 개가 다음 범위를 TDD로 완료했다.

1. 새 backup은 DB artifact와 `backup-manifest/v1` JSON을 한 쌍으로 만들고 manifest를 마지막에 원자 publish한다.
2. manifest에는 artifact SHA-256·size·engine·Alembic revision·schema fingerprint·data revision·snapshot hash·검증 결과를 기록한다.
3. retention·NAS·cleanup은 DB와 manifest를 분리하지 않고 한 쌍으로 처리한다.
4. manifest가 없는 기존 backup은 `LEGACY_UNVERIFIED`로만 읽고 새 PASS로 승격하지 않는다.
5. SQLite online backup은 WAL을 포함하며 source의 후속 WAL commit 뒤 이전 backup을 stale로 판정한다.
6. restore는 staged DB에서 Alembic head·schema·FK·W5 integrity를 모두 검증한 뒤에만 target 교체를 허용한다.
7. PostgreSQL dump는 폐기 가능한 임시 DB에 복구해 검증하며 검증 전에 target을 drop하지 않는다.
8. S0에서 추가된 Task Scheduler 등록 schema·owner·retry 상태를 restore 뒤 운영 복구 검증 범위에 포함한다.
9. 실제 직원 DB restore·cutover·배포는 실행하지 않는다.
10. W6 완료 전 W7 `IC-19`를 시작하지 않았다.

## W6 완료 증거 (2026-09-05)

- 정상 backup의 manifest와 artifact hash·size·schema·revision·snapshot exact 일치, WAL-only 후속 write의 SQLite stale 판정, 손상·누락·wrong-head·schema/FK/W5 integrity fail-closed를 검증했다.
- staged restore 실패 시 기존 target과 마지막 valid manifest를 보존하고, PostgreSQL dump는 폐기 가능한 임시 DB에서 복구·검증한 뒤에만 target 교체를 허용한다.
- retention·NAS·cleanup이 artifact/manifest pair를 분리하지 않음을 검증했다.
- SQLite manifest contract 146/146, retention 11/11, 실제 PostgreSQL 28/28, canonical PostgreSQL runner 129 scenarios 100%를 통과했다.
- W6 제품 독립 리뷰는 Critical/Important/Minor 0이다. 최종 CI test harness 보완 재리뷰는 Critical/Important 0, 비차단 Minor 2다.
- staged 검증과 전체 component gate를 통과했고 기존 품질 branch에만 commit/push했다. 최종 GitHub CI run `33923104275`는 6/6 success다.
- 증거 경로: `_attic/runtime/code-quality-improvement/20260904-082523/cp5-w6-ic18/`.
- 품질 `backend/mes.db` SHA-256은 `D0419DC051B881DA145B466AF99490570D18C47BCAAE990C57FFD4476FE28147`로 불변이다.
- 일회용 PostgreSQL DB 0, 8021·3100·3300·55432 listener 0, 동결 UI 변경 0, 개발·직원 서버 접근·영향 0이다.
- 감사 계획 12.24절과 다음 active handoff에 실제 commit·CI·증거를 일치시켰다.

## 금지·정지 경계

- 현재 상태는 **W6 완료·W7 시작 직전**이다. W6 제품·검증·리뷰·CI를 닫았고 W7 제품 변경은 아직 시작하지 않았다.
- 같은 worktree를 수정하는 구현 작업은 한 번에 하나만 실행한다.
- `C:\ERP-dev`는 읽기·검색·해시·DB·process·port까지 전면 금지다.
- `C:\ERP` main은 읽기 전용이며 main 동기화·수정·서버·DB 작업을 하지 않는다.
- 새 branch, branch 전환, force-push, PR, main push/merge, 실제 배포·cutover는 금지다.
- 주간보고, 모바일 하단 tab, desktop shipping step 5 카드 크기·grid·overflow를 수정하지 않는다.
- 다음 정본은 `2026-09-05-cp5-w6-complete-w7-ready-todo.md`다. CP5 완료 전 CP6를 시작하지 않는다.
