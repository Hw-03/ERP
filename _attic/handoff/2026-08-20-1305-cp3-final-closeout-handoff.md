# CP3 → CP4 최종 인계

## 결론

- DEXCOWIN MES 체크포인트 3의 유일한 카드 `IC-01`은 완료 상태다.
- 최종 독립 명세 리뷰와 코드 품질 리뷰 판정은 각각 **Critical 0 / Important 0 / Minor 0**이다.
- SQLite·backend·frontend·브라우저 정본 gate는 아래 기록대로 통과했다.
- PostgreSQL 실경합은 `TEST_POSTGRES_URL` 부재로 **`NOT_VERIFIED`**다. SKIP이나 PASS로 바꾸지 않는다.
- 동결 UI diff는 0이며 체크포인트 4 카드는 시작하지 않았다.
- 이 문서는 이미 확보한 최종 증거를 정리한 closeout이다. 제품 테스트와 제품 검증은 다시 실행하지 않았다.

## 작업 정체성 및 보호 경계

- 작업 경로: `C:\ERP\.worktrees\full-code-quality-checkpoint-2`
- 브랜치: `codex/full-code-quality-improvement`
- CP3 구현 기준 HEAD: `27da6e25718453378160fb9b930d8ed9cff8b622`
- CP3 closeout commit: 기존 6파일 정리 `e07bc0c1`, `IC-01` 구현 `88cdd25b`. 두 커밋은 원격 `codex/full-code-quality-improvement`에 push 완료했다.
- 최신 동기화 기준: `origin/main` `957ec65805c3efe820416e49ba6eb839d6364665`. 첫 검증 뒤 추가된 `bf8d5412` 품목 선택 전체 화면까지 포함한 merge commit을 같은 원격 품질 브랜치에만 push한다.
- `C:\ERP` 메인 워크트리는 사용자 작업 영역이므로 CP3 과정에서 읽기 확인 외 수정·복사·stash·reset·commit을 하지 않았다.
- `C:\ERP-dev`는 파일·해시·검색·DB·프로세스·포트를 포함해 접근하지 않았다.
- 회사 도메인, DNS, 홈페이지, HTTPS, 인증서, Caddy는 범위 밖으로 유지했다.
- CP3 구현·검증 중에는 branch 전환, 추가 main 병합, commit, push, PR을 수행하지 않았다. 이후 사용자 승인으로 기존 6파일·CP3 분리 commit과 품질 브랜치 push를 마쳤고, 메인 작업 종료 확인 뒤 최신 `origin/main`을 품질 브랜치 방향으로만 병합했다. `main` push와 PR은 수행하지 않는다.

## CP3 구현 범위

### migration 및 PIN

- additive Alembic `20260819_0023`에서 `employees.pin_requires_change`, `operator_sessions`, bootstrap 감사 actor 및 출하 event actor 필드·인덱스를 추가했다.
- 정상 `0022 → 0023`, legacy null/default/custom PIN backfill, 부분 배포 재실행과 잘못된 partial schema의 fail-closed 검증을 구현했다.
- 직원 PIN은 PBKDF2-HMAC-SHA256 600,000회·무작위 salt의 버전형 문자열로 전환했다.
- legacy 비기본 SHA-256은 성공 로그인 transaction에서만 승격한다.
- 기본 PIN `0000` 또는 미설정 PIN은 10분 challenge만 발급하며, 새 PIN 설정과 재로그인 전 operator session 및 업무 mutation은 0이다.
- challenge opaque token은 동일 DB 행에서 원자 회전해 재발급하고 기존 이력은 삭제하지 않는다.
- malformed·과대 verifier는 KDF 전에 bounded validation으로 fail-closed 처리한다.

### DB-backed operator session

