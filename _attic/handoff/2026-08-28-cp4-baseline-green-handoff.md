# DEXCOWIN MES CP4 GREEN 기준선 인계

- 작성일: 2026-08-28 KST
- 품질 worktree: `C:\ERP\.worktrees\full-code-quality-checkpoint-2`
- 품질 branch: `codex/full-code-quality-improvement`
- 기준 HEAD: `cd2c86b9410610d237a899dd22ef25f6d9a62ace`
- 고정 main: `759067e031aaf8245347952be3e86474981cab29`
- 판정: **GREEN — CP4 구현 시작 가능**

## 1. 해소된 기준선 blocker

- PostgreSQL 0024 index relation 오인: repair `0379648ef024c665f19fa1d037a5bccb21729bd8`, quality merge `cd7a81c9edc136b3be9bcce71a15ef709ae0aed0`
- PostgreSQL 0029 `inventory_operation_role_enum` 생성 누락: repair `0142a5696cc3d6c10343d6f6537d0c99d75659de`, quality merge `cd2c86b9410610d237a899dd22ef25f6d9a62ace`
- 실제 PostgreSQL 16.15 migration 행렬 15/15와 통합 concurrency 14/14 통과

## 2. 최종 기준선 검증

`powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode full -DbReadOnlyCheck -IncludeE2E`

- 최종 exit: 0
- backend: Ruff, mypy, full pytest, OpenAPI PASS
- frontend: lint, app/test/E2E type, coverage, production build, bundle PASS
- docs: whitespace, maintained Markdown link 검사 PASS
- DB: read-only check PASS
- Playwright: 17/17 PASS
- 실제 PostgreSQL concurrency: 14/14 PASS
- `backend/mes.db` SHA-256 전후 불변: `90FA7ABE83D2A8BF545531C15CDB75FDA2A3B9F519AA86F6EC396B8DE616C71E`

## 3. CP4 단일 실행 범위

감사 계획 8.9.5의 세 hard stop을 순서대로 수행한다.

1. `IC-03-A` correction 안전막 + correction 쪽 `IC-10`
2. `IC-09` semantic idempotency + handover/cancel 쪽 `IC-10`
3. `IC-11` active/deleted item command 경계

현재 판정은 `IC-03-A=PARTIAL`, `IC-09=OPEN`, `IC-10=PARTIAL`, `IC-11=PARTIAL`이다. main의 append-only inventory-operation 원장과 원자 취소를 재구현하지 않는다.

## 4. 절대 경계

- `C:\ERP` main worktree 수정·stash·commit·push 금지
- `C:\ERP-dev` 읽기·검색·해시·DB·process·port 포함 전면 접근 금지
- force-push, PR, main merge/push 금지
- 주간보고, 모바일 하단 탭, desktop shipping step 5 동결 영역 변경 금지
- 회사 도메인·DNS·HTTPS는 후속 작업
- CP4 완료 후 CP5 시작 금지

## 5. 종료 자원

- 일회용 PostgreSQL DB 0
- E2E 임시 DB 0
- 8021·3100·3300·55432 listener 0
- staged 변경 0

과거 `2026-08-27-2244-postgres-0024-repair-0029-blocker-handoff.md`의 blocker 판정은 이 문서와 감사 계획 12.17절로 대체한다.
