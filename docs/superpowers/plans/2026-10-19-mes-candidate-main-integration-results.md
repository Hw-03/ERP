# 최신 main을 후보에 결합한 검증 기록

**2026-10-20 현재 판정: main62ab7305까지 후보 통합·국소 검증·production 빌드3.273MiB 완료, 후보 푸시·최종 CI 진행. main과 직원 환경은 변경하지 않았다.**

후보5f5be8fb의 [CI39366613242](https://github.com/Hw-03/ERP/actions/runs/39366613242)는7job성공·일반E2E실패(298통과/2실패/1재시도통과)로 끝났다. 확정2실패는62ab7305의 `selected && detailOpen` 변경에 맞추지 못한 재고 E2E였다. 닫힌 상세의 `aria-pressed=false`와 다시 열 때의 상세/선택 복원을 함께 검증하도록 테스트만 수정했다. Linux 최종 제품 사본에서 해당2건과 같은 파일의 관련 왕복1건이 재시도0으로 통과했다(`followup-ci-inventory-fix.log`). ESLint도 통과했으며 제품 소스/빌드가 동일하므로 기존7job·빌드 근거를 재사용한다. 기대값 원문/과거 바인딩과 실패 원문 `followup-ci-failed.log`를 보존한다. 출하 초안 `SHELL02 shipping`의 인보이스 입력칸 미발견은 첫 실행 실패 후 재시도 통과한 간헐 사건이며 원인 미확정으로 남긴다. 새 수정 HEAD의 CI는 별도 확인한다.

병합 커밋 `c2f8d3f5` 후보 push 완료. [첫 CI](https://github.com/Hw-03/ERP/actions/runs/39335133787)의 프론트3파일11실패는 main에서 바뀐 정렬 버튼/격리 목록 문구와 후보 테스트의 이전 선택자, 새 권한 회수 훅의 mock 누락이었다. 실제 정렬·Back/Forward·화면 유지 단언은 유지하고 테스트3파일만 수정했다. 국소39건 통과(`ci-fix-local.log`), 제품 코드 변경 없음. 이 세 파일은 기대값 registry의 실행 대상이 아니어서 연결 파일 갱신은 없다. 최종 수정 HEAD의 CI는 별도 확인한다.

후보 `codex/mes-main-candidate-comparison-20261016`에 main `9824903eee733e352b90bdf381bd08b8373271ef`를 결합해 커밋·푸시했다. 과거 출하 BOM 입력 손실과 AS 연결 종료 사건의 원인은 계속 미확정이며 이번 관리자 BOM 결함과 동일 원인으로 단정하지 않는다.

2026-10-20 후속 승인으로 main `e55918bc`의 추가7커밋과 이후 `62ab7305`를 후보에 결합했다. 이전 최종 CI39336151664는 일반 E2E46실패/1재시도통과/254통과, 다른7job성공이었다. 실제 렌더와 달라진 후보 추가 테스트의 선택자·문구를 수정하고 수량·권한·저장/복원 단언을 유지했다. 관련 단위286건·실사커서7건·E2E122조건·타입·정적·연결 검사·빌드/번들이 통과했다. 새 HEAD의 전체 CI는 별도로 확인하며 과거 실패를 해결 완료로 소급하지 않는다. 새 로그는 R의 `followup-*`, Linux 합성 사본은 `/home/hw/mes-integration-followup-20261020/source`다.

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

아래 추가 main 결합의 최종 검사·후보 푸시·CI가 남아 있다. 2026-10-20 승인한 번들 한도는3.30MiB이며, 앞선3.271MiB 빌드의 통과는 당시 입력의 근거로 보존한다. main 변경과 직원 적용은 범위 밖이다. 과거 BOM/AS 원인을 추가 반복 조사하거나 미확정을 해결로 바꾸지 않는다.

## 2026-10-20 추가 main 결합과 CI 실패 보완

시작 후보63206756에 main e55918bc를 결합한 로컬 커밋은faa27b1c이며, 실행 중 추가된 main62ab7305도ed12b9b0으로 후보에만 결합했다. main 브랜치는 변경하지 않았다. 전자는 테스트8파일 충돌을 양쪽 검증 조건을 보존해 해결했고, 후자는 자동 병합됐다.

| 추가 변경 | 직원에게 보이는 동작 | 확인 범위·현재 상태 |
|---|---|---|
| 불량·입출고 선택 화면 | 검색·필터 높이와 간격을 main과 일치시킴 | 직접 소비자 단위 검사249건·불량/모바일 E2E66건 통과 |
| 품목 최근 내역 | 실제 작업 역할의 배지·초기 재고 등록 문구 표시 | 내역·삭제·출하취소 관련 E2E6건 통과 |
| 재고 목록 선택 | 상세를 닫으면 행의 선택 표시도 해제 | 관련 단위 검사 통과 |
| 같은 뜻의 검색어 관리 | 등록된 연결 검색·결과 없음 표시, 패널을 다시 열면 미저장 편집 초기화 | 재고 선택과 합쳐 직접 검사37건 통과 |
| 관리자 E2E | 현재 화면의 버튼·검색 입력·접힌 재고 변화·부서 필터를 선택 | 50조건 모두 통과 근거 확보, 수량·역할·감사 단언 유지 |

관리자 최초 실행은46통과·3실패·1미실행이었다. 실패는 숨겨진 로딩 입력까지 선택한 strict locator 오류, 초기재고의 이동 안내와 실제 수량 영역 분리, BOM의 초기 부서 필터 전체 전환이었다. 실패·미실행4건만 확인한 두 번째 실행에서2건 통과했고, 재고 변화 조회 전에 `isVisible()`로 펼침을 건너뛰던 테스트와 조립 필터 선택을 보완한 뒤 남은2건도 통과했다. 제품 코드를 추가로 수정하거나 단언·제한시간·재시도를 완화하지 않았다.

근거는 R=`_attic/runtime/integration-main-20261019`의 `followup-vitest.log`, `followup-pytest.log`, `followup-latest-main-vitest.log`, `followup-tsc-latest.log`, `followup-eslint-final-02.log`, `followup-e2e-history-03.log`, `followup-e2e-admin.log`, `followup-e2e-admin-02.log`, `followup-e2e-admin-03.log`이다. Linux 합성 사본은 `/home/hw/mes-integration-followup-20261020/source`, 실행별 화면·trace는 형제 `results-20261020T*`에 보존했다. 이전 CI39336151664의46실패 원문은 `ci-general-failed.log`로 보존하며 새 성공으로 덮지 않는다.

새 단위 검사·타입·정적 결과는 현재 제품 소스를 대상으로 했다. E2E는 e55918bc 결합의 합성 사본을 사용하며, 그 뒤62ab7305의 직접 소비자는 별도37건으로 검증했다. 불량/모바일66건은 재시도0으로 한 번에 통과했다(`followup-e2e-defect.log`). 신규 E2E 통과 범위는 관리자50·내역/출하6·불량/모바일66의122조건이며, 이미 유효한 검사를 전체 반복하지 않았다. 일부 통계 화면 전환 중 Recharts 크기 경고는 원문에 보존했고 실제 차트·분류별 수량 단언은 통과했다.

기대값 원장은 변경24개 단언과 현재 소스 해시·선언 위치를 연결했다. 시작63206756의 원문·사용자 피드백·현재 실행 상태·기존 실행 이력은 그대로이며, 변경 전 바인딩은 과거 이력에 추가했다. 생성·연결 검사 통과(`followup-ledger-final.log`, `followup-ledger-check.log`)와 별도 읽기 전용 JSON 의미 비교로 보존을 확인했다. 이 갱신은 실행 PASS 승격이 아니다. 검사하지 않은 전체 업무·과거 AS/BOM 사건의 원인은 통과로 승격하지 않는다.

최종 production 빌드는62ab7305까지 반영한 별도 Linux 사본에서 통과했다(`followup-build.log`). 번들은3,431,520바이트(3.273MiB), 승인3.30MiB 한도 이내이며 도구3검사도 통과했다. 사용자3038/8038의 실행 빌드는 덮어쓰지 않았다. 후보 HEAD의 최종 CI 결과만 아직 대기다.
