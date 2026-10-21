# 2026-10-21 최신 main → 후보 결합 결과

## 현재 상태

최신 main을 결합한 후보024f6897의 CI는 일반 E2E만 실패했고 다른7job은 성공했다. 아래 CI 후속에서 실패14건의 관련 검사와 최종 빌드를 통과했다. 후보 커밋·푸시를 진행하며 main 반영·직원 배포·예약 변경은 수행하지 않는다. 과거 BOM·AS·출하 메모의 간헐 사건을 해결로 승격하지 않는다.

- 작업본: `C:/Users/user/.codex/worktrees/mes-main-candidate-comparison/ERP`
- 후보: `codex/mes-main-candidate-comparison-20261016`
- 시작 후보: `48ddea951a698d5f50571691b74fad5f777088b3`
- 보존 커밋: `e6ff32bc` — 기존 문서 3개의 메모 조사·production 확인 기록만 먼저 저장했다.
- 통합 커밋: `8fd749fbf21547a013a6afa7f805988698dfec72`
- 결합 main: `5776783128381b7e09e72c1a7c774d0614de435e`
- 공통 기준: `62ab7305bcb98f9304837b45f1112f45347dde9f`
- 로컬 근거 R: `_attic/runtime/main-integration-20261021`
- 격리 Linux 근거 L: `/home/hw/main-integration-20261021`

## 동작과 충돌 해결

| 영역 | main에서 가져온 내용 | 후보에서 보존한 내용 |
|---|---|---|
| 관리자 조회 | 공용 캐시·활성 모드 조회·목록 가상화·재진입 상태 | 직원의 늦은 응답 차단·revision 이후 부서 재조회 |
| 관리자 입력 | 중복 저장 방지·실패 Promise·미저장 입력 보호 | 정확한 품목 코드 미리보기·409 초안 보존·삭제 의존성 조회와 오류 재조회 |
| BOM | 상세·사용처 캐시·가상 목록·로딩 프레임 | 전체 구성 저장·기준 행 비교·두 탭 충돌·완료 잠금·늦은 저장/취소 응답 보호 |
| 내역 취소 | 출하 예약으로 취소할 수 없을 때 구체적인 안내 | 위치별 재고·대기 결재·출하 예약 검산·취소 원장 보호 |
| 주변 화면 | 입출고 방향 색·전수조사 대기 배치·표 헤더·로고 보완 | 기존 권한·재고·업무 처리 계약 |

작업 예약 기능의 추가와 revert는 최종 순변경이 0이다. 해당 기능을 재도입하지 않았다. 신규 migration·공개 업무 API·DB 스키마 변경도 없다.

충돌 17개는 양쪽 동작을 읽어 결합했다. BOM과 취소 경로는 독립 읽기 리뷰도 수행했다. `R/resolution-stage.json`, `incoming-files.txt`, `preflight.json`에 대상과 시작 상태를 보존했다.

## 실패와 최소 수정

### 품목 검사 계약

관리자 최초 실행은 55파일 중 2파일·3조건이 실패했다. 저장 함수가 Promise로 실패를 전달하는데 기존 코드 미리보기 검사는 이를 기다리지 않았고, 품목명이 빈 fixture로 제출 버튼 활성화를 기대했다.

테스트 두 파일에서 실패 Promise를 확인하고 코드 미리보기 준비 후 제출하도록 맞췄다. 버튼 활성화 조건은 이름을 채운 fixture로 확인한다. 코드·409·초안·초기 수량 단언은 유지했고 제품 동작을 되돌리지 않았다. 해당 6조건만 재실행해 통과했다. 최초 실패도 보존했다.

### BOM 로딩 화면의 결합 회귀

후보에는 `구성 저장·변경 취소` 줄이 있으나 main 진입 스켈레톤에는 그 자리가 없었다. 읽기 완료 후 툴바가 생기면서 검색칸이 47.5px 밀렸고, 기존 1px 기준으로 1914px·1280px 검사가 실패했다.

편집 모드의 진입·실제 화면에 동일한 툴바 높이를 예약했다. 부모가 없거나 완료 상태여도 자리는 유지하고, 사용처 모드는 만들지 않는다. 저장·충돌·취소 로직과 검사 허용 오차는 바꾸지 않았다. 직접 회귀 35조건과 실패·미실행 브라우저 6조건이 재시도 없이 통과했다.

## 검증

