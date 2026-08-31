# DEXCOWIN MES CP5 S0 main 동기화 검토 인계

- 작성일: 2026-08-31 KST
- 품질 worktree: `C:\ERP\.worktrees\full-code-quality-checkpoint-2`
- 품질 branch: `codex/full-code-quality-improvement`
- 시작 HEAD/upstream: `e64a9a12da16f8502ab1a1e82dbed2b1d2648a01`
- 고정 main: `78e8023f41ef59528d9d8c07498e7653f9bee247`
- merge-base: `759067e031aaf8245347952be3e86474981cab29`
- 판정: **S0 GREEN — 품질 브랜치 commit·push·CI 대기, CP5 제품 구현 미착수**

## 1. S0 범위와 Git 상태

- 고정 main은 `git merge --no-ff --no-commit`으로 품질 worktree 방향에만 통합했다.
- main 전용 15개 commit·175경로, 양쪽 교집합 24경로, 충돌 11경로를 재감사했다.
- conflict marker와 unmerged entry는 0이다.
- merge는 아직 commit하지 않았고 push·branch 변경·PR도 수행하지 않았다.
- `C:\ERP` main worktree는 시작 경계의 SHA·clean 상태만 읽기 전용으로 확인했다.
- `C:\ERP-dev`는 파일·검색·해시·DB·process·port를 포함해 접근하지 않았다.

## 2. 보존한 통합 계약

1. StockRequest draft 복귀
   - CP4 `VerifiedActor`를 유지한다.
   - main의 연결 request 전체 잠금·취소·rollback·draft 복원을 함께 유지한다.
2. IO draft submit
   - main의 `draft→submitted` 조건부 UPDATE를 유지한다.
   - batch-first 잠금 순서 뒤 active item lock·BOM 정규화·실행·fingerprint 저장을 같은 transaction에 유지한다.
   - actor+route+batch ID+저장 내용이 같은 재시도만 결과를 재생하고, 다른 actor·바뀐 내용/route·legacy null은 실패 폐쇄한다.
   - exact replay의 재고·로그·operation·StockRequest·domain event·ActivityAudit 중복은 0이다.
3. frontend 결과 불명·중복 클릭
   - 동기 in-flight guard와 pending command의 동일 key/snapshot 보존을 함께 유지한다.
   - 기존 draft 제출도 원래 batch ID를 session storage에 보존하고 성공 또는 확정 4xx에서만 제거한다.
4. 작업자 로그인
   - 서버 operator session·최초 PIN challenge가 정본이다.
   - 일반 로그인 실패 시 PIN focus를 복구한다.
5. runtime owner
   - main의 triggerless Windows Task Scheduler supervisor를 유지한다.
   - backend child는 `--workers 1 --no-proxy-headers`로 고정한다.
   - backend·frontend readiness는 공통 helper에서 내부 90회, 외부 120회로 외부 창을 더 길게 유지한다.

## 3. 생성물·동결·schema

- OpenAPI baseline SHA-256: `0B1B0A027169625DA05203BBD8720D7CC5F3BB625576A9D4A6507070A32A70D4`
- 독립 두 번째 OpenAPI 생성과 byte exact 일치
- Alembic: `20260828_0031 (head)` 단일 head
- Node 20.20.2 production build: PASS
- bundle: 2,508,001 bytes / 2.392MB 한도 2,508,193.792 bytes, gate 2/2 PASS
- 주간보고 8경로, 모바일 하단 tab, desktop shipping step 5를 포함한 동결 12 blob은 고정 main과 exact 일치
- `backend/mes.db` 현재 승인 기준선 SHA-256: `D0419DC051B881DA145B466AF99490570D18C47BCAAE990C57FFD4476FE28147` (2026-08-31 사용자 승인에 따라 품질 worktree 전용 DB만 fresh→`0031`로 재생성)

## 4. 현재 검증 증거

- backend 최종 집중 회귀: 177/177 PASS
- frontend 최종 집중 회귀: 11파일·374/374 PASS
- 기존 `DesktopShippingView` React `act(...)` 경고는 있으나 실패 0이며 동결 step 5 test가 PASS했다.
- 폐기 가능한 PostgreSQL 16 fresh→0031 bootstrap: PASS
- 기존 final full 당시 실제 PostgreSQL 공통 concurrency runner: 30/30 PASS, skip 0. 기존 IO draft의 two-connection race·응답 유실 exact replay가 새 필수 행으로 포함됐다.
- 최초 정본 전체 gate: `verify_local.ps1 -Mode full -DbReadOnlyCheck -IncludeE2E`, 963.047초, exit 1
  - PASS: backend Ruff·mypy·PostgreSQL 29/29, frontend lint·app type
  - FAIL: backend full pytest의 보안 manifest 2건·중복 raw PIN surface 1건, frontend unit-test type의 신규 진단 4건
  - 조기 중단으로 후속 OpenAPI·coverage·build·bundle·docs·DB read-only·E2E gate는 미실행