- CSPRNG opaque token은 브라우저 HttpOnly·SameSite=Lax cookie에만 두고 DB에는 SHA-256 digest만 저장한다.
- 절대 만료 12시간, sliding 연장 0, process `boot_id` 일치 계약을 적용했다.
- logout, 일반 PIN 변경, 관리자 PIN 초기화, 직원 비활성화·삭제, `boot_id` 변경에서 해당 capability를 폐기한다.
- Employee → session의 고정 잠금 순서와 재검증으로 mutation/revoke 및 lifecycle 경합을 직렬화했다.
- 로그인 KDF는 검증된 client IP별 60회/5분, 신규 세션 발급은 직원+IP별 10회/5분이며 성공에도 resource 예산을 reset하지 않는다.
- 같은 유효 cookie는 기존 행을 재사용하고 직원별 현재 boot의 active operator session은 32행으로 제한한다.
- canonical Next custom server가 실제 socket peer에서 client IP assertion을 만들고 HMAC으로 서명하며, backend는 유효한 assertion만 rate-limit 정본으로 사용한다.

### VerifiedActor 및 업무 actor 전환

- `VerifiedActorRouter`가 등록된 모든 mutating HTTP route를 기본 보호한다.
- 실제 등록 route는 `VERIFIED_ACTOR`, `AUTH_BOOTSTRAP`, `SYSTEM_EXCEPTION` 중 정확히 하나로 양방향 분류하며 예외 이유도 exact manifest로 고정했다.
- Employee actor를 소비하는 service public mutation surface도 독립 discovery와 선언 manifest의 양방향 차집합 0으로 고정했다.
- IO, StockRequest, 불량, 생산, 출하, 부서조정, 거래 정정·취소, 인수인계, 창고지도, 설정·관리자 복구를 서버가 검증한 동일 `Employee` actor로 전환했다.
- body/header employee claim은 권한 source가 아니며 session actor와 다르면 mutation 전에 403으로 거부한다.
- 서비스 직접 호출은 required `Employee` actor가 없으면 DB mutation 전에 fail-closed한다. 저수준 mutation primitive는 private surface로 분류했다.
- 감사 계층은 request state의 검증 actor를 사용하며 token·PIN·SQL parameter는 로그에 남기지 않는다.

### frontend 및 운영 계약

- canonical 로그인, 최초 PIN 변경, `GET /api/operator-session` 새로고침 복원, logout, 401/403 auth boundary를 구현했다.
- 명시 logout 실패 pending marker, 재시도 대상 actor 결속, cross-tab cookie/challenge 경합, 지연 401, QueryClient epoch, 관리자 PIN/cache 격리를 처리했다.
- 실제 직원별 HttpOnly session을 E2E global setup에서 한 번씩 발급하고 새 context에서 cookie 복제 후 서버 actor를 재검증하도록 바꿨다.
- OpenAPI baseline, 운영 문서, 승인 설계 및 감사 계획의 CP3 증거를 갱신했다.
- HTTP LAN에서 `Secure` cookie를 강제하지 못하는 전송 위험과 single-worker `boot_id`/in-memory limiter 운영 제약은 문서화했고 HTTPS는 후속 범위로 남겼다.

## 최종 검증 증거

아래 수치는 CP3 종료 시 이미 확보한 최종 증거다. closeout 과정에서는 재실행하지 않았다.