| 검사 | 결과와 범위 | 정확한 근거 |
|---|---|---|
| 취소·예약 backend | 관련 26조건 통과. 위치·결재/출하 예약 보존 포함 | `R/backend-tests.log` |
| 관리자·BOM·조회 캐시 | 최초 476통과·3실패 → 실패 파일 6조건 통과. 툴바 후속 2파일·35조건 통과 | `R/admin-tests-01.log`, `admin-tests-02.log`, `bom-layout-tests.log` |
| 직접 소비자 | 내역·입출고·전수조사·주변 UI 13파일·213조건 통과 | `R/consumer-tests-01.log` |
| TypeScript | 최종 소스 `tsc --noEmit --incremental false` 통과 | `R/typecheck-final.log` |
| ESLint | 변경 소스·검사 116파일 통과, 툴바 후속 4파일 통과 | `R/eslint.log`, `eslint-files.json`, `eslint-layout.log` |
| 브라우저 | 최초 품목 로딩·직원/부서 선택 2조건 통과. BOM 로딩 실패 후 중단. 수정 후 두 폭·모델 저장 실패·PIN 순회·BOM 일괄 저장·두 탭/완료 잠금 6조건 통과 | `L/e2e-01.log`, `e2e-results/`, `R/e2e-measure.log`, `e2e-final.log`, `L/e2e-final-results/` |
| 가상 목록의 끝행 | 1,050개 모집단의 KPI·전체 행 수·80개 미만 DOM과 End 키의 끝행 접근을 함께 유지, 해당 파일 19조건 통과 | `R/virtual-population-tests-02.log` |
| production | 최종 빌드 성공. 3,483,560바이트(3.322MiB), 사용자 승인 3.35MiB 기본 게이트 및 도구 3검사 통과 | `L/build-final.log`, `bundle-final.log`, `bundle-tool-final.log` |
| staged smart | PlanOnly 확인. testmon 캐시 부재·의존성 경로로 전체 승격했으나 API/스키마/공통 검사 설정 변경이 없어 직접 검사로 한정 | `R/smart-plan.log` |

최초 한도 초과와 `bundle-measure-final.log`의 측정용 `--max 999` 결과도 보존했다. 통과 근거는 승인 후 기본 옵션으로 실행한 `bundle-final.log`다. 제품 입력 1,181개가 최종 Linux 빌드 소스와 일치한다(`R/build-inputs-final.json`).

기대값 연결 8개와 변경된 공통 테스트 정의의 해시·선택자·선언 위치를 갱신하고 이전 연결을 보존했다. 가상 목록의 행 수는 전체 DOM 마운트 대신 논리 행 수로 확인하되 끝행 단언도 유지했다. 재생성 검증은 `R/ledger-refresh-02.log`, 최종 구조 확인은 `ledger-check-final.log`, 변경 명세는 `binding-refresh.json`이다. 실행 상태와 과거 실행 이력의 변경은 0이다.

기존 전체 CI·production 메모·재고 업무 검증은 당시 코드의 근거로 보존한다. 이번 결합판의 전체 기대값 PASS로 자동 변환하지 않는다. 전체 backend·전체 E2E·커버리지·성능·복구는 반복하지 않았다.

## 보호·재현

기존 검토용 3038/8038·BOM 초안·연구 요청은 검사에 사용하지 않는다. 현재 `.next-prod`를 덮어쓰지 않도록 별도 Linux 소스에서 빌드했다. Node 20.20.2와 기존 Linux 의존성을 재사용하고, lockfile에 새로 들어온 순수 JS 의존성 두 개만 일치하는 버전으로 추가했다.

업무 검사는 L의 새 합성 DB와 3100/8021만 사용했다. `backend/mes.db`와 환경 파일을 내보내지 않았다. 기존 개발·직원 DB를 초기화하거나 마이그레이션하지 않았다. 시드·요청·정리는 합성 사본에만 적용했다. 실제 직원 정보가 있는 과거 원문과 이번 화면·trace는 ignored runtime에만 보관한다.

보호 DB/session 해시·main ref·C:/ERP 변경 목록과 검토 서버 PID(3038:32400,8038:32304)는 시작과 일치한다. 소유 Linux QA 포트 3100/8021은 해제됐다(`R/postflight.json`, `review-ports-final.json`, `qa-ports-final.json`).

이 문서는 push 전 로컬 검증 완료 지점이다. 후보만 정상 push한 뒤 정확한 새 HEAD의 CI 링크와 시작 상태를 보고하고 전체 완료는 기다리지 않는다. 실제 원격 반영·CI 결과는 `R/git-final.json`과 이 대화의 최종 보고에 연결한다.

