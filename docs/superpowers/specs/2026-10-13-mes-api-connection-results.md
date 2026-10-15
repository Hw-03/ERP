# DEXCOWIN MES API 연결 단절 국소 수정 결과

2026-10-13 국소 검증 실행 기록. 작업 브랜치 `codex/mes-expectation-closure`, 시작 HEAD `9a5c77977505282856246712c30bd2f833707346`. 해당 검증 단계에서는 커밋·푸시·main 반영·직원 배포를 제외했다. 이후 이번 변경의 작업 브랜치 커밋·푸시만 별도로 승인됐다. 후속 저장 범위는 문서 마지막 절을 따른다.

## 판정

대상 E2E의 Node API 클라이언트가 서버에서 자연 만료된 유휴 연결을 재사용하면서 `ECONNRESET`을 받는 기전을 PUT과 GET에서 각각 재현했다. 대상 테스트를 별도 worker에서 실행하고 보조 API 및 `route.fetch` 연결을 응답 후 닫도록 수정했다. 업무 화면의 브라우저 요청과 제품의 서버·프록시·DB·재고 계산은 변경하지 않았다.

현재 원형 테스트의 제어된 재현으로 입증한 결론이다. 과거 실패 trace에는 소켓 식별 정보가 없으므로 **모든 과거 단절의 특정 소켓 원인이 같았다고 확정하지 않는다.** 기존 불량 자동부서 검사는 같은 Node API 전송 경로를 사용한다는 코드 확인과 수정 후 국소 통과를 확보했으며, 그 역사 실패 자체의 소켓 인과를 새로 확보한 것은 아니다.

## 환경과 격리

- Node 20.20.2, Playwright 1.60.0, Next 16.3.4, Python 3.12, Uvicorn 0.29를 유지했다. 패키지·lockfile·운영 timeout 변경 없음.
- 로컬 원문 위치: `_attic/runtime/api-disconnect-root-20261013-001/`. 이하 실행 ID와 경로는 이 디렉터리 기준이다. 원본 소스·버전·파일 해시는 `environment-before.json`, 수정판은 `fixed-before.json`에 있다.
- 합성 QA 사본 `qa`와 `qa-fixed`의 `backend/mes_e2e.db`만 사용했다. 원본 DB·비밀 환경 파일은 복사하지 않았다. 전용 프론트/백엔드 포트는 3057/8057이며 각 실행 전에 점유와 소유권을 확인했다.
- QA 설정의 기존 포트와 소유 프로세스 종료는 로컬 어댑터로 바꿨다. 소스 파일 자체는 manifest와 실행 전후 대조했다. 각 실행의 종료 영수증·DB 사본·실패 trace·로그를 별도 폴더에 보존했다.
- 시작 보호 DB 해시: `08fd9b8025375a5e61cbdacb0c65ad8acede6423b27eef09abd0634c1a458f0a` (`backend/mes.db`, 작업 워크트리).

## 원인과 대조 근거

설치된 Playwright의 HTTP agent는 API context 간에 공유된다(`frontend/node_modules/playwright-core/lib/coreBundle.js:7945`, `:25944`). context를 새로 만드는 것만으로 유휴 연결이 분리되지 않는다. Node의 agent는 새 요청의 `Connection: close`를 검사하기 전에 기존 free socket을 선택할 수 있으므로, 헤더만 추가하고 일반 테스트와 같은 worker를 공유하는 방법도 충분하지 않다. 이 판단은 설치 런타임에서 추출한 `_http_agent.js:253`과 `:153`, 실제 worker PID·TCP 소켓 검사를 함께 사용했다.

Next의 관측된 keep-alive 설정은 5초였고, 해당 Node 런타임은 내부 1초 버퍼를 더해 약 6초 뒤 유휴 연결을 종료했다(`_http_server.js:1003`). 처음에 가정했던 6,125ms를 그대로 성공 조건으로 사용하지 않았다. 클라이언트·서버의 양쪽 주소/포트와 소켓 ID로 같은 연결을 연결하고 실제 timeout 시각을 확인했다.

