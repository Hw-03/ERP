# CP5 W3 완료 · W4 `IC-03-B` 실행 계약

> **완료(2026-09-02):** 이 TODO에서 지시한 W4는 제품 commit `ac8f26d570e728f193c1b2b40b8efdae7fe2363e`와 CI 회귀 수정 commit `8a66907014cfa7c5cd5de90e7d3b42d599a56ccf`로 완료됐다. 최종 GitHub CI run `33589486541`은 6/6 success이며, 현재 후속 정본은 `2026-09-02-cp5-w4-complete-w5-ready-todo.md`다. 아래 내용은 W4 진입 당시의 실행 계약으로 보존한다.

## 현재 정본

- 작업 위치: `C:\ERP\.worktrees\full-code-quality-checkpoint-2`
- branch: `codex/full-code-quality-improvement`
- W3 제품 commit: `530a29ec3a8c315b07004e69b7ab1d6dc17ed4a3`
- 원격: 위 제품 commit push 완료. 이 문서를 포함하는 최신 branch HEAD를 다음 작업 기준으로 사용한다.
- 카드 상태: `IC-06`, `IC-07`, `IC-08` 완료. `IC-03`은 CP4 correction 안전막만 완료한 `PARTIAL`이며 W4 `IC-03-B`가 남았다.

## W3 완료 증거

- 공통 availability: `physical - stock_request_pending - active_shipping_reserved`.
- pickup만 자기 request의 `RESERVED` allocation을 owner exemption으로 소비한다.
- additive migration: `20260831_0033_shipping_command_receipts.py`.
- 동일 key·동일 의미 replay, 다른 payload `IDEMPOTENCY_CONFLICT`, 상태/version drift `SHIPPING_STATE_CONFLICT`.
- 실제 PostgreSQL 16.15 필수 runner 79/79, 실패·오류·skip 0.
- 최종 로컬 full gate 18/18, Playwright 17/17.
- GitHub CI run `33578029469` 6/6 success.
- 독립 명세·품질 및 최종 gate-fix 리뷰: Critical 0 / Important 0 / Minor 0.
- 품질 `backend/mes.db` SHA-256은 전후 `D0419DC051B881DA145B466AF99490570D18C47BCAAE990C57FFD4476FE28147`로 불변이다.
- 55432·8021·3100·3300 listener 0, 일회용 PostgreSQL DB drop·cluster 정상 종료.
- 주간보고·모바일 하단 tab·desktop shipping step 5 카드 배치 추가 변경 0.
- `C:\ERP-dev` 접근 0, `C:\ERP` main 수정·서버·DB 작업 0.

## 완료된 단일 작업: W4 `IC-03-B`

별도 구현 작업 한 개가 다음 범위만 TDD로 수행한다.

1. 기존 `InventoryOperation` 원장을 low-level 역전 엔진으로 유지하고 `(domain, action)`별 `CancelPolicy` registry를 추가한다.
2. 허용 대상은 shipping pickup, production receipt, 완료 IO batch, StockRequest 실행, defect disassembly다.
3. 각 policy는 owning row, 허용 상태, pending/allocation, event, 복귀 상태를 명시한다.
4. 상태 복원은 문자열 추정이 아니라 기록된 operation effect의 `before_state`를 사용한다.
5. history router는 policy 조회·결과만 소비하고 workflow별 분기를 직접 소유하지 않는다.
6. generic 취소 우회는 409로 차단하고 안정된 reason code를 사용한다.
   - `WORKFLOW_CANCEL_UNSUPPORTED`
   - `WORKFLOW_STATE_CONFLICT`
   - `WORKFLOW_ALREADY_CANCELLED`
   - `WORKFLOW_DEPENDENCY_CONFLICT`
7. 다음 업무가 재고를 소비했다면 음수 복원보다 fail-closed 409·mutation 0을 우선한다.
8. main의 기존 IO draft 복귀 경로는 그대로 유지하고 회귀 테스트만 추가한다.

## W4 완료 증거

- 정상·중복·부분 실패·다음 업무 소비 후 취소 matrix.
- 실제 PostgreSQL 두 connection의 workflow cancel×2와 cancel-vs-next-consume.
- expected delta, 독립 SQL before/after delta, operation/effect delta 3자 일치.
- loser allocation/pending/log/effect/event 잔존 0.
- focused GREEN 뒤 독립 명세 리뷰와 코드 품질 리뷰 Critical/Important 0.
- staged smart gate, commit/push, GitHub CI는 총괄이 검토·승인한 뒤 기존 품질 branch에만 수행한다.

## 금지·정지 경계

- 같은 worktree를 수정하는 구현 작업은 한 번에 하나만 실행한다.
- `C:\ERP-dev`는 읽기·검색·해시·DB·process·port까지 전면 금지다.
- `C:\ERP` main은 읽기 전용이며 main 동기화·수정·서버·DB 작업을 하지 않는다.
- 새 branch, branch 전환, force-push, PR, main push/merge, 실제 배포·cutover는 금지다.
- 주간보고, 모바일 하단 tab, desktop shipping step 5 카드 크기·grid·overflow를 수정하지 않는다.
- W4를 닫기 전 W5를 시작하지 않고 CP5 완료 전 CP6를 시작하지 않는다.
