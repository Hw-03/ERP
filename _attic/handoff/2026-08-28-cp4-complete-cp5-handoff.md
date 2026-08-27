# DEXCOWIN MES CP4 완료·CP5 인계

- 작성일: 2026-08-28 KST
- 품질 worktree: `C:\ERP\.worktrees\full-code-quality-checkpoint-2`
- 품질 branch: `codex/full-code-quality-improvement`
- CP4 제품 HEAD: `19d030b1d060ae1b74424843d9388438779f9951`
- 고정 main: `759067e031aaf8245347952be3e86474981cab29`
- 판정: **CP4 COMPLETE — CP5 NOT STARTED**

## 1. CP4 완료 범위

1. `IC-03-A` + correction 쪽 `IC-10`
   - commit `78c01d6a14fdf16e52ce0bdf8d3df03f7a768f95`
   - 원본 거래당 correction 한 번, 단순 단일 warehouse RECEIVE/SHIP만 허용
   - workflow-linked·다중/non-warehouse effect, 취소됨, 이미 정정됨은 HTTP 409 `CORRECTION_CONFLICT`, mutation 0
   - GitHub CI `33099973906`: 6/6 success
2. `IC-09` + handover/cancel 쪽 `IC-10`
   - commit `1618a88c325564548f187e7fb62f76a0096d4ab5`
   - actor+route+command+재고 의미 payload의 canonical SHA-256 fingerprint
   - same key의 다른 의미와 legacy null fingerprint는 HTTP 409 `IDEMPOTENCY_CONFLICT`, mutation 0
   - frontend `ResultUnknownError`가 transport uncertainty 동안 same key+payload 보존
   - GitHub CI `33110611616`: 6/6 success
3. `IC-11`
   - commits `a62546a5e689a2a6311471ed0965eb879939841a`, `19d030b1d060ae1b74424843d9388438779f9951`
   - active/deleted repository 분리, item-first lock, 활성 command/BOM 참조의 HTTP 409 `ITEM_IN_USE`
   - BOM 자동 삭제 금지, 참조 0일 때만 `deleted_at`+audit 단일 transaction
   - GitHub CI `33117217612`: 6/6 success

## 2. Schema·경합 증거

- additive migration: `20260828_0031`
- Alembic: `20260828_0031 (head)` 단일 head
- `transaction_logs`: 원본당 correction 한 번을 강제하는 PostgreSQL partial unique index
- `io_batches`, `stock_requests`: nullable `request_fingerprint VARCHAR(64)`
- 실제 PostgreSQL 16 runner: 29/29 PASS
- migration: fresh, `0030→0031`, rollback/retry PASS
- concurrency: correction×2, correction-vs-cancel, handover×2, cancel×2, rollback 후 retry, 응답 유실 retry, delete-vs-submit 모두 winner 1·loser orphan/부분 log 0

## 3. 최종 통합 검증

`powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode full -DbReadOnlyCheck -IncludeE2E`

- 최종 exit: 0, 18/18 gate PASS, 총 724.316초
- backend: Ruff, mypy, 실제 PostgreSQL 29/29, full pytest, OpenAPI exact PASS
- frontend: strict lint, app/test/E2E type, full coverage, production build, bundle PASS
- docs: whitespace, link checker tests 14건 중 13 PASS·권한 제한 symlink 1 SKIP, maintained links PASS
- DB read-only PASS, Playwright 전용 DB 17/17 PASS
- 초기 통합 시도의 유일한 실패는 Windows timeout test process의 자연 종료와 `taskkill` 사이 cleanup race였다. `scripts/dev/tests/schema-readiness-adapter.ps1:36`을 최소 보완하고 해당 pytest를 3/3 연속 PASS한 뒤 위 최종 full gate를 통과했다.
- 검증 기준 `backend/mes.db` SHA-256: `90FA7ABE83D2A8BF545531C15CDB75FDA2A3B9F519AA86F6EC396B8DE616C71E`
- 각 hard stop과 최종 통합 독립 명세·품질 리뷰: Critical/Important 0

## 4. 최종 카드 판정

- `IC-09`: 완료
- `IC-10`: 완료
- `IC-11`: 완료
- `IC-03`: `PARTIAL` — correction 안전막 완료, `IC-03-B` 전용 workflow cancel 남음
- 엄격한 잔여 IC: 20개. `IC-04`·`IC-20` required-check 외부 증거가 확보되면 18개

## 5. CP5 시작 경계

CP5는 시작하지 않았다. 다음 작업은 감사 계획 8.9.6의 첫 hard stop인 `IC-06 read-only preflight`다.

1. duplicate·orphan을 mutation 없이 보고한다.
2. input snapshot과 report hash를 고정한다.
3. preflight 증거와 outbound source·duplicate 처리 ADR을 사용자에게 제시한다.
4. 사용자 승인 전에는 `IC-06` runtime, schema, 재고 mutation을 시작하지 않는다.
5. 이후 순서는 `IC-06 runtime` → `IC-07+IC-08` → `IC-03-B` → `IC-17` → `IC-18` → `IC-19`다.

## 6. 절대 경계

- `C:\ERP` main worktree 수정·stage·stash·commit·push·checkout 금지
- `C:\ERP-dev` 읽기·검색·해시·DB·process·port 확인까지 전면 금지
- 새 branch, force-push, PR, main merge/push 금지
- 주간보고, 모바일 하단 tab 디자인, desktop shipping step 5 카드 크기/grid/overflow 변경 금지
- main inventory-operation 원장과 원자 취소를 중복 구현하지 않음

## 7. 종료 자원

- 품질 worktree `backend/mes.db` SHA-256 불변: `90FA7ABE83D2A8BF545531C15CDB75FDA2A3B9F519AA86F6EC396B8DE616C71E`
- 일회용 PostgreSQL DB `test_cp4_b_8f4c2a1d`: drop 후 remaining 0
- PostgreSQL 55432 cluster: 정상 종료
- E2E 임시 DB: 0
- 8021·3100·3300·55432 listener: 모두 0
- 동결 UI 변경: 0

이 문서는 `_attic/handoff/2026-08-28-cp4-baseline-green-handoff.md`를 대체한다.