DB 없는 설치 버전 재현(`fixture-boundary-01`)에서는 실제 유휴 간격 5,999.2923ms의 PUT이 같은 소켓을 사용했고 요청 시작 0.8575ms 뒤 서버 timeout, 2.508ms 뒤 단절을 기록했다. 비동기 자식 정리로 바꾼 대조(`fixture-async-boundary-01`)도 6,006.4151ms 경계에서 실패했다. **동기 Python 정리만의 문제라는 가설은 채택하지 않았고 정리 hook도 그대로 보존했다.** 6,125ms 이후 새 소켓을 사용한 통과 및 경계 시점을 놓친 실행은 원인 해결 근거에서 제외했다.

실제 업무 E2E에서는 진단용 dispatch gate로 클라이언트의 전송 시점만 통제했다. gate는 연결을 강제로 닫지 않고, 실제 서버 timeout·요청 내용·업무 단언을 유지한다. 이 인위적 스케줄링을 과거 실행에서 같은 지연이 실제 발생했다는 증거로 확대하지 않는다.

| 실행 ID | 실제 대상 | 마지막 API 응답 후 간격 | 연결 기록 | 결과 |
|---|---|---:|---|---|
| `history-dispatch-boundary-red` | HISTORY03 종료 후 직원 정리 PUT | 6,103.9315ms | free socket 1개 재사용, 서버가 요청 105.3895ms 전 timeout | `ECONNRESET`, 예상한 RED |
| `defect-dispatch-boundary-red-02` | 불량 창고 검사의 병렬 위치 재고 GET | 6,107.4270ms | free socket 1개 재사용, 서버가 요청 107.1468ms 전 timeout | `ECONNRESET`, 예상한 RED |
| `fixed-targets-01` | 수정판의 직원 정리 PUT | 6,445.5925ms | free socket 0개, 새 연결 | HTTP 200 |
| `fixed-targets-02` | 수정판의 같은 위치 재고 GET | 6,106.8050ms | free socket 0개, 새 연결 | HTTP 200 |
| `history-old-behavior-restored` | 기존 연결 방식으로 되돌린 HISTORY03 PUT | 6,103.4608ms | free socket 1개 재사용, 서버가 요청 108.0392ms 전 timeout | `ECONNRESET`, 재실패 |

수정판 PUT의 간격은 원판과 정확히 같지 않으므로 동일 밀리초 A/B로 주장하지 않는다. GET은 같은 원형 흐름과 같은 gate에서 약 0.622ms 차이로 비교했다. 수정의 불변 조건은 유휴 연결이 풀에 남지 않는 것이며 별도 회귀 검사로 이를 확인했다. 수정 전후 실제 API 경로는 계속 Next를 통과했다. 백엔드 직접 조회로 우회하지 않았다.

소켓 인과 요약은 `causality-summary.json`이다. 원인 판정에 사용한 클라이언트 기록은 연속 seq·정상 exit·dropped 0을 확인했다. Next 기록은 해당 실패 이후까지 seq 누락 없이 남아 있다. QA 종료 때 프로세스를 종료하므로 Next의 전체 수명 종료 레코드까지 완전하다고 주장하지 않는다. 기동 readiness의 `ECONNREFUSED`, 브라우저 화면 취소에 따른 프록시 오류와 API 클라이언트의 예기치 않은 단절은 구분했다. 본문·PIN·쿠키를 수집하지 않았고 이벤트를 버퍼링해 기록했다.

## 변경 범위와 회귀 방지

