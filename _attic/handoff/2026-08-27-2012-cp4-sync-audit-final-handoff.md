# CP4 실행 전 고정 main 동기화·재감사 최종 handoff

- 작성 시각: 2026-08-27 20:12 KST
- 작업 위치: `C:\ERP\.worktrees\full-code-quality-checkpoint-2`
- 공식 시스템명: DEXCOWIN MES
- 최종 판정: **BLOCKED — CP4 제품 구현 시작 금지**

## 1. 결론과 단일 다음 행동

고정 `main` SHA `38551726bba7d8253ad19fb39b146e7c60c2bc2d`의 통합과 74개 commit 전수 재감사는 끝났다. 그러나 고정 `main`이 공개한 `20260821_0024_remove_shipping_requested_status.py`가 빈 PostgreSQL 16의 base→head에서 index relation을 enum column으로 오인해 실패한다. 이 migration은 불변 보존 대상이고 품질 전용 `0030`보다 먼저 실행되므로 현재 권한 안에서 합법적으로 고칠 수 없다.

**단일 다음 행동:** `main`에서 `0024`의 PostgreSQL relation 판별을 교정한 새 commit을 만든 뒤, 사용자가 그 commit을 새 고정 `main` SHA로 명시한다. 그 전에는 이 품질 브랜치를 commit/push하지 않고 CP4 제품 구현도 시작하지 않는다. 새 SHA를 고정받은 뒤 빈 PostgreSQL→head와 `verify_local.ps1 -Mode full -DbReadOnlyCheck -IncludeE2E`를 다시 통과시킨 다음에만 현재 통합 변경을 구간별 commit하고 기존 `codex/full-code-quality-improvement` 브랜치에 push한다.

## 2. Git·워크트리 상태

| 항목 | 현재 값 |
|---|---|
| worktree | `C:\ERP\.worktrees\full-code-quality-checkpoint-2` |
| branch | `codex/full-code-quality-improvement` |
| local HEAD | `a7bae88f804fd865eeaafd47dcb30dd558857717` |
| HEAD parents | `e0706c6de792fdc3c74dbeb824cfdbc055655bdf`, `38551726bba7d8253ad19fb39b146e7c60c2bc2d` |
| merge 방식 | 고정 SHA만 `--no-ff` |
| upstream | `origin/codex/full-code-quality-improvement` = `e0706c6de792fdc3c74dbeb824cfdbc055655bdf` |
| upstream 대비 | remote-only 0, local-only 75 |
| remote | `https://github.com/Hw-03/ERP.git` |
| staged | 0 |
| push | 수행하지 않음 |

`a7bae88f`는 유일한 새 local merge commit이다. 그 뒤의 통합 보정은 required full gate가 red인 상태에서 commit하지 않았다. 현재 tracked 수정은 계획 문서, actor 경계, merge 적응 테스트·history showcase, E2E runtime/스펙, frontend type/bundle 기준선 등 20개 파일이다. 입력 handoff 2개와 이 최종 handoff는 untracked다. force-push, 새 branch, PR, `main` push/merge, required-check 설정 변경은 모두 0이다.

`C:\ERP` 메인 워크트리는 시작 시 read-only Git 상태만 확인했다. 사용자의 미커밋 변경을 stage·commit·stash·수정하지 않았다. `C:\ERP-dev`에는 파일·해시·검색·DB·process·port를 포함해 접근하지 않았다.

## 3. 74-commit 기준선 재감사

- 감사 구간: `957ec65805c3efe820416e49ba6eb839d6364665..38551726bba7d8253ad19fb39b146e7c60c2bc2d`
- commit manifest: 74/74
- 전체 changed path: 300
- CP4 관련 delta path: 113
- 제품 CP4 구현 변경: 0
- frozen weekly report, mobile bottom tab visual, desktop shipping step 5 size 계약의 동기화 과정 추가 변경: 0
- 원본 manifest, path 목록, diff, 교집합, migration blob 목록, 정적 감사: `_attic/runtime/code-quality-improvement/20260827-170256-cp4-sync-audit/`

