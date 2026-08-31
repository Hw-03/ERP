# DEXCOWIN MES CP5 W1 `IC-06` preflight Gate A 인계

- 작성일: 2026-08-31 KST
- 품질 worktree: `C:\ERP\.worktrees\full-code-quality-checkpoint-2`
- 품질 branch: `codex/full-code-quality-improvement`
- 시작 HEAD: `f49a0b2bf837704f81ef98fe2e7ecf3be4305786`
- W1 구현 commit: `1c7bb1538ca18c88d3dbdeb8d1621eb72b396051`
- 기준 main: `78e8023f41ef59528d9d8c07498e7653f9bee247` (S0에서 통합 완료)
- 상태: **W1 APPROVAL-READY / Gate A 사용자 승인 대기**

## 1. 구현 범위

- `backend/scripts/inventory_location_preflight.py`
  - SQLite `mode=ro`·`query_only`·단일 read transaction
  - PostgreSQL `REPEATABLE READ READ ONLY`
  - W/B/active-Z/U 후보와 anomaly·canonical hash 보고
  - 필수 base table/schema/value/DB 오류 fail-closed
- `backend/tests/scripts/test_inventory_location_preflight.py`
  - SQLite WAL snapshot, mutation 0, schema/value 오류
  - 실제 PostgreSQL read-only·repeatable snapshot·교차 dialect hash·view/schema/query 오류
- `backend/scripts/verify_postgres_concurrency.py`
  - W1 PostgreSQL 6개 node를 필수 no-skip 목록에 추가

API·model·migration·제품 runtime·frontend 변경은 없다.

## 2. 품질 DB preflight 결과

- DB SHA-256 전후: `D0419DC051B881DA145B466AF99490570D18C47BCAAE990C57FFD4476FE28147`
- snapshot SHA-256: `545b3864293b0d920ed8f48b5c37b590af34118b027b4249b5dbfd2958140abe`
- report SHA-256: `02ffdf0518d28bfa62186194c9e24910c4b1a8444862b3b6181fd919a1f83fe5`
- inventory rows, W-only, inactive-zone, duplicate, orphan, negative, overplaced: 모두 0

이 결과는 fresh 격리 품질 DB에 한정된다. 직원 환경 DB나 실물 재고를 읽지 않았으므로 직원 재고가 깨끗하다는 판정으로 사용하지 않는다.

## 3. 검증과 리뷰

- SQLite focused: 9 passed, PostgreSQL 6 skipped(일반 로컬 경로)
- 실제 PostgreSQL 16.15 focused: 15 passed, skip 0
- 필수 PostgreSQL runner: 38 passed, skip 0
- verification runner 계약: 12 passed
- Ruff·mypy·`git diff --check`: PASS
- GitHub CI run `33396543900`: 6/6 success (PostgreSQL, Windows ops, frontend, verification policy, Playwright E2E 17/17, backend)
- 독립 명세 리뷰: Critical 0, Important 0, Minor 0
- 독립 운영·품질 리뷰: Critical 0, Important 0, Minor 0
- evidence: `_attic/runtime/code-quality-improvement/20260831-170648/cp5-ic06-preflight/`

## 4. 격리·종료 상태

- 품질 `backend/mes.db` mutation 0
- 55432 listener 0, postmaster PID 0
- 폐기 가능한 PostgreSQL cluster는 stopped 상태로 ignored evidence 경로에 보존
- 개발·직원 서버 시작·연결·변경 0
- `C:\ERP-dev` 접근 0
- 기존 품질 branch에 W1 commit·push 완료. branch 생성·전환, PR, main push·merge는 0

## 5. Gate A 이후 고정 정책

사용자가 Gate A를 승인하면 다음 W2만 시작한다.

1. additive migration `20260831_0032`와 `warehouse_unplaced_items`
2. 전체 활성 품목에 `B+Z+U=W`
3. 출고 source 순서 `박스 → 활성 특수구역 → 미배치`
4. duplicate·orphan·`B+Z>W`는 자동 merge/backfill 없이 fail-closed
5. 기존 B/Z UUID 보존, contract v2는 실제 row ID effect 필수
6. legacy effect 위치 추정 backfill 금지

Gate A 승인 전 W2 migration/runtime과 W3 `IC-07+IC-08`은 시작하지 않는다.
