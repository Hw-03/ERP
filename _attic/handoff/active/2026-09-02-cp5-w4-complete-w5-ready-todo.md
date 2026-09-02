# CP5 W4 완료 · W5 `IC-17` 진입 TODO

## 현재 정본

- 작업 위치: `C:\ERP\.worktrees\full-code-quality-checkpoint-2`
- branch: `codex/full-code-quality-improvement`
- 현재 제품 HEAD: `8a66907014cfa7c5cd5de90e7d3b42d599a56ccf`
- W4 제품 commit: `ac8f26d570e728f193c1b2b40b8efdae7fe2363e`
- W4 CI 회귀 수정 commit: `8a66907014cfa7c5cd5de90e7d3b42d599a56ccf`
- 최종 GitHub CI: run `33589486541`, 6/6 success
- 카드 상태: `IC-03`, `IC-06`, `IC-07`, `IC-08` 완료. CP5 Gate C 완료. 다음 단일 범위는 W5 `IC-17`이다.

## W4 완료 계약

1. 기존 `InventoryOperation` 원장을 low-level 역전 엔진으로 유지한다.
2. `(domain, action)` `CancelPolicy`가 shipping pickup, production receipt, 완료 IO batch, StockRequest 실행, defect disassembly의 owner 상태와 side effect 복원을 소유한다.
3. 상태는 기록된 operation effect의 `before_state`로만 복원하며 문자열 추정이나 legacy 자동 backfill을 하지 않는다.
4. allocation/pending, request/batch 상태, event, effect는 한 transaction에서 모두 복원되거나 모두 그대로 남는다.
5. history 취소와 출하 전용 취소는 owner-first 잠금 순서를 공유한다.
6. 안정 reason code는 다음 네 개다.
   - `WORKFLOW_CANCEL_UNSUPPORTED`
   - `WORKFLOW_STATE_CONFLICT`
   - `WORKFLOW_ALREADY_CANCELLED`
   - `WORKFLOW_DEPENDENCY_CONFLICT`
7. 정확한 v2 `handover/receive` effect는 CP4의 기존 종료 계약을 유지한다. effect가 변형됐거나 shipping/IO workflow 연결 로그가 섞이면 mutation 0으로 차단한다.

## W4 검증 증거

- 5개 업무의 정상·중복·부분 실패·후속 소비·상태 drift matrix 통과.
- 최종 SQLite 집중 회귀 147/147.
- 실제 PostgreSQL 16 경합 4/4:
  - workflow cancel×2
  - history 취소 vs shipping 전용 취소
  - cancel vs next consume
  - handover cancel×2
- PostgreSQL 신규 deadlock 0, winner 1, loser orphan 0.
- expected delta, 독립 SQL before/after delta, operation/effect delta 3자 일치.
- loser allocation/pending/log/effect/event 잔존 0.
- Ruff, mypy, `git diff --check`, staged smart gate 통과.
- 독립 명세·코드 품질 리뷰 최종 Critical/Important/Minor 0.
- 첫 CI run `33587257445`는 기존 handover 취소 회귀를 검출했고 수정했다. 최종 run `33589486541`은 6/6 success다.
- 증거 경로:
  - `_attic/runtime/code-quality-improvement/20260902-cp5-w4-ic03b/`
  - `_attic/runtime/code-quality-improvement/20260902-cp5-w4-ic03b-ci-fix/`
- 품질 `backend/mes.db` SHA-256은 `D0419DC051B881DA145B466AF99490570D18C47BCAAE990C57FFD4476FE28147`로 불변이다.
- 55432·8021·3100·3300 listener 0, 일회용 PostgreSQL DB drop·cluster 정상 종료.
- 동결 UI 변경 0, `C:\ERP-dev` 접근 0, `C:\ERP` main 수정·서버·DB 작업 0.

## 다음 단일 작업: W5 `IC-17`

별도 구현 작업 한 개가 다음 범위만 TDD로 수행한다.

1. CLI, 관리자 API, detailed health가 같은 순수 integrity engine을 사용한다.
2. `inventory-integrity/v1` JSON에 안정된 check ID, severity, count, samples를 둔다.
3. 종료 코드는 `0=pass 또는 warning-only`, `1=blocking 데이터 위반`, `2=CLI 사용/config 오류`, `3=DB/schema/tool 오류`다.
4. location pending, StockRequest 상태, ShippingAllocation, box/zone/unplaced, orphan, contract v2 effect 위반을 blocking으로 검사한다.
5. contract v1 missing effect만 warning으로 유지한다.
6. 누락 SQLite 경로에서 빈 DB 파일을 생성하지 않는다.
7. SQLite와 폐기 가능한 PostgreSQL에서 각 invariant를 하나씩 깨뜨려 false-green이 0인지 검증한다.
8. W5 완료 전 `IC-18`, `IC-19`를 시작하지 않는다.

## W5 완료 증거

- 순수 engine의 CLI·관리자 API·detailed health 결과가 check ID·count 기준으로 일치한다.
- 각 blocking invariant가 exit 1과 동일한 API/detailed 결과를 만든다.
- warning-only는 exit 0이며 blocking으로 승격되지 않는다.
- config 오류와 DB/schema/tool 오류가 exit 2·3으로 구분된다.
- missing SQLite 경로의 파일 생성 0.
- focused SQLite·실제 PostgreSQL 검증, 독립 명세·품질 리뷰 Critical/Important 0.
- staged smart gate, 기존 품질 branch commit/push, GitHub CI 6/6 success.
- 감사 계획과 다음 active handoff가 실제 commit·CI·증거와 일치한다.

## 금지·정지 경계

- 같은 worktree를 수정하는 구현 작업은 한 번에 하나만 실행한다.
- `C:\ERP-dev`는 읽기·검색·해시·DB·process·port까지 전면 금지다.
- `C:\ERP` main은 읽기 전용이며 main 동기화·수정·서버·DB 작업을 하지 않는다.
- 새 branch, branch 전환, force-push, PR, main push/merge, 실제 배포·cutover는 금지다.
- 주간보고, 모바일 하단 tab, desktop shipping step 5 카드 크기·grid·overflow를 수정하지 않는다.
- W5를 닫기 전 W6를 시작하지 않고 CP5 완료 전 CP6를 시작하지 않는다.
