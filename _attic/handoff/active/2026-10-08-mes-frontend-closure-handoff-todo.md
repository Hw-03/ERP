# DEXCOWIN MES 화면 기대값 검증 인계

부모 최종 통합용 인계다. 상위 활성 작업은 `2026-10-07-mes-expectations-closure-todo.md`이며 이 문서는 해당 체크리스트를 대신하거나 완료 처리하지 않는다.

작업 root는 `C:/Users/user/.codex/worktrees/mes-expectation-closure/ERP`다. 원본 C:/ERP, 실제 직원/개발 DB·서비스는 변경하지 않았다. 커밋·푸시·canonical 원장 변경은 수행하지 않았다.

## 상태 요약

2026-10-10 사용자 지시로 추가 최적화와 전체 검사 반복을 중단했다. 아래 C13 실행 성공은 당시의 이력이며 현재 소스 전체 PASS가 아니다. 최신 원장은 그 근거를 historicalExecutions에 보존하고 current NOT_RUN으로 표시한다. 적용 가능한 프론트 소스·설정·산출물의 통과 근거는 범위를 명시해 재사용하며, 최종 복구·브랜치 push·정확한 HEAD CI는 부모 활성 TODO의 최신 상태를 따른다.

아래 인계 체크는 완료 5 / 대기 1이다(2026-10-09). 실제 업무 기대값 분모와 공식 실행 상태는 부모 원장에서 동적으로 계산한다. 승인 정책 구현과 현재 실행 검증은 완료했으며, 원장 승격·엄격 완료 및 최종 통합 판정은 부모의 최신 기록을 따른다.

## 인계 체크

- [x] **최신 일보 승인 정보 projection 검토·검증 완료 — 2026-10-08.** `backend/app/routers/daily_work_reports.py`만 기존 `_batch_name_map`/`_stock_request_info_map` 결과를 `_to_log_response`에 전달했다. 요청자·실제 승인자·요청/승인시각을 같은 거래의 입출고 내역과 맞췄다. 공용 `_tx_filters.py`는 recovery 담당 단독 소유였고 직접 수정하지 않았다. `test_daily_activity_preserves_same_history_request_approval_and_memo`의 department/warehouse × batch 연결 유무 4개 RED→GREEN, 공용 helper 후속 수정 이후 일보 전체 34개 재실행 PASS 및 ruff0. 조회 후 원장/요청 상태 불변도 직접 검증한다. 증거: `daily-history-projection-{red,green,consumers,final}.log`와 final.xml.
- [x] **원자재·일보 실제 브라우저 흐름 확인 완료 — 2026-10-08.** `io-receipt-candidates.spec.ts`의 실제 부서 선택 없는 창고 입고·필터/검색 후 선택품/수량 보존과 전체 공정 원자재 후보·삭제/분류변경 차단 2개, `io-request-report-audit.spec.ts`의 튜브/고압 내요청 대기→완료·승인자 및 같은 log ID의 내역/일보 수량·메모 2개가 부모 browser47에서 PASS. 선택 위치 7→8, 다른 부서 7과 창고 수량 보존을 확인했다. 최초 driver 실패 및 실제 daily projection 실패는 `io-request-receipt-review.md`에 구분 기록했다. 같은 실행의 다른 실패까지 성공으로 일반화하지 않는다. 로그/JSON/environment: `closure-new-flows-browser-47.*`, 부모 보존 `browser47-failures/`.
- [x] **불량 초안 이탈 보존 및 앞선 담당 범위 연결 정리 완료 — 2026-10-08.** DesktopDefectView는 다른 탭 popstate에서 Shell의 확인 전에 cart를 해제하지 않도록 최소 경계를 추가했다. 신규 선택품/수량/메모 유실 RED1→GREEN과 내부 작업선택/realtime/보관 Back·Forward 관련 44개 PASS. 실제 두 행·사유·기타 메모의 Back/새로고침/메뉴 머무르기 보존 및 처리 호출 없는 나가기는 browser46 PASS다. 앞선 일괄·개별 불량/반품 응답유실 재시도 범위는 browser39 STALE와 browser41 나머지 흐름의 진단 근거를 유지하며 formal PASS로 바꾸지 않는다. 관련 후보: `defect-bulk-browser-bindings.json`.
- [x] **최종 후보 선언·assertion·소스 해시 재검토 완료 — 2026-10-08.** 부모의 공통 spec 후속 변경과 신규 daily 테스트 때문에 오래된 해시를 현재 builder로 재생성했다. 아래 8개 후보 validator 오류 0, 새 raw/daily tsc0·ESLint0·Playwright --list4 및 해당 제품/test `git diff --check` exit0. 증거: `frontend-final-review-validation.log`, `io-receipt-report-audit-{tsc,eslint,list}.log`. 조건에 직접 대응하는 근거만 연결하며 원문 finalExpected/finalStaffExpected/피드백/결정 및 미해결 정책을 보존했다.
- [x] **승인된 주간·직원 정책 구현 및 실행 검증 완료 — 2026-10-09.** 주간의 제한된 동결 예외와 신규 직원 관리자 메뉴 기본 숨김을 구현했다. 현재 `final-c13-verified-20261009`의 9개 실행 그룹 native 0/PASS 및 p10/q10 production 빌드 native 0을 확인했다. 원장 승격·strict·성능·공동복구·HEAD CI 완료는 별도 판정이다. 아래 응답 대기 기록은 당시의 역사이며, 현재 기준은 부모의 `2026-10-07-mes-expectations-closure-todo.md`와 `2026-10-08-mes-safe-closure.md`이다.
- [ ] **전체 고정 입력 공통 검증·canonical 판정·통합 대기.** 부모 all READY/full freeze 뒤 전체 입력 refresh→validate→canonical 통합과 공통 테스트/빌드/엄격 원장 실행이 남았다. 현재 개별 진단 PASS를 공식 현재 PASS로 승격하지 않는다. 문서/USER_GUIDE·커밋·푸시도 부모 소유다.