- 최초 실패 당시에는 full gate를 반복하지 않았다. 최소 보완 뒤 실패 직접 회귀는 backend 63/63 PASS, frontend known 진단 423개·신규 0, 관련 Vitest 16/16 PASS다.
- `revert_to_draft`는 중복 raw PIN 검사만 제거했고 기존 rate-limited cancel PIN 검증을 유지한다. 잘못된 PIN의 request·batch·pending mutation 0 회귀를 추가했다.
- supervisor 보완 뒤 첫 final rerun은 922.216초, exit 1이다. 새 순수 helper `fingerprint_io_draft_submit`의 exact read-only 보안 분류 누락 1건이 두 manifest test에서 검출됐고, 기존 fingerprint helper와 같은 분류 한 줄을 추가한 뒤 보안 manifest 28/28이 PASS했다.
- 재검토 전 staged rerun: Node 20.20.2·폐기 가능한 PostgreSQL 16, 974.851초, exit 0, 18/18 PASS
  - backend: Ruff·mypy·PostgreSQL 30/30(skip 0)·full pytest·OpenAPI PASS
  - frontend: lint·app/test/E2E type·coverage(라인 94.22%)·production build·bundle PASS
  - docs whitespace/link, DB read-only, Playwright 전용 `mes_e2e.db` 17/17 PASS
  - 실제 `mes.db` SHA-256 전후 불변, OpenAPI SHA-256 유지, 동결 12 blob 고정 main과 exact 일치
- 종료 자원: PostgreSQL test DB remaining 0, 중지한 cluster는 휴지통으로 이동해 원래 경로에서 제거, E2E 임시 DB 0, 8021·3100·3300·55432 listener 0
- 초기 독립 리뷰: Critical 0. 당시 frontend 외부 30회/내부 90회 Important를 외부 90회로 보완했고 31번째 시도 회귀가 PASS했다.
- 후속 supervisor 지적: Windows CI 임의 checkout의 test-only profile 해석, 기존 draft 응답 유실 semantic replay, backend/frontend 외부 readiness 창을 추가 보완했다. 관련 SQLite/API/PowerShell/frontend focused 회귀와 실제 PostgreSQL 16의 새 two-connection draft 경합·응답 유실 테스트는 PASS했다.
- 재검토 Important — runtime root: 실제 task 등록 흐름이 test-only `-TestRepoRoot`를 사용해 임의 root도 development task identity로 해석하던 RED를 확인했다. CI 계약은 `resolve-server-profile.ps1 -TestRepoRoot`로 test profile을 만든 뒤 순수 `New-RuntimeTaskSpecification` builder에 주입하고, 실제 등록·start/status consumer는 strict `Get-RuntimeTaskSpecification` wrapper만 사용한다. production allowlist 밖 `-RuntimeRepoRoot`는 task action 전에 실패 폐쇄하며 production script에는 `TestRepoRoot`가 도달하지 않는다. runtime path·task 집중 회귀는 40/40 PASS다.
- 재검토 Important — IO lock order: 기존 draft 저장은 item-first, 제출은 batch-first여서 두 connection의 save→submit·submit→save 양방향 모두 실제 PostgreSQL `DeadlockDetected` RED가 재현됐다. 저장도 기존 batch row를 먼저 `FOR UPDATE`한 뒤 item lock을 잡도록 통일했고, 두 방향 barrier 회귀와 기존 응답 유실 회귀를 포함한 필수 PostgreSQL runner는 32/32 PASS, skip 0, exit 0이다. SQLite/API 직접 영향 회귀도 31/31 PASS다.
- 재검토 Important — bundle 증거: 최종 full log의 실제 산출물은 2,508,001 bytes이며, 문서의 2,507,703 bytes 오기를 이 값으로 교정했다. 2.392MB(2,508,193.792 bytes) 한도와 gate PASS 기록은 그대로다.
- 재검토 보완 후 최종 staged rerun: Node 20.20.2·폐기 가능한 PostgreSQL 16.15, 898.108초, exit 0, 18/18 PASS
  - backend: Ruff·mypy·PostgreSQL 32/32(skip 0)·full pytest·OpenAPI PASS
  - frontend: lint·app/test/E2E type·coverage(라인 94.22%)·production build·bundle 2/2 PASS
  - docs 3/3, DB read-only, Playwright 전용 `mes_e2e.db` 17/17 PASS
  - `mes.db` SHA-256 전후 불변, OpenAPI SHA-256 유지, 동결 12/12 blob 고정 main과 exact 일치
- 이번 재검토 종료 자원: PostgreSQL test DB remaining 0, 정상 종료한 cluster는 휴지통으로 이동해 원래 경로에서 제거, E2E 임시 DB 0, 8021·3100·3300·55432 listener 0
- 현재 코드(runtime builder) 반영 후 최종 full gate: Node 20.20.2·폐기 가능한 PostgreSQL 16.15, `42-final-full-gate-supervisor-r3.log`, 904.466초, exit 0, 18/18 PASS
  - backend: Ruff·mypy·PostgreSQL 32/32(skip 0)·full pytest·OpenAPI PASS
  - frontend: lint·app/test/E2E type·coverage(라인 94.22%)·production build·bundle PASS, docs 3/3, DB read-only, Playwright 전용 `mes_e2e.db` 17/17 PASS
  - 이번 실행 중 `backend/mes.db`는 `0FC2AE454B6724413C9E27AFB2CB156C8B35D3817DB0BA4DB17313EC39E2BAA6`(1,347,584 bytes)로 전후 불변이었다. 이는 당시 파일의 불변 증거이며, 아래 사용자 승인 재생성 뒤 현재 기준선은 `D0419D...`다.
