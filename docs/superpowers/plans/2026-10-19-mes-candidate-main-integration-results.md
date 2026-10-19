# 최신 main을 후보에 결합한 검증 기록

**2026-10-20 현재 판정: 후보 통합·국소 검증·승인3.30MiB 번들 게이트 완료, 병합 커밋·푸시·CI 진행. main과 직원 환경은 변경하지 않았다.**

후보 `codex/mes-main-candidate-comparison-20261016`에 main `9824903eee733e352b90bdf381bd08b8373271ef`를 결합했다. 아직 merge commit 전이다. 과거 출하 BOM 입력 손실과 AS 연결 종료 사건의 원인은 계속 미확정이며 이번 관리자 BOM 결함과 동일 원인으로 단정하지 않는다.

| 확인한 업무 | 결과와 직원 영향 | 남은 조건 |
|---|---|---|
| 로그인·권한 갱신 | 늦은 조회가 새 역할 저장·다른 계정 로그인을 덮는 결합 경합을 수정하고 실패→통과 확인 | 이번 브라우저에서 모든 역할 조합을 다시 수행하지 않음 |
| 관리자 BOM | 늦은 실시간 조회가 저장/취소 결과를 덮는 경합 수정. 실제 화면 2→3 저장, 4 미저장→취소→3 복원 | 출하의 과거 간헐 입력 실패는 별도 미확정 |
| 검색 | 쉼표로 나눈 두 품목을 동시에 찾음. main OR 검색과 후보 보호 조건 유지 | 전체 검색 조합을 브라우저로 반복하지 않음 |
| 창고 격리·복귀·취소 | 창고 439→438→439→438, 취소 후 격리 1. 다른 품목·부서 수량 불변 | 후속 생산·출하 사용 및 모든 분류/부서 조합은 이번 미실행 |
| 복제 DB | revision 0047, 기존 86개 테이블 행 보존·외래키·무결성 통과 | 직원 DB에 실행하지 않음 |
| production | 빌드 통과. 번들 3,430,232바이트(3.271MiB), 기존3.25MiB 실패 보존·승인3.30MiB 게이트 통과 | 제품 빌드 입력 불변으로 재빌드 없음 |

## 근거 위치와 재현 환경

W=`C:/Users/user/.codex/worktrees/mes-main-candidate-comparison/ERP`.
R=`W/_attic/runtime/integration-main-20261019`.
원문 화면·DB·거래에는 실제 자료가 있으므로 ignored R에만 보관한다. 아래 경로는 모두 R 기준이다. 이번 검증은 main 서버와 동시에 같은 업무를 수행한 비교가 아니라, 결합판의 지정 조건 검증이다. main과의 차이는 병합 diff 및 관련 자동 검사로 대조했다.

- production QA 주소 `http://127.0.0.1:3039`, backend8038, DB `browser/qa.db`. 실제 뷰포트1920×1080. QA 겸임 역할로 처리했다.
- 원형 `review-before.db`, 시작 식별값 `preflight.json`, QA 서버 식별값 `browser/session.json`.
- 실행 종료 후 임시 QA 서버/탭을 종료했다. 사용자 `http://localhost:3038`을 원래 `C:/ERP/_attic/runtime/main-candidate-20261016/B/qa.db`로 다시 production 기동했다.
- 기존 사용자 DB SHA256 `bddc1c4f61c04fa2ecf3479b6e8d737886cb18f399ee24a005e1cd97a7716376` 불변. 기동 시 기존 업무 행 동일 검사 통과. 사용자 BOM 초안·연구 요청을 검증에 사용하지 않았다.

## 검색 — 두 코드 OR 조건

목적은 최신 main의 쉼표 OR 검색이 후보의 검색 보호 조건과 함께 작동하는지 확인하는 것이다. QA 겸임 로그인 → 품목 검색에 `8-TR-0001,9-TR-0004` 입력 → 두 결과 확인. 전극 품목 두 건이 표시됐고 표시 수량은 각각166/155였다. 조회만 수행해 수량 변경·후속 사용·취소는 해당 없다.

판정은 **동일 정상(해당 OR 조건)**. 직원은 쉼표로 나눈 품목들을 함께 찾을 수 있다. 화면 `browser/search-or.png`, 관련 자동 검사 `backend-related.log`와 `backend-nodes.log`. 다른 검색 조합의 브라우저 검증은 이번 범위 밖이다.

## 창고 격리 → 정상 복귀 → 복귀 취소

목적은 화면 개편 후에도 정상 복귀와 취소가 같은 창고 위치를 사용하고 부서 재고를 건드리지 않는지 확인하는 것이다.

1. QA 겸임 → 불량 → 불량 처리 → 격리 등록 → 창고 재고.
2. `3-AR-0004` DX3000 NAVI KEY 선택 → 수량1 → 외관불량 → 메모 `QA-INTEGRATION-20261019-WH` → 제출.
3. 새 격리 원건 → 처리 → 정상 복귀1 → 즉시 복귀.
4. 내역에서 새 정상 복귀 선택 → 취소 → 사유 `QA-INTEGRATION-RETURN-CANCEL` 입력·확인.