고정 `main`의 inventory-operation identity, effect 원장, 원자 취소, legacy adoption을 현행 정본으로 채택했다. 별도 `operation_batch_id`나 linked cancel 409 classifier를 다시 만들지 않는다.

## 4. migration 결과

### 4.1 보존·직렬화

- 고정 `main` 공개 `0023`~`0029`: 모든 blob을 수정 없이 보존했다.
- `0024` fixed-main blob과 worktree blob: 둘 다 `083508a770a13af94190655ccfa8af555dbd0b30`.
- 품질 operator-session migration: `backend/alembic/versions/20260827_0030_add_operator_sessions.py`.
- chain: main `20260826_0029` → quality `20260827_0030`.
- Alembic head: `20260827_0030` 단일 head.
- SQLite: fresh→0030, 0029→0030, failure rollback 경로 PASS.
- 품질 worktree `backend/mes.db`: `state=versioned`, revision `20260827_0030`, profile `canonical`.
- `bootstrap_db.py --check` 전후 SHA-256: `90FA7ABE83D2A8BF545531C15CDB75FDA2A3B9F519AA86F6EC396B8DE616C71E`로 동일.

### 4.2 PostgreSQL blocker

폐기 가능한 `test_dexcowin_ci`를 빈 DB로 재생성한 뒤 `python bootstrap_db.py --all`을 실행하면 `20260820_0023 -> 20260821_0024`에서 다음 오류로 중단된다.

```text
shipping_request_status_enum is used by unexpected columns:
public.ix_shipping_requests_status.status
```

`0024`의 enum 사용처 query가 `pg_class.relkind`를 table/partitioned table로 제한하지 않아 index의 `status` attribute까지 수집하는 것이 원인이다. PostgreSQL transactional DDL 때문에 실패 후 DB는 `state=empty`로 남고, 공식 PostgreSQL concurrency gate가 이를 fail-closed로 거부한다. `0030`은 `0024` 뒤에 있으므로 사후 repair migration으로 해결할 수 없다. 공개 `0024` blob 불변 조건을 지키면서 이 문제를 고치는 저장소 변경은 없다.

## 5. CP4 카드 최종 범위

| 카드 | 최종 상태 | `RESOLVED_BY_MAIN` | `SUPERSEDED` | CP4에서 남은 `OPEN` |
|---|---|---|---|---|
| `IC-03-A` | `PARTIAL` | operation identity, effect 원장, 역전 operation, workflow effect 전체 취소, 증거 기반 legacy adoption | 별도 `operation_batch_id`, linked cancel 409 설계 | 원 거래당 correction 1회, owning log/operation lock 안 재계산, 단일 warehouse effect 증명, workflow·multi/non-warehouse 409, SHIP wrong-bucket 차단 |
| `IC-09` | `OPEN` | unique `client_request_id`와 같은 key의 기존 결과 반환 기반 | 없음 | `VerifiedActor.employee_id` + route/command + ordered payload fingerprint, same fingerprint replay, different/legacy-null 409, ResultUnknown key 보존 |
| `IC-10` | `PARTIAL` | cancel owning-operation lock, lock 안 plan 재검산, SQLite concurrent cancel 1 winner | 기존 cancel 재구현 | handover/correction owning-row lock, PostgreSQL handover×2·correction×2·cancel×2·correction-vs-cancel, rollback retry와 loser orphan 0 |
| `IC-11` | `PARTIAL` | soft-deleted item이 포함된 operation history/audit 조회 | 없음 | command/preview active-only lookup, open IO/StockRequest/Shipping/BOM reference delete 409, delete-vs-submit 경합 |
| baseline migration | `CONFLICT` | 해당 없음 | 해당 없음 | 고정 main `0024` PostgreSQL fresh-upgrade 교정이 CP4 진입 선행 조건 |