- **DB baseline 차단 해소:** 잘못된 경로로 실행된 bootstrap 명령이 품질 worktree 전용 `backend/mes.db`를 `90FA...`에서 `0FC2...`로 바꿨고, 정확한 옛 바이트는 로컬 backup·snapshot·임시·휴지통에서 찾지 못했다. 사용자는 2026-08-31에 개발 환경 `C:\ERP`와 직원 환경 `C:\ERP-dev`에 영향이 없다는 조건으로 격리된 품질 worktree 내부의 DB 재생성을 승인했다. `0FC2...` 사고 파일은 `_attic/runtime/code-quality-improvement/20260831-120815/s0-main-sync/mes-db-after-accidental-bootstrap.db`와 `mes-db-before-user-approved-reset-20260831-162216.db`에 보존하고, 명시적 품질 DB URL로 fresh→`20260828_0031` 부트스트랩을 실행했다. 새 기준선은 `D0419DC051B881DA145B466AF99490570D18C47BCAAE990C57FFD4476FE28147`이며 read-only check 전후 동일하다. `items=0`, `inventory_operations=0`, `transaction_logs=0`, `stock_requests=0`, `shipping_requests=0`인 격리 기준선이고, `C:\ERP\backend\mes.db`는 전후 `E468424B11DCCCF26B14C1850AB498072FEB94E1D9CFE71A9F0A5BD8442AFC23`으로 불변이다. `C:\ERP-dev`는 접근하지 않았다.
- 독립 리뷰 Minor 1건은 잔여 위험으로 남긴다. `MesLoginGate`가 주 시작일을 브라우저 local timezone에서 계산한 뒤 KST 문자열로 바꾸므로 비-KST 브라우저의 일요일 15:00Z 이후에는 이전 주를 prefetch할 수 있다. 제품 화면의 현재 주 표시와 동결 주간보고 경로를 함께 통일하려면 별도 승인 범위에서 처리한다.
- 전체 gate는 GREEN이지만 independent rereview와 완료 판정은 supervisor 몫이므로 내부 승인으로 간주하지 않는다.
- ignored 증거 root: `_attic/runtime/code-quality-improvement/20260831-120815/s0-main-sync/`

## 5. CP5 재판정

- `IC-06`: `OPEN`; read-only preflight·snapshot/report hash·mutation 0 증거 미착수
- `IC-07`: `OPEN`; BOM tree 추가 생산 가능 수량이 production capacity 소비자를 추가해 공통 availability 검증 표면 확대
- `IC-08`: `OPEN`; shipping lock·expected state·command receipt 미구현
- `IC-03-B`: `PARTIAL`; CP4 correction 안전막은 유지되지만 5개 전용 workflow cancel 미구현
- `IC-17`: `OPEN` 확대; Task Scheduler owner/status/retry를 integrity propagation matrix에 포함 필요
- `IC-18`: `OPEN` 확대; DB restore 뒤 scheduler 등록 schema·owner·recovery 검증 필요
- `IC-19`: `OPEN` 확대; start/status/supervisor의 `/health/live` 소비를 새 ready 계약으로 전환 필요

다음 제품 작업은 여전히 `IC-06 read-only preflight`다. 그 mutation 0·snapshot/report hash 증거 뒤에도 사용자 승인 전에는 runtime·schema·재고 mutation을 시작하지 않는다.

## 6. Supervisor 검토 항목

- [ ] staged merge diff가 고정 main 기능과 CP4 보안·멱등성·삭제 보호를 모두 유지하는지 확인
- [ ] StockRequest/IO의 lock order·conditional transition·actor 계약 확인
- [ ] bundle 한도 0.001MB 증액이 실제 통합 산출물만 수용하는 최소 변경인지 확인
- [ ] OpenAPI·Alembic·동결 blob exact 증거 확인
- [ ] 최종 full gate와 E2E·PostgreSQL skip 0·종료 자원 확인
- [x] DB baseline hard blocker 해소: 사용자 승인에 따라 사고 DB를 보존하고 품질 worktree DB만 fresh→`0031`로 재생성, 새 기준선 `D0419D...`와 read-only 불변 확인
- [ ] independent review의 Critical 0, Important 보완 완료, KST 주 경계 Minor 잔여 위험 확인
- [ ] 승인 전 commit·push하지 않음

이 문서는 역사 기준 `_attic/handoff/2026-08-28-cp4-complete-cp5-handoff.md`를 참조하며, 해당 CP4 완료 기록을 수정하거나 대체하지 않는다.
