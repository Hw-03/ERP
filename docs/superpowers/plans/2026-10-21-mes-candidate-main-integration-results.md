# 2026-10-21 최신 main → 후보 결합 결과

## 현재 상태

최신 main을 후보에만 결합해 국소 검증을 마쳤다. 사용자 승인 3.35MiB 번들 검사도 통과했다. 최종 기록·커밋·푸시를 진행하며 main 반영·직원 배포·예약 변경은 수행하지 않는다. 과거 BOM·AS·출하 메모의 간헐 사건을 해결로 승격하지 않는다.

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