제품 카드끼리의 `CONFLICT`는 없다. 구현 순서는 baseline green 후 8.9.5의 세 구간으로 고정한다. 1번은 `IC-03-A` correction proof와 correction 쪽 `IC-10` owning-row lock, 2번은 `IC-09` fingerprint/replay와 handover/cancel 쪽 `IC-10` PostgreSQL 경합, 3번은 `IC-11` active reference 보호다. fingerprint는 object key와 의미상 unordered collection만 정규화하고 bundle/line 입력 순서는 보존한다. main의 operation schema·cancel service에는 변경 0이다.

## 6. 통합 과정에서 반영한 비-CP4 보정

- defect memo mutation을 `VerifiedActor` 정본과 body actor mismatch 403에 연결하고 공통 PIN rate limiter를 사용했다.
- inventory operation cancel도 공통 PIN rate limiter와 429 계약을 사용하도록 맞췄다.
- main 공개 service 이름과 CP3 private actor facade 사이의 merge 적응 테스트를 현행 계약에 맞췄다.
- history showcase가 main defect record와 CP3 actor facade, shipping action facade, 요청별 reservation cleanup을 함께 지키도록 통합했다.
- 제거된 shipping `REQUESTED`/send-to-prep 가정을 4상태×9 allocation=36행과 `PREPARING` list/detail E2E로 교체했다.
- E2E frontend 3100 점유 시 3300~3399 전용 fallback을 고르고 성공·실패 모두 환경을 복구하도록 했으며 Windows 계약 테스트를 추가했다.
- defect E2E가 현재 세션과 다른 body actor/구형 PIN을 쓰던 문제, 저장 PUT 완료 전 reload로 요청을 abort하던 문제, 실패 테스트 cleanup이 별도 unauthenticated request context를 쓰던 문제를 수정했다.
- fixed main의 2.381 MiB bundle 상한 실패를 실제 local 2,500,688 bytes와 GitHub Linux 2,499,672 bytes를 모두 수용하는 최소 2.385 MiB(2,500,853.76 bytes)로 조정했다.
- unit-test TypeScript 기준선은 현행 266파일·429진단으로 재생성했고 신규 종류·증가는 계속 차단한다.

위 항목은 기준선 통합·리뷰 결함·검증 인프라 적응이며 CP4 제품 동작 구현이 아니다.

## 7. 검증 결과

### 7.1 통과

- focused backend 최종 회귀: 126/126 PASS.
- backend full: 2,130 collected, 2,113 PASS, 환경 전용 17 SKIP, FAIL 0.
- backend Ruff: PASS.
- backend mypy blocking baseline: PASS.
- OpenAPI exact baseline: PASS.
- E2E wrapper Windows fallback/cleanup 계약: 6/6 PASS.
- frontend strict lint, app type, unit-test type, E2E type: PASS.
- unit-test verification contract: 16/16 PASS.
- unit-test type manifest/baseline: 266파일, 기존 429진단, 신규 종류·증가 0.
- Vitest coverage: 262파일, 2,329테스트 PASS; statement 94.1%, branch 90.97%, function 89.36%, line 94.1%.
- production build: PASS.
- bundle: 2,500,688 / 2,500,853.76 bytes PASS.
- Playwright 전용 DB 전체: 17/17 PASS, 1.5분.
- E2E teardown: 실제 `mes.db` SHA 불변, `mes_e2e.db*` 0, PID/hash/seed artifact 0, 8021/3300 listener 0.
- docs whitespace, maintained link checker, maintained links: PASS. Link checker 14개 중 13 PASS, Windows symlink 권한 전용 1 SKIP.
- DB read-only consistency: inventory mismatch 0, PASS.
- `git diff --check`: PASS.

### 7.2 공식 full과 blocker