- `frontend/tests/e2e/_isolated-api-expectations.ts:5`: 일반 keep-alive 테스트와 worker를 분리하고 Node 보조 API에만 `Connection: close` 적용. 기존 설정·헤더 상속과 context dispose를 유지한다.
- `frontend/tests/e2e/_isolated-api-expectations.ts:18`: 인터셉트한 `route.fetch`도 같은 정책을 사용하되 원래 요청 헤더와 응답을 유지한다.
- `history-expectations.spec.ts`, `defect-additional-expectations.spec.ts`, `defect-auto-department.spec.ts`의 fixture import와 HISTORY03의 fetch 호출만 교체했다. 정리 경로/대상 제한·Python 종료 코드·트랜잭션·요청 횟수·UI 제출과 위치/수량/이력 단언은 보존했다.
- `frontend/tests/api-connection-lifecycle.test.mjs:15`: DB 없이 실제 Playwright worker 분리, 소켓 비재사용, GET/PUT/병렬 조회/보류된 route 응답, 헤더 상속, 브라우저 keep-alive 유지, 오류 전파와 요청 1회를 확인한다. 여기의 의도적 `/abort`는 오류 전파 검사이며 원인 재현으로 사용하지 않는다.
- `.github/workflows/ci.yml:390`: 기존 Chromium 설치 후 general E2E job에서 새 회귀 검사를 한 번 실행하도록 연결했다. 기존 전체 CI 검사를 줄이지 않았다. 이번에는 CI를 실행하지 않았다.

직원 화면에 배포되는 제품 동작의 변경은 없다. 새 TCP 연결 비용은 위 E2E 보조 API에만 추가된다. 브라우저 자체의 연결 재사용은 유지하며 정상 화면 취소를 실패로 바꾸거나 제품에서 오류를 재시도하도록 만들지 않았다.

## 실행 검증

| 검사 | 실제 결과 | 근거 |
|---|---|---|
| 새 연결 회귀 검사 | 기존 fixture에서 RED 후 최종 수정판 10회 연속 PASS, 첫 실패 중단 설정·재시도 0 | `regression-ten/receipt.json`, 각 stdout/stderr 및 `_attic/runtime/api-connection-test-*` |
| HISTORY03·불량 오류 창고/부서·자동부서 | 네 실행 사례 각각 3회 PASS, 재시도 0 | `fixed-targets-01`, `fixed-targets-02`, `fixed-targets-03-uninstrumented` |
| 같은 내역 파일의 주변 검사 | 나머지 5개 한 번씩 PASS | 마지막 실행은 총 9 PASS·0 FAIL·0 SKIP·0 flaky, 진단 계측/gate 없음 |
| ESLint | 변경된 E2E 3개·새 fixture·새 Node 검사 PASS | 해당 파일만 지정, 최초 fixture 인자 이름의 hook 오탐 수정 후 종료 코드 0 |
| 타입 검사 | 새 fixture와 직접 import 범위 PASS | `tsconfig.transport.json`, `tsc --noEmit`, 종료 코드 0 |
| CI 설정 계약 | 새 step의 general 조건·명령·기존 E2E 명령 보존 PASS | `check-ci.py`, 종료 코드 0 |

실행 명령은 각 `receipt.json.argv`에 기록했다. 재발 방지 검사 단독 실행은 Node 20으로 `frontend`에서 `node --test tests/api-connection-lifecycle.test.mjs`를 사용한다. 실제 업무 검사는 기존 격리 환경에서 세 대상 파일과 `--grep 'HISTORY03|DEFECT-SCRAP-ERRORS|8\.5-02' --workers=1 --retries=0 --max-failures=1`로 실행한다. 주변 내역을 포함할 때만 `HISTORY03` 대신 `HISTORY`를 지정한다. 이번 진단에 사용한 로컬 `run-qa.cjs`는 새 실행 ID·고정 manifest·포트 소유권을 요구한다.