## 부모 통합용 후보와 builder

모두 `_attic/runtime/closure/` 아래의 후보이며 canonical 원장 파일이 아니다.

| 후보 | 현재 재생성 도구 |
| --- | --- |
| common-bindings.canonical-ready.json | build_frontend_canonical_bindings.py |
| report-bindings.canonical-ready.json | build_frontend_canonical_bindings.py |
| admin-export-bindings.canonical-ready.json | build_frontend_canonical_bindings.py |
| capacity-readstates-bindings.canonical-ready.json | 기존 최신 후보, 이번 validator 오류 0 |
| admin-ui-extra-candidates.json | build_admin_ui_extra_candidates.py |
| admin-master-extra-candidates.json | build_admin_master_extra_candidates.py |
| defect-bulk-browser-bindings.json | build_defect_bulk_browser_bindings.py |
| io-request-receipt-candidates.json | build_io_request_receipt_candidates.py |

AS·연구 및 관리자 flags/preview 등 다른 독립 후보도 부모의 전체 refresh 입력 목록에 있다. 이 표는 이번 최종 검토한 8개이며 전체 후보 분모를 주장하지 않는다.

## 보존한 remainingGap

아래는 승인·구현 전의 실패와 질문을 보존한 기록이다. 현재 미해결 목록으로 해석하지 않는다. 정책은 위 완료 항목과 부모 TODO를 따른다.

- 주간 `8.21-01/screen-file-period`: KST 연말 주차 범위에서 다음 월요일 0시 q1을 포함하는 frozen 계산의 실제 RED. 기대5를6으로 완화하지 않는다.
- 주간 `8.21-02/three-level-screen`: 전체 정상재고 합계 실제 화면 표시 누락.
- 주간 `8.21-03/one-class-column`: 재작업 불량·폐기 자식의 기존 두 열 계산과 원문 한 열 조건 충돌.
- 주간 `8.21-06/screen-scope-guide`, `8.21-07/scope-guide-screen`, `8.21-10/classification-guide`: 실제 화면 안내 미연결·동결 해제/문구 정책 응답 대기.
- 주간 `8.21-11/pf-week-file-screen`, `PC-DELTA-WEEKLY-01/real-pickup-refresh` 및 export `8.19-22/f705-real-pf-screen-file-quantity`: PF만 양수인 주에 frozen 모델표가 숨겨진 실제 RED와 후속 화면/파일 비교 미도달.
- `PC-DELTA-ADMIN-02/new-employee-default-menu-policy`, `admin-form-login-menu-consistency`: 신규 직원 기본 메뉴와 G01 접근 설정/PIN 계약의 사용자 선택 대기. 새 역할/등급 정책을 만들지 않는다.

## 작업 경계와 재개 시 주의

제품/spec은 현재 READY 상태로 저장을 멈췄다. 부모 요청 전 새 서버 시작, DB/시드 조작, 기존 공유 파일 수정, stage/commit/push를 하지 않는다. weekly frozen, MobileShell 고정 Nav 디자인, DesktopShippingView step5 카드 배치를 수정하지 않았다. DailyWorkActivity는 기존 history 작업명 helper와 실제 서버 저장 필드를 재사용했으며 승인 규칙을 프론트에 복제하지 않았다.

새 실패가 생기면 부모가 보존한 실행 JSON/environment와 실제 trace/context부터 확인한다. 테스트 source hash가 바뀌면 builder로 정확 선언/직접 assertion을 다시 연결하되 테스트 목표를 삭제하거나 원문 기대를 줄이지 않는다.