| 영역 | 최종 증거 |
| --- | --- |
| backend 전체 | 1,898 collected = **1,882 PASS / 16 SKIP / 0 FAIL** |
| backend 정적 | Ruff 전체 통과, blocking mypy는 `Success: no issues found in 2 source files` |
| OpenAPI | 현재 `app.openapi()`와 `_dev/baselines/openapi.json` 구조 exact 일치 |
| frontend runtime | Node **20.20.2** |
| frontend 정적 | strict lint, app/test/E2E type 통과 |
| frontend 계약 | verification contract **16/16**, test manifest **254**, 기존 진단 baseline **386** 대비 신규 종류·증가 0 |
| frontend unit | Vitest **250파일 / 2,075테스트 PASS** |
| coverage | statements **93.65%**, branches **88.22%**, functions **90%** |
| build | Next production build PASS |
| bundle | **2,431,128 bytes / 2,432,696.32 bytes 한도**, CP3 인증 변경 전 2,435,384 bytes 대비 4,256 bytes 감소 |
| browser E2E | Playwright **16/16 PASS**, 1 worker, 약 1.4분 |
| 실제 DB 보호 | `backend/mes.db` 전후 SHA-256 `F427E7E53BFABEA900D6D6A6A18385BE09734966DC89F182FFA33C2DC53061B5` 동일 |
| 문서·diff | maintained Markdown link checker와 `git diff --check` 통과; line-ending 경고만 있고 오류 0 |
| 명세 리뷰 | **Critical 0 / Important 0 / Minor 0** |
| 코드 품질 리뷰 | **Critical 0 / Important 0 / Minor 0** |
| PostgreSQL | `TEST_POSTGRES_URL` 미설정으로 **NOT_VERIFIED**; 실제 두 연결 경합을 PASS로 계산하지 않음 |

PostgreSQL runner와 필수 양방향 잠금 시나리오는 코드·runner 계약에 연결돼 있다. 환경 부재는 새 blocker가 아니지만 실증 완료나 PASS로 표현해서도 안 된다.

## E2E 종료 상태

- E01, E22, E04의 실제 HttpOnly operator session을 global setup에서 각각 1회 발급했다.
- 테스트별 새 browser context는 해당 actor cookie만 복제한 뒤 `GET /api/operator-session`으로 actor를 재검증했다.
- teardown 증거에서 8021·3100 listener는 0이었다.
- `.e2e-*`, `mes_e2e.db*`, seed 파일, `test-results`, `playwright-report` 잔존은 0이었다.
- 실제 `backend/mes.db`는 위 SHA-256처럼 불변이었다.
- closeout에서는 기존 종료 증거를 사용했으며 listener, DB, seed, E2E를 다시 실행하거나 조사하지 않았다.

## 동결 UI 및 CP4 경계

다음 동결 영역의 diff는 0이다.

- `frontend/app/mes/_components/_weekly_sections/`
- `frontend/app/mes/_components/DesktopWeeklyReportView.tsx`
- `backend/app/routers/inventory/weekly_report.py`
- `frontend/app/mes/_components/mobile/MobileShell.tsx`의 하단 탭 bar 디자인
- `frontend/app/globals.css`의 `button.no-btn-inset`
- `frontend/app/mes/_components/DesktopShippingView.tsx`의 출하 5단계 최종 카드 크기·grid·overflow

CP4 카드와 CP4 제품 구현은 **미착수**다. 이 closeout에서도 제품 코드를 더 수정하지 않았다.

## 감사 계획 정합성

- 정본: `_attic/docs/research/2026-08-13-full-code-quality-audit-and-improvement-plan.md`
- `IC-01`의 체크포인트 상태는 `완료`이며 PostgreSQL을 `NOT_VERIFIED`로 분리한다.
- `12.13 체크포인트 3 IC-01 검증된 작업자 세션 결과`에는 이 문서와 같은 branch/HEAD, migration·PIN·session·manifest 범위, backend/frontend/Playwright 수치, DB hash, residue 0, frozen diff 0, 리뷰 0/0/0이 기록돼 있다.
- closeout read-only 대조에서 불일치를 찾지 못했으므로 감사 계획은 추가 수정하지 않았다.

## 역사적 CP3 commit 직전 working-tree inventory

이 절은 `e07bc0c1`·`88cdd25b` 작성 전 provenance snapshot이다. 현재 working tree 상태나 최신 `main` 동기화 diff로 해석하지 않는다.

### closeout 문서 작성 시점 전체 상태

새 최종 handoff 자체를 포함한 `git status --porcelain=v1 -uall` 기준이다.

- 총 **263**개 경로
- tracked modified **223**개
- untracked **40**개
- staged·삭제·rename·충돌 **0**개

