# DEXCOWIN MES CP5 W2 `IC-06` runtime → W3 인계

- 작성일: 2026-09-01 KST
- 품질 worktree: `C:\ERP\.worktrees\full-code-quality-checkpoint-2`
- 품질 branch: `codex/full-code-quality-improvement`
- W2 시작 HEAD: `66a07a869b9315dfa3406727067f6f7529d1cfe5`
- W2 구현 commit: `e1a55b835137aa0092c41c1340263e77b0829a3c`
- 기준 main: `78e8023f41ef59528d9d8c07498e7653f9bee247` (S0에서 통합 완료)
- GitHub CI: run `33478159021`, 6/6 success
- 상태: **W2 COMPLETE / W3 `IC-07+IC-08` 진입 가능**

## 1. 구현 계약

- additive migration `20260831_0032`와 `warehouse_unplaced_items`를 추가했다.
- 모든 활성 품목에 `B + 활성 Z + U = W`를 적용했다.
- 출고 source는 `R1 box → 활성 zone(display_order·zone_id·row_id) → U` 순서다.
- 기존 B/Z UUID를 보존하고 contract v2 effect에는 실제 B/Z/U row UUID를 기록한다.
- 취소·정정은 기록된 물리 행을 정확히 역전하며 행 소실·후속 소비·비활성 zone 충돌은 409와 mutation 0이다.
- duplicate·orphan·음수·비활성 zone 수량·`B+Z>W`는 자동 merge/backfill하지 않고 fail-closed한다.
- legacy contract v1 위치는 추정하지 않는다.
- 지도·이력 화면에 B/Z/U 및 취소 경고를 additive로 표시한다.
- 운영 production build에서만 `data-testid`를 제거하고, 실제 화면 위치 계산용 표식은 별도 runtime 속성으로 분리했다.

## 2. 최종 검증

- PostgreSQL 16.15 fresh DB 최초 필수 runner: 52/52 passed, skip 0
- backend full gate: 2,291 passed / 73 skipped, Ruff·mypy·OpenAPI PASS
- frontend full gate: 268 files, 2,401/2,401 tests, coverage/build/bundle PASS
- bundle: 2,497,975 bytes / limit 2,508,193.792 bytes
- GitHub CI run `33478159021`: E2E, verification policy, PostgreSQL concurrency, frontend, backend, Windows ops 6/6 success
- 독립 최종 리뷰: Critical 0 / Important 0 / Minor 0, READY
- `git diff --check`: PASS
- 동결 파일 diff: 0
- 품질 `backend/mes.db` SHA-256 전후 불변: `D0419DC051B881DA145B466AF99490570D18C47BCAAE990C57FFD4476FE28147`

fresh DB에서 최초 50/52로 드러난 두 경합 테스트의 순서 의존성은 제품 결함이 아니라 fixture 결함이었다. 해당 fixture가 ACK·전용 DB를 먼저 검증하고 cutover를 테스트 동안만 설정한 뒤 원상복구하도록 수정했다. 수정 뒤 완전히 새 DB의 최초 실행부터 52/52를 통과했다.

## 3. 격리·종료 상태

- 구현·검증은 품질 worktree와 폐기 가능한 SQLite/PostgreSQL DB에서만 수행했다.
- 생성한 PostgreSQL test DB는 삭제했고 기존 W1 preflight DB만 보존했다.
- PostgreSQL cluster 정지, 55432·8021·3100·3300 listener 0
- 개발·직원 서버 시작·연결·변경 0
- `C:\ERP-dev` 접근 0
- 주간보고, 모바일 하단 탭, 출하 step 5 동결 파일 변경 0
- 새 branch, force-push, PR, main push·merge 0

## 4. 다음 단일 작업 — W3 `IC-07+IC-08`

W3는 같은 release와 commit 묶음으로 다음을 완료한다.

1. 공통 availability를 `physical - stock_request_pending - active_shipping_reserved`로 고정한다.
2. warehouse/location cell과 lock 순서를 request/owner → item/inventory 정렬 → B/Z/U/location → reservation/allocation으로 통일한다.
3. shipping pickup만 자기 request의 RESERVED allocation을 owner exemption으로 소비한다.
4. 생산 backflush, IO, StockRequest, 부서조정, 불량, shipping prepare, BOM 추가 생산가능수량이 같은 policy를 사용한다.
5. additive `20260831_0033`에 `shipping_command_receipts`를 추가한다.
6. 동일 actor·route·`client_request_id`·semantic fingerprint는 결과를 replay하고, 다른 payload는 409 `IDEMPOTENCY_CONFLICT`다.
7. expected status 불일치는 409 `SHIPPING_STATE_CONFLICT`와 현재 상태를 반환한다.
8. 준비 취소는 allocation을 해제하고 `PREPARING`, 픽업 취소는 재고·RESERVED allocation을 복원하고 `PREPARED`로 돌아간다.
9. receipt·request·allocation·inventory·effect·event는 한 transaction으로 commit 또는 rollback한다.
10. PostgreSQL prepare×2, pickup×2, prepare/pickup-vs-cancel, 예약-vs-생산/IO/부서조정/불량 경합에서 winner 1·loser mutation/orphan 0을 증명한다.

W3 구현 전 추가 main 동기화는 하지 않는다. 같은 worktree를 수정하는 구현 작업은 한 번에 하나만 실행하고, RED→GREEN→독립 명세 리뷰→독립 품질 리뷰→staged gate→기존 품질 branch commit/push→GitHub CI 순서를 지킨다. 동결된 출하 step 5 카드 크기·grid·overflow는 수정하지 않는다. W3가 GREEN이면 사용자를 기다리지 않고 Gate B 증거를 정리해 W4로 진행하되 CP6는 시작하지 않는다.