Node 20.20.2에서 `verify_local.ps1 -Mode full -ChangeSet auto -DbReadOnlyCheck -IncludeE2E`를 수행했다. 병렬 실행에서 frontend 7개 gate는 모두 PASS했고 timing은 다음과 같다.

- lint 5.46초, app type 4.69초, unit-test type 32.84초, E2E type 2.45초
- coverage 358.94초, build 34.04초, bundle 1.05초

첫 실행의 backend URL은 설치되지 않은 `psycopg` driver를 잘못 지정해 migration 전 실패했으므로 최종 근거에서 제외했다. 설치된 `psycopg2` URL로 같은 full 명령을 순차 재실행해 docs·Ruff·mypy PASS와 PostgreSQL `state=empty` fail-closed를 확인했다. 그 뒤 빈 DB `bootstrap_db.py --all`로 위 `0024` 오류를 직접 확정했다. 따라서 전체 full의 최종 exit는 1이며 이를 성공으로 기록하지 않는다. fail-fast 뒤 실행되지 않은 backend full/OpenAPI/frontend 전체/DB read-only/E2E는 위 독립 정본 실행으로 보완했다.

## 8. GitHub CI·required-check 관찰

- 원격 품질 SHA `e0706c6`, CI run `32437802361`: success. E2E, frontend, backend, Windows ops, verification policy, PostgreSQL concurrency 6개 job 모두 success.
- 고정 main SHA `38551726`, CI run `33050070103`: failure. E2E와 backend는 success였고 frontend의 `Bundle size gate`만 failure. 이 main workflow 실행에는 PostgreSQL concurrency job이 없었다.
- `main` branch protection API: 404 `Branch not protected`.
- repository rulesets: 빈 배열.
- required-check, branch protection, workflow 설정 변경: 0.
- 현재 local red 상태는 remote에 push하지 않았다.

## 9. 독립 리뷰

초기 명세 리뷰는 Critical 1(공개 `0024` PostgreSQL fresh-upgrade 불가), Important 4를 보고했다. 네 Important는 현행 4상태×9=36, 12.15 현행 정본, correction 단일-effect 조건, ordered fingerprint로 모두 해소했다. Critical은 권한 밖 고정-main 결함이므로 이 handoff의 blocker로 승격했다.

초기 품질 리뷰는 Important 2(actor import/세션 spoof), Minor 1(E2E fallback 계약)을 보고했다. `VerifiedActor` 정본·공통 PIN 검증과 fallback 성공/실패 테스트로 해소했다.

최종 working tree 재리뷰 결과는 다음과 같다.

- 명세 리뷰: Critical 0 / Important 0, 승인.
- 코드 품질 리뷰: Critical 0 / Important 0 / Minor 0, 승인.
- 두 리뷰 모두 공개 `0024` 문제는 현재 품질 diff의 결함이 아니라 권한 밖 고정-main blocker라고 독립 판정했다.

## 10. 종료·금지 상태

- CP4 제품 구현: 시작하지 않음.
- local integration commit: full gate red 때문에 merge commit 이후 만들지 않음.
- push/force-push/새 branch/PR/main 변경: 0.
- worktree SQLite: head `0030`, hash 불변.
- E2E 임시 자원: 정리 완료.
- 폐기 가능한 PostgreSQL `test_dexcowin_ci`: 2026-08-27 20:21 KST 삭제 확인(`pg_database` count 0).
- 품질 worktree 아래 PostgreSQL runtime cluster: `pg_ctl -m fast -w` 정상 정지, 최종 `no server running`. binary와 cluster 파일은 ignored 증거 runtime에 보존했다.

이 문서 이후 구현자는 새 설계 결정을 내리지 않는다. 수정된 고정 `main` SHA가 오기 전에는 멈추고, 새 SHA가 오면 먼저 migration/full gate만 재검증한다. green이 된 뒤에만 위 고정 순서로 CP4를 시작한다.