| 최상위 경로 | modified | untracked | 설명 |
| --- | ---: | ---: | --- |
| `README.md` | 1 | 0 | CP3 운영/실행 계약 |
| `_attic/` | 6 | 2 | CP3 운영·감사 문서 + 시작 전 handoff 1개 + 이 최종 handoff 1개 |
| `_dev/` | 1 | 0 | OpenAPI baseline |
| `backend/` | 147 | 25 | CP3 backend 구현·migration·tests |
| `docker/` | 2 | 0 | single-worker·proxy secret 경계 |
| `docs/` | 1 | 0 | 승인 설계 |
| `frontend/` | 59 | 13 | 이 중 modified 6개는 시작 전 변경, 나머지는 CP3 구현·tests |
| `scripts/` | 6 | 0 | canonical runtime·seed·verification caller 정합 |

### CP3 시작 전부터 있던 변경 — CP3로 오인하거나 되돌리지 말 것

다음 tracked modified **6개**는 CP3 시작 전부터 존재한 병합 호환·bundle budget 변경이다.

1. `frontend/app/mes/_components/__tests__/CapacityDetailModal.test.tsx`
2. `frontend/app/mes/_components/__tests__/DesktopHistoryView.state.test.tsx`
3. `frontend/app/mes/_components/_hooks/__tests__/useHistoryData.test.tsx`
4. `frontend/app/mes/_components/mobile/screens/__tests__/MobileHistoryScreen.history-data.test.tsx`
5. `frontend/scripts/check-bundle-size.mjs`
6. `frontend/scripts/check-bundle-size.test.mjs`

다음 untracked 문서 **1개**도 CP3 구현 전에 존재한 시작 handoff다.

- `_attic/handoff/2026-08-19-1423-cp3-verified-operator-session-handoff.md`

이 기존 handoff는 “CP3 제품 구현은 아직 시작하지 않았다”는 시작 시점 snapshot이다. 현재 완료 상태의 정본으로 사용하지 말고, 시작 전 변경의 provenance 확인용으로만 보존한다.

### CP3 working diff와 closeout 문서의 구분

- CP3 tracked modified: **217개** = 전체 modified 223개 − 시작 전 6개
- CP3 신규 untracked 구현·테스트 파일: **38개** = backend 25개 + frontend 13개
- closeout 신규 untracked: 이 문서 **1개**
- 시작 전 untracked: 기존 handoff **1개**

CP3 신규 untracked 구현·테스트 파일은 다음과 같다.

#### backend 25개

- `backend/alembic/versions/20260819_0023_add_operator_sessions.py`
- `backend/app/dependencies/verified_actor.py`
- `backend/app/models/operator_session.py`
- `backend/app/routers/operator_sessions.py`
- `backend/app/runtime_identity.py`
- `backend/app/schemas/operator_session.py`
- `backend/app/security/__init__.py`
- `backend/app/security/mutation_manifest.py`
- `backend/app/services/operator_session.py`
- `backend/tests/concurrency/test_operator_session_concurrent.py`
- `backend/tests/concurrency/test_operator_session_postgres.py`
- `backend/tests/migrations/test_operator_sessions.py`
- `backend/tests/ops/test_operator_session_runtime_contract.py`
- `backend/tests/routers/test_employee_pin_input_contract.py`
- `backend/tests/routers/test_handover_verified_actor.py`
- `backend/tests/routers/test_io_verified_actor.py`
- `backend/tests/routers/test_operator_session.py`
- `backend/tests/routers/test_stock_request_verified_actor.py`
- `backend/tests/security/test_domain_actor_ops.py`
- `backend/tests/security/test_employee_session_lifecycle.py`
- `backend/tests/security/test_mutation_manifest.py`
- `backend/tests/security/test_shipping_verified_actor.py`
- `backend/tests/security/test_verified_actor.py`
- `backend/tests/services/test_operator_session.py`
- `backend/tests/services/test_pin_auth_pbkdf2.py`

#### frontend 13개