이번 실행의 테스트 재시도는 0이다. 설치된 API 전송의 `maxRetries` 기본값도 0(`coreBundle.js:25902`)이며 인터셉트 fetch에는 0을 명시했다. 이는 [Playwright 공식 API 문서](https://playwright.dev/docs/api/class-apirequestcontext#api-request-context-fetch-option-max-retries)의 계약과 일치한다. timeout 확대·수정 코드의 sleep·단언 삭제·라이브러리 업데이트는 하지 않았다.

## 기대값 원장과 종료 상태

과거 전체 통과는 당시 소스의 역사 근거로 유지한다. 변경된 E2E 3개 파일의 binding 해시와 선언 위치만 갱신하고 이전 binding도 보존했다. 소스 스냅샷 비교에서 무효화된 현재 실행 615조건은 역사 실행으로 옮겨 `NOT_RUN`으로 표시했고, 영향 없는 443조건의 유효 근거는 유지했다. 이 숫자는 `ledger-transition.json`에 기록한 이번 전환의 역사적 집계다. 이후 현재 분모·상태는 원장에서 계산한다.

최초 정규화는 import 추가로 이동한 선언 위치를 탐지해 거부했다. 해당 156개 연결 위치를 실제 선언에서 다시 계산했으며 과거 연결은 수정하지 않았다. 최종 `normalize-mes-expectations.mjs`는 실제 종료 코드 0으로 완료했다(`normalize-final.log`). 이후 생성 원장과 정본 입력의 바이트 일치 및 원본 기대/피드백 해시 보존도 확인했다(`normalization-receipt.json`). 이번 국소 통과를 전체 기대값 PASS로 승격하지 않고, 전체 백엔드/E2E/coverage/성능/복구/빌드를 반복하지 않았다.

종료 점검과 커밋 전 재확인(`environment-after.json`, 최신 확인 2026-10-13 15:12:15 KST)에서 QA 3057/8057 포트 점유와 남은 QA 프로세스가 없고, 작업본 보호 DB 해시·HEAD·브랜치·빈 Git 인덱스가 시작 때와 같음을 확인했다. 최종 검증 소스와 새 회귀 검사 10회 실행의 소스 해시도 같다. 읽기 전용 독립 리뷰에서 완료를 막는 지적은 없었다. 검증 종료 당시 결과 상태는 **대상 E2E의 재현 기전 수정·국소 검증 완료, 변경은 미커밋, main 미반영·직원 환경 미적용**이었다.

남은 한계는 과거 실패의 특정 소켓 귀속 정보 부재와 현재 소스 전체 기대값의 미재실행이다. 전자는 원문을 보존하고 현재 재현 기전과 구분하며, 후자는 사용자가 승인한 국소 검증 범위를 유지한다.

## 후속 커밋·푸시 승인 — 2026-10-13

사용자가 이번 변경만 기능별로 나눠 작업 브랜치에 커밋·푸시하도록 승인했다. 저장 단위는 연결 정책 수정(`a4f6a90c`), 새 회귀 검사와 CI 연결(`49b9ea2c`), 기대값 상태·계획·결과·활성 TODO 문서의 세 가지다. 실제 최종 문서 커밋 해시·푸시 성공·CI 링크는 Git 실행 결과와 최종 보고로 확인한다. main 반영·직원 배포는 승인 범위에 포함되지 않으며 전체 CI 완료를 기다리지 않는다.

커밋 전 소스/회귀 검사 해시·기존 실행 영수증·원장 정본 일치·원본 기대/피드백 해시를 다시 확인해 기존 통과 근거를 재사용했다. 각 커밋의 staged 목록과 diff 검사 및 smart 계획을 확인했다. CI 파일의 경로 기반 전체 검사 승격은 기존 업무 코드를 바꾸지 않는 전용 회귀 step 추가에 비해 과도하므로, 새 검사 10회와 실제 E2E 흐름·정적/타입 검사 근거 및 재확인한 CI 설정 계약으로 위험을 검증했다. 전체 백엔드·프론트·빌드를 다시 실행하지 않았고 GitHub의 기존 전체 CI 검사는 그대로 유지했다.
