# CP5 완료 · CP6 진입 전 TODO

## 현재 정본

- 작업 위치: `C:\ERP\.worktrees\full-code-quality-checkpoint-2`
- branch: `codex/full-code-quality-improvement`
- CP5 제품 완료 HEAD: `b27ba39cd2cbad574fda30af9c118697086c30ad`
- W7 제품 commit: `b27ba39cd2cbad574fda30af9c118697086c30ad`
- W7 최종 GitHub CI: run `33934558904`, 6/6 success
- 정본 계획: `_attic/docs/research/2026-08-13-full-code-quality-audit-and-improvement-plan.md`의 8.9.6절과 12.25절
- 카드 상태: CP5의 `IC-03`, `IC-06`, `IC-07`, `IC-08`, `IC-17`, `IC-18`, `IC-19` 완료
- 엄격한 잔여 IC: 13개. `IC-04`·`IC-20` required-check 외부 증거가 확보되면 11개
- 실행 상태: **CP5 완료, CP6 미착수**

## CP5가 닫은 신뢰 사슬

1. 모든 활성 품목의 물리 창고 수량은 `박스 + 활성 특수구역 + 명시적 미배치 = 창고 총량` 계약을 따른다.
2. 공통 availability가 StockRequest pending과 활성 출하 예약을 함께 차감해 다른 업무의 선점을 막는다.
3. shipping prepare·pickup·각 취소는 expected state/version, command receipt, 결정적 lock으로 재시도와 경합을 한 번만 반영한다.
4. shipping pickup, production receipt, 완료 IO batch, StockRequest 실행, defect disassembly는 업무별 전용 취소가 원장·재고·상태·event를 한 transaction으로 되돌린다.
5. `inventory-integrity/v1`이 위치·예약·배정·고아·contract v2 effect의 blocking 위반을 CLI·관리자 API·health에 동일하게 판정한다.
6. `backup-manifest/v1`이 SQLite WAL과 PostgreSQL dump의 실제 복구 가능성을 staged restore로 증명한다.
7. `/health/live`는 process, `/health/ready`는 DB·schema·dependency·blocking integrity, `/health/detailed`는 sanitized 진단이라는 단일 의미를 가진다.

## W7 최종 증거

- backend health/runtime focused 64건, Node 20 E2E readiness 계약 7/7, PowerShell runtime batch·crash-loop, OpenAPI exact 통과
- 실제 PostgreSQL 16을 연결한 로컬 full gate 18/18, Playwright 17/17 통과
- 독립 명세 리뷰와 코드 품질 리뷰 Critical/Important/Minor 0
- GitHub CI run `33934558904`의 frontend, backend, E2E, verification policy, PostgreSQL concurrency, Windows ops 6개 job success
- 증거 경로: `_attic/runtime/code-quality-improvement/20260905-081356/cp5-w7-ic19/`
- 품질 `backend/mes.db` SHA-256: `D0419DC051B881DA145B466AF99490570D18C47BCAAE990C57FFD4476FE28147`, 전후 불변
- 일회용 PostgreSQL DB·E2E 임시 DB·8021·3100·3300·55432 listener 0
- 주간보고·모바일 하단 tab·desktop shipping step 5 카드 배치 추가 변경 0
- `C:\ERP` main은 읽기 전용으로 유지했고 개발·직원 서버에는 접근하거나 영향을 주지 않음

## 다음 체크포인트 후보: CP6

CP6의 계획 정본은 8.9.7절이다. 후보 카드는 `IC-12`, `IC-13`, `IC-14`, `IC-15`, `IC-16`, `IC-25`, `IC-26`이며 아직 어떤 구현 작업·테스트·branch 변경도 시작하지 않았다.

재개 시 다음 순서를 지킨다.

1. 사용자 지시를 확인하고 품질 branch와 원격의 clean·동일 상태를 읽기 전용으로 확인한다.
2. 현재 `main`이 고정 CP5 기준 `78e8023f41ef59528d9d8c07498e7653f9bee247` 뒤로 이동했는지 읽기 전용으로 산정한다.
3. 이동했다면 자동 병합하지 말고 delta 감사와 CP6 범위 재판정 계획을 먼저 제시한다.
4. 승인된 범위만 별도 구현 작업으로 RED→최소 구현→GREEN→독립 리뷰→검증 순서로 수행한다.

## 금지·보호 경계

- CP6는 사용자 지시 전 시작하지 않는다.
- `C:\ERP` main에 수정·stage·commit·push·서버·DB 작업을 하지 않는다.
- 개발·직원 서버는 읽기·검색·해시·DB·프로세스·포트 확인까지 접근하지 않는다.
- 새 branch, branch 전환, force-push, PR, main push/merge, 실제 배포·cutover를 하지 않는다.
- 주간보고, 모바일 하단 tab, desktop shipping step 5 카드 크기·grid·overflow를 수정하지 않는다.
- `IC-04`·`IC-20`의 품질 branch CI 성공을 GitHub required-check 설정 완료로 오인하지 않는다.