## 2026-10-21 CI39550477694 후속

[기준 CI](https://github.com/Hw-03/ERP/actions/runs/39550477694)는 후보`024f68978ede672fab2788d87eac1d8e66766d30`에서 종료했다. 일반 E2E는300통과·14실패, 나머지7job은 성공했다. 이후 main을 추가로 결합하지 않았다. 이번 근거는 `C=R/ci-39550477694`, Linux 대응 자료는 `L/ci-39550477694`다.

| 실패와 직원 영향 | 확인한 원인·최소 수정 | 직접 결과와 근거 |
|---|---|---|
| 품목·모델8건: 자동 검사가 이전 상세까지 선택 | 상세 전환용 snapshot에도 같은 placeholder·코드가 남아 있었다. 테스트만 live `[data-admin-detail-content]` 안에서 이름·수량·코드를 선택한다. 저장값·미리보기·409·재고 단언은 유지한다. | 관리자 실패13건 중8건. `C/general-failed.log`, `artifact/`, `admin-failed-01.log` |
| 권한3건: 옛 입력 위젯을 찾음 | 실제 권한 UI는 radiogroup의 정·부·없음/승인이다. 옛 combobox·checkbox 선택을 맞추고 재진입 시 창고·부서·AS 역할을 모두 확인한다. 직접403·회수·예약·1회 승인 단언은 유지한다. 결재 권한 제품 로직 변경은 없다. | 같은13건 중3건. `admin-expectations.spec.ts`, `admin-ui-lifecycle-expectations.spec.ts`, `C/admin-failed-01.log` |
| 직원 버튼 좌표2건: 비활성 직원을 선택한 상태 | 원 CI snapshot의 첫 직원은 비활성이었다. `직원 활성화`도 정상 버튼인데 옛 테스트는 비활성화 문구만 찾았다. 양쪽 이름을 허용하고 실제 선택 표시 및1px 좌표 단언은 유지한다. | 같은13건 중2건. `C/artifact/data/c7200ddb56b2eba87d8953601ff2e199cf81b9ae.md`, `admin-failed-01.log` |
| 관리자 로딩1건: 실제 접근성 상태 누락 | `display:contents` 요소의 자식이 모두 aria-hidden이라 Chromium 접근성 트리에서 status가 사라졌다. DOM에는1개인데 role 선택은0개, 실제 flex 요소에 role을 주면1개인 대조를 확인했다. 페이드 ref와 contents 외곽은 유지하고 로딩 role·label·busy만 실제 flex 요소로 이동했다. 화면 읽기 도구의 로딩 안내에 영향을 주던 제품 문제다. | `C/loading-role-probe.log`, `probe-loading-role.cjs`, `scoped-green.log`의admin조건. 조회 API·데이터·권한·재고 변경 없음 |
| 위 실패 후 테스트 정리의 추가 오류 | 보류한 응답을 풀자마자 route를 제거해 `Route is already handled`가 발생했다. 응답 완료를 기다린 뒤 해당 handler만 제거한다. 오류를 무시하거나 재시도를 추가하지 않았다. | 새 회귀를 기존 helper에서 RED→수정 후 GREEN. `C/cleanup-red.log`, `scoped-green.log` 첫 조건. 이는 테스트 정리 문제이며 과거 AS 연결 사건과 묶지 않는다. |

### 이번 신규 검사와 재사용 범위

코드 위치: snapshot에서 live 표식을 제거하는 경계는 `frontend/app/mes/_components/_admin_sections/_admin_primitives/AdminDetailViewport.tsx:22`, 권한 UI는 `_employee_parts/EmployeeDetailGrid.tsx:117`, 로딩 상태는 `_admin_primitives/AdminReadState.tsx:41`, 응답 정리는 `frontend/tests/e2e/capacity-readstates.spec.ts:41`이다. 뒤의 두 상대 경로는 같은 `_admin_sections` 아래다.

- 관리자 실패13건: Linux worker1·재시도0으로13통과(`C/admin-failed-01.log`). 준비·정리는 별도 합성 DB에서만 수행했다.
- 응답 정리와6화면 로딩·첫 오류·재시도·빈값·검색0, 일보:8통과(`C/scoped-green.log`). 첫 실행의 실패·정리 원문도 보존했다.
- 로딩 표시의 두 화면 폭과 품목·직원/부서·BOM 좌표:6통과(`C/loading-green-02.log`). 앞선 준비 시도는 TIME_WAIT 때문에 bind 가드에서 중단됐고 업무 실행이 없었다(`loading-green.log`). Linux listener가 없음을 확인하고 로컬 준비 소켓만 SO_REUSEADDR로 TIME_WAIT를 구분했다. 제품 포트·timeout은 변경하지 않았다.
- AdminReadBoundary와 직접 직원·부서 소비자:3파일33통과(`C/read-state-tests.log`). 변경파일 ESLint는 `eslint-01.log` 및 helper 후속 `eslint-final.log`에 보존했다.
- 최종 production 빌드의 TypeScript 검사와 번들 도구3검사 통과. 3,483,615바이트(3.322MiB), 승인3.35MiB 기본 한도 통과(`C/final-build.log`). 사용자 검토 `.next-prod`와3038/8038은 덮어쓰지 않았다. `C/final-product-inputs.json`은 Windows와 Linux 제품 입력 대조다.
- 변경된9개 E2E 파일의 연결243개만 소스 해시·선언 위치·변경된 단언에 맞췄다. 기존 연결을 historicalBindings에 보존하고 execution·historicalExecutions는 그대로 유지한다. `C/assertions-before.json`, `binding-refresh.json`, `binding-refresh.log`. 새 테스트 연결을 전체 기대값의 현재 PASS로 바꾸지 않았다.
- 문서 smart 게이트의 공백·유지 링크 검사 통과. 도구 단위14통과·Windows symlink 생성 권한이 필요한1건SKIP이며, 이를 실행 통과로 세지 않는다(`C/docs-verify.log`). 해당 도구 구현은 이번에 변경하지 않았다.
- 기존 CI의7개 성공 job과 당시300개 일반 E2E 통과는 해당 코드·실행의 근거로 유지한다. 이번에 전체 backend·전체 E2E·커버리지·성능·복구·기대값 업무 실행을 반복하지 않았다. 일부 일반 조건 통과를 새 후보 전체 CI 성공으로 확대하지 않는다.

구현은 관리자 테스트`d84a9a82`, 로딩·정리`7be6e3a4`로 분리했다. 각 staged smart PlanOnly는 연결 JSON을unknown 경로로 전체 승격했으나, 검증 선택/공통 설정·API·DB 변경이 없고 직접 소비자와 입력이 특정돼 국소 검사 근거를 사용했다(`C/smart-admin-aligned.log`, `smart-loading.log`). 관리자 단계의 중간 원장은 그 커밋의 테스트 소스로 별도 검증했다(`intermediate-bindings.log`). 최초 smart 요청은 부분 stage/working 메타데이터 차이를 거부했으며, 해당 두 문서만 중간 값에 맞춰 PlanOnly를 확인한 뒤 최종 작업 내용을 복원했다. 이 과정에서 업무 검사를 다시 실행하지 않았다.

### 보호 확인의 제한

main ref는`57767831` 그대로다. 직원 서비스·DB·배포·예약을 조작하지 않았고, 테스트는 별도 Linux3100/8021의 합성 DB만 사용했다. 사용자 검토 서버3038/8038의 PID32400/32304 및 session.json은 기존 값과 같다.

이전 통합 작업의 오래된 preflight와 비교한 검토용 QA DB 해시 가드는 실패했다. QA DB 최종 수정시각은15:59:23 KST이며 온라인 백업 사본의 최근 감사에는 검토 화면의 로그인·메뉴 이동·관리자 PIN 확인이 있다. 누가 실행했는지나 전체 변경 원인은 이번 근거만으로 확정하지 않는다. 이번 CI 후속 시작 시 새 QA 해시를 기록하지 않았으므로 **이번 내내 QA DB 불변이었다는 판정도 하지 않는다**. 원형을 복원하거나 감사 행을 삭제하지 않았다. 이 대상은 직원 DB가 아니라 기존 검토용 QA DB다. 원형·상세 원문은 ignored `C/protection-audit.json`, `review-qa-readonly.db`에 보존한다. 과거 `R/postflight.json`을 이번 보호 성공 근거로 재사용하지 않는다.

### 최종 반영 범위

관리자 테스트 계약, 로딩 접근성·테스트 응답 정리, 검증 기록을 분리해 후보에만 커밋·정상 push한다. 새 HEAD의 CI 링크·시작 상태는 `C/git-final.json`과 최종 응답에 남긴다. 새 CI 전체 종료는 이번 로컬 통과와 별도로 판단하며 main·직원 환경은 미반영이다.