| 단계 | 예상 | 실제 |
|---|---|---|
| 시작 | 창고 정상439, 전체440, 예약0 | 동일 |
| 격리1 | 창고438, 새 격리1 | 동일 |
| 정상 복귀1 | 창고439, 새 원건 잔량0 | 동일 |
| 복귀 취소 | 창고438, 격리1 복원 | 동일 |
| 무관 위치 | 다른 품목·부서 수량·예약 불변 | DB 대조 통과 |
| 후속 사용 | 이번 실행 대상 아님 | 미실행 |

판정은 **동일 정상(이 신규 원건의 복귀·취소)**. 창고에서 복귀한 수량이 별도 부서 재고로 잘못 분리되지 않는다. 이 결과를 모든 부서/분류/일괄 처리 성공으로 확대하지 않는다.

근거: `browser/before-defect.db`, `browser/qa.db`, `browser/defect-origin.png`, `browser/return-history.png`, `browser/quantity-check.json`, `browser/check_quantities.py`. 단계별 거래 자료는 `browser/evidence.py`가 저장한 `browser/after-return.json`, `browser/after-cancel.json`에 보존한다. 취소는 역거래·원건 잔량으로 확인했으며 원 거래의 단일 cancelled 필드만으로 판정하지 않았다.

## 관리자 BOM — 저장 결과와 미저장 취소

목적은 main의 읽기 상태 UI와 후보의 구성 저장 기능을 합쳤을 때, 늦은 조회가 확정한 수량을 덮지 않는지 확인하는 것이다.

QA 겸임 → 설정 → 관리 → 관리자 인증 → BOM관리 → `8-TF-0001` DXDR-70 튜브 → 검토·완료 → 완료 해제 → 첫 구성품 전극 `8-TR-0001`의2EA 클릭 →3 입력·Enter → 구성 저장. 이후3EA 클릭 →4 입력·Enter → 변경 취소 →3EA 복원, 저장/취소 버튼 비활성 확인.

변경 전 구성 수량2 → 예상 저장3 → 실제 화면/DB3 → 미저장4 → 취소 후3. 이 작업은 BOM 구성만 편집하므로 물리 재고 증감은 없으며 후속 생산은 실행하지 않았다. QA 사본에서만 완료 해제와 구성을 변경했다.

자동 검사에서 앞선 실시간 조회가 뒤늦게 도착해 저장/취소 결과를 덮는 상황을 재현했다. 저장/취소가 최신 읽기 순서를 갱신하도록 최소 수정했다. **새 결합 경합 수정 완료**이며, 과거 출하 수량 입력 사건과는 관계 미확정이다. 근거 `bom-race-red.log`, `admin-first.log`, `browser/bom-saved-discarded.png`, `browser/quantity-check.json`, `browser/bom-delta.json`(전체 BOM 중 이 한 수량만2→3).

## 관련 자동 검사·재사용 범위

- 백엔드 관련375건: `backend-related.log`, 정확한 선택자 `backend-nodes.log`.
- 불량 장바구니68건: `defect-cart-final.log`.
- 관리자108건 중 최초4건 단언/기대값을 바로잡아 실패한 두 파일28건만 재검사: `admin-first.log`, `admin-corrected.log`.
- 소비자22파일396건의 최초3실패는 로그인 mock 누락. 해당 로그인 묶음만 신규 경합 검사와 함께25건 재검사: `consumers-first.log`, `login-final.log`.
- 새 권한 경합 실패 근거: `access-red.log`, `initial-access-red.log`.
- 타입/관련 ESLint: `tsc-final.log`, `eslint-final.log`. 빌드 `build.log`, 번들 실패 `bundle.log`.
- 복제 DB: `migration-result.json`, `migration-check-02.db`, `check_db.py`.
- smart 계획 `smart-plan.log`의 경로 기반 전체 승격은 실행하지 않았다. 충돌과 직접 소비자 위험을 위 국소 검사로 확인했으며 기존 전체 CI 설정은 유지한다.
- 기존 진단 도구 자체 검사와 과거 전체 기대값 근거는 당시 소스의 근거로 보존한다. 원장 연결 갱신은 실행 PASS 승격이 아니다. 새 결합판 전체 기대값·전체 업무 E2E·성능·복구는 재실행하지 않았다.
- 원장 연결·해시·선택자 검사 통과: `ledger-final.log`. 변경 전 binding을 historicalBindings에 남기고 현재 sourceHash/선언 위치만 갱신했다(`binding-updates.json`). 기존 historicalExecutions는 유지했고 현재 실행 상태를 PASS로 승격하지 않았다.

## 남은 단계

2026-10-20 사용자 승인 후 번들3.30MiB 적용·관련3검사·실제 게이트 통과(`bundle-approved.log`). 최신 origin/main은9824903e로 동일. 남은 순서는 명시 stage·diff 검사 → merge commit → 후보만 push → 최종 HEAD CI 확인이다. 원장 연결 검사와 현재 staged diff 공백 검사는 통과했다. main 변경과 직원 적용은 범위 밖이다. 과거 BOM/AS 원인을 추가 반복 조사하거나 미확정을 해결로 바꾸지 않는다.