- `frontend/app/__tests__/proxy-forwarding.test.ts`
- `frontend/app/mes/_components/__tests__/useAppearancePreferences.test.tsx`
- `frontend/app/mes/_components/login/MesLoginGate.module.css`
- `frontend/app/mes/_components/login/OperatorLoginCard.module.css`
- `frontend/app/mes/_components/login/__tests__/EmployeeCombobox.test.tsx`
- `frontend/lib/__tests__/api-operator-session.test.ts`
- `frontend/lib/api/operator-session.ts`
- `frontend/lib/api/types/operator-session.ts`
- `frontend/lib/queries/client.test.tsx`
- `frontend/middleware.ts`
- `frontend/scripts/next-server.integration.test.mjs`
- `frontend/scripts/next-server.js`
- `frontend/tests/e2e/operator-session-ui.spec.ts`

tracked modified 217개와 시작 전 6파일 분리는 CP3 commit 직전 snapshot이다. 현재 파일 상태의 정본은 최신 품질 브랜치의 `git status --short`이며, 이 과거 목록을 CP4 변경으로 재분류하지 않는다.

## 최신 `main` 동기화 closeout

- `c01034a3..957ec658`의 20개 커밋(비병합 19개)·127개 경로를 전수 delta 감사한 뒤 품질 브랜치에만 병합했다.
- 작업자 세션 `20260819_0023`과 최신 `main`의 AS·연구 BOM migration을 `20260820_0024`로 직렬화했고 Alembic head는 하나다.
- CP3 `VerifiedActor`·세션 계약과 최신 `main`의 차감 부서·BOM 모드·고정 자식수량을 함께 유지했다.
- 마지막 `bf8d5412`의 데스크톱 입출고 품목 선택 전체 화면 9개 경로는 충돌 없이 반영했고 관련 43개 테스트·lint·app typecheck를 통과했다. 재고 API·DB mutation·동결 UI 변화는 없다.
- backend migration·actor·IO focused gate와 전체 **1,922개 중 1,906 PASS·환경 전용 16 SKIP**, frontend Node 20 app/unit/E2E type·2,142 unit tests·coverage·build·bundle, OpenAPI exact, docs, schema read-only, inventory integrity, Playwright 16/16을 검증했다.
- `TEST_POSTGRES_URL` 부재로 CP3 PostgreSQL 실경합은 계속 `NOT_VERIFIED`다. 새 blocker나 PASS로 바꾸지 않는다.
- Playwright teardown 뒤 8021·3100 listener, `mes_e2e.db`, seed·결과물은 0이고 실제 `backend/mes.db` SHA-256은 전후 `598BD3606C91543C19B05CD17B2CB6F49609F45297A4764C7332C17EC990D448`로 같다.
- 품질 동기화 과정에서 동결 UI를 추가 수정하지 않았고 CP4 제품 코드는 시작하지 않았다.

## CP4 담당 작업의 첫 행동

CP4는 이 작업에서 시작하지 않는다. 별도 CP4 작업이 사용자에게 배정된 뒤에만 다음 순서를 따른다.

1. `C:\ERP\AGENTS.md`와 이 최종 handoff를 읽는다.
2. 작업 위치가 `C:\ERP\.worktrees\full-code-quality-checkpoint-2`, branch가 `codex/full-code-quality-improvement`인지 확인하고, `git log`에서 `e07bc0c1`·`88cdd25b`와 최신 `main` `957ec658` 동기화 merge commit이 품질 원격 브랜치와 일치하는지 확인한다. `27da6e25718453378160fb9b930d8ed9cff8b622`는 역사적 CP3 구현 기준 HEAD다.
3. 위 inventory는 역사적 CP3 provenance snapshot으로만 사용하고, CP4 시작 시 working tree가 clean인지 확인한다.
4. PostgreSQL을 `NOT_VERIFIED`로 유지하고 사용자 승인 없이 추가 branch·commit·push·PR을 하지 않는다.
5. CP4의 승인 범위만 별도 계획·TDD로 시작한다. CP3 closeout을 다시 구현하거나 제품 검증을 반복하지 않는다.
