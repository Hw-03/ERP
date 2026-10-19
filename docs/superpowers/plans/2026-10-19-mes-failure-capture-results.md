# BOM·AS 실패 순간 보존 — 실행 기록

**현재 판단: 두 원인은 미확정이며 병합 보류다.** 승인된 일반 E2E 관측 1회는 첫 실패에서 종료했다. 32건 통과 뒤 선행 `STATE01 defect`가 실패해, 원 BOM·AS를 포함한 나머지 268건은 미실행이다. 관측 도구와 정리 전 보존은 통과했지만 제품 원인 해결·수정·회귀 검증의 완료 조건은 충족하지 않았다.

## 2026-10-19 13:42 KST — 진행 불가 판정과 재개 조건

마지막 새 근거인 입력 노드 동일성 감사 뒤 세 차례 후속 점검에서 같은 증거 공백을 확인했다. 후보 HEAD63d4ed59·미커밋 범위가 그대로이고 진단CI39195321428은 종료된 실패이며, 이후 진단도 skipped/일반CI cancelled로 종료됐다. 새 실패 자료와 진행 중인 진단은 없다. 이 상태 확인은 새 원인 근거나 검증 통과가 아니다.

**두 원인의 해결 목표는 미완료이며 진행 불가로 남긴다.** BOM의 실제 입력·React 상태·writer 순서와 AS 원 read/-104 요청의 소켓·종료 주체 기록이 각각 부족하다. 따라서 원인에 따른 수정, 수정 전후·되돌림 대조, 새 회귀10회·원 선택자3회도 완료하지 않았다. CP0/1/2와 기록 작업의 완료를 이 요구의 완료로 대체하지 않는다.

재개 조건은 준비된 관측 기록을 포함한 새 원 실패 또는 아직 시도하지 않은 구체적인 판별 조건에 대한 실행 승인이다. 동일한 일반 묶음·정상 선택자 반복, 인위적 상태 변경·RST, 추측 패치로 이 공백을 메우지 않는다. 원문과 도구는 보존한다. 감사 원문은 `W/_attic/runtime/flaky-capture-20261019/no-progress-audit-*.json`이며 마지막 기록에 요구별 미충족과 연속 확인을 적었다. 이번 후속 점검에서 제품 코드·DB·서버 변경, 새 검사·커밋·푸시는 없다. main·직원 환경 미변경, 검토3038/8038은 PID46916/10744로 유지됐다.

## 2026-10-19 13:38 KST — 입력 노드 교체 가설의 읽기 감사

새 시험은 실행하지 않았다. 값 setter 관측이 놓칠 수 있는 “기존 입력칸 제거 → 기본값 1인 새 입력칸 생성”을 원 실패 trace와 실제 렌더링 경로로 확인했다.

- 원 VAR의 `1-trace.trace:325/332`, GEN의 `:312/324`에서 동일 frame의 input/after snapshot 번호는 각각 36/37이다. after의 전체 HTML은 `[[1,20]]`으로 직전 input snapshot의 HTML 루트(postorder20)를 재사용한다. 그 안의 대상 INPUT은 postorder0이며 `__playwright_target__`가 해당 fill 호출을 가리킨다. 아래 13:30절의 원 zip을 그대로 읽었다.
- 설치된 Playwright 1.60의 `frontend/node_modules/playwright-core/lib/coreBundle.js:14730–14738,15007–15013,15032–15039`는 DOM 객체별 cache와 실제 자식 객체 참조가 같을 때 이 참조를 사용한다. `:16456–16469,25424–25434`에 따라 input snapshot은 실제 fill 주입 전에 수집된다. 따라서 **이 두 snapshot 사이에 대상이 새 DOM 입력으로 교체됐다는 설명은 보존된 노드 동일성과 맞지 않는다.** 같은 노드를 잠시 떼었다 다시 붙였는지, before→input 구간, 중간 값·이벤트·상태 변화는 이 자료로 확정하지 않는다.
- 실제 화면도 `DesktopShippingView.tsx:3151–3152,3925,3984,4006–4014`의 모듈 수준 BomEditor·고정 위치·`line.key`와 `common/QuantityInput.tsx:10–18`의 고정 input을 사용한다. `lib/shipping/request-draft.ts:97–103`의 정렬은 줄 객체와 key를 바꾸지 않는다. 품목 갱신 자체가 새 입력을 만드는 경로는 이 범위에서 확인되지 않았다. 상위 강제 새로고침은 `DesktopMesShell.tsx:293,476,604`의 별도 사용자 동작이다.
- 이미 통과한 before-fill/focus 기록도 각각 같은 `uid=5`가 focus→input→blur에서 연결된 채 유지되고, input capture의 DOM2/tracker1/React1이 bubble에서 모두2가 된다. 이 정상 자료를 원 실패의 원인으로 확대하지 않는다.
- 원문 경로·파일 해시·snapshot 참조·정상 기록의 최소 추출: `W/_attic/runtime/flaky-capture-20261019/catalog-response-boundary/remount-readonly-audit.json`. 제품·관측 도구·DB·서버 변경과 새 검사 실행은 없다. 상세 결과·첫 비교표·활성 TODO·인계를 함께 갱신했다.

**판정:** BOM 원인 후보를 하나 줄인 읽기 근거이며 해결 근거가 아니다. AS에는 새 연결 자료가 없다. 두 원인·직원 영향은 미확정, CP3와 병합 판단은 보류다. 다음 실행을 정당화할 새 실패 경계나 구체적인 추가 단서가 없으므로 같은 정상 검사·전체 묶음·임의 부하를 반복하지 않는다.

## 2026-10-19 13:30 KST — 새 단서에 따른 BOM 응답 순서 국소 대조

**추가 결과:** 과거 두 수량 실패에서 늦은 품목 응답과 `fill` 실행 구간이 겹친 공통점을 찾았다. 이를 근거로 새로운 단일 변수 대조를 했다. 입력 전 응답 전달은 정상으로 끝났고, 포커스 시점 방출은 실제 JSON 완료가 입력 이벤트 종료보다 9.9ms 늦어 목표 구간을 맞추지 못했다. 이 결과로 원인을 확정하거나 제품을 수정하지 않았다. 원 일반 묶음·AS 선택자는 재실행하지 않았다.

### 무엇을 왜 확인했나

원 실패는 수량 2 또는 3을 입력한 뒤 1이 사용된 사건이다. 과거 trace를 다시 읽어, 각각 두 번째 `GET /api/items?limit=2000` 완료가 Playwright의 `fill` 시작 후 19.520ms·38.129ms에 있었다는 점을 확인했다. 첫 번째와 두 번째 응답의 원문 resource도 각 실행 안에서는 같았다. **이는 API 호출 구간의 겹침이며 native 입력 이벤트·React 상태 갱신 중간에 응답이 처리됐다는 증거는 아니다.** 성공한 retry에는 해당 trace가 없어 동일 비교를 할 수 없다. 별도 메모 유실 사건을 같은 원인으로 합치지 않았다.

| 원 실패 | 원문 위치와 범위 | 관측 시간(ms, 각 trace monotonic) |
|---|---|---|
| VAR, eddd0811 | `W/_attic/runtime/comparison-checks/ci-eddd0811-playwright-general/data/c8fb127e051e30527321dd0226f083751ef1d267.zip`, `1-trace.network:184,187`, `1-trace.trace:311,331` | 두 번째 조회 2912179.439→2912375.520, fill2 2912356.000→2912523.343 |
| GEN, 782eb344 | `W/_attic/runtime/comparison-checks/ci-782eb344-playwright-general/data/6b0f331a9d0677fb1dcf6bd1f98dba28638ef962.zip`, `1-trace.network:185,189`, `1-trace.trace:302,322` | 두 번째 조회 2745196.986→2745382.596, fill3 2745344.467→2745517.200 |

### 환경·실행 순서와 대조 결과

- 후보 HEAD `63d4ed59acf223e6cad62b3a360d905825d92021`의 Gitless 사본, Ubuntu26.04/WSL의 동일 호스트에서 Node20.20.2·Python3.11.17·Playwright1.60.0·Chromium1223을 사용했다. 원 GitHub runner 이미지와 동일하다는 주장은 하지 않는다.
- 주소는 `http://localhost:3100`과 `http://127.0.0.1:8021`, DB는 `/home/hw/mes-flaky-capture-20261019/catalog-response-boundary/source/backend/mes_e2e.db`다. 실행마다 합성 DB를 초기화했다. 사용자 검토용 3038/8038·B DB·초안·연구 요청은 사용하지 않았다.
- 기존 `SHIP-VARIANT`의 합성 무권한 요청자 로그인 → 합성 기준 PF 선택 → BOM 구성 조정 → `parts.af` 수량 2 한 번 입력 → 즉시 다음 → 매칭 후보 선택 → 요청 정보·확인 → 저장 → 목록·상세 조회를 유지했다. 고정 실제 품목 코드를 쓰지 않았으며 합성 품목 식별값은 각 trace/DB에 있다.
- shipping의 새 문서·main frame·정확한 query·요청 `networkId` 순서로 두 번째 자연 발생 조회만 보류했다. CDP `continueResponse({requestId})`로 기존 status/header/body를 전달했다. 새 조회·가짜 realtime 이벤트·제품 상태 쓰기·반복 입력은 추가하지 않았다.
- 제품 `frontend/app`, `frontend/lib`, `backend/app` 전체 파일 해시가 사본 준비 전후 동일하다. native setter 관측은 기존 `--native-only`를 재사용했다. React setter를 함수형으로 바꾸거나 추가 렌더를 유발하는 계측은 사용하지 않았다.

| 대조 | 원 업무 검사 | 실제 기록 | 판정 |
|---|---|---|---|
| 입력 전에 보류 응답 전달 | 원 VAR 1건 통과, retry0 | 해당 문서 JSON 완료2097.100 → arm2165.900 → focus2186.000 → input bubble2210.900ms. 수량2·매칭요청2·저장2·기본 BOM 불변 단언 통과 | 입력 전 JSON 완료 조건 성립. 원 실패 해결 근거는 아님 |
| 실제 focus에서 응답 방출 | 원 VAR 1건 통과, retry0 | focus2200.200 → input bubble2220.500 → JSON 완료2230.400ms. 같은 수량·저장 단언 통과 | **조건 미충족.** CDP 방출 시각과 실제 앱 처리 시각이 달라 입력 중간 구간을 맞추지 못함 |
| input bubble 시점 방출 | 미실행 | focus 대조의 조건 미충족을 기록하고 중단 | 정상 결과를 더 쌓으려고 반복하지 않음 |
| AS 원 조회 | 미실행 | 기존 HTTP/Node/Uvicorn 자료 재검토에서 새로운 종료 주체 근거 없음 | 원 AS read/-104 원인 미확정 유지 |

이 검사는 출하 요청과 BOM 저장까지이며 실제 준비·픽업·재고 사용·취소를 하지 않는다. 따라서 위치별 처리 전→후속 사용→취소 수량은 **이번 대조의 적용 대상 밖이며 새로 검증하지 않음**으로 남긴다. 기본 BOM 불변과 저장 수량 단언을 위치 재고 전체 검증으로 확대하지 않는다. main을 재실행하지 않았으므로 이번 원인이 main에도 같다는 새 비교 근거는 없다.

### 보존한 근거와 진단 한계

`W = C:/Users/user/.codex/worktrees/mes-main-candidate-comparison/ERP`, `C = W/_attic/runtime/flaky-capture-20261019/catalog-response-boundary`다. 실제 원문은 모두 ignored 로컬 자료다.

- Windows 보존본 `C/linux-results/ready-03/{before-fill,focus}/`: `report.json`, `catalog-order.json`, `bom-boundary-extracted.json`, `response-body-audit.json`, `after-run.db`, 서버 로그와 `test-results/**/trace.zip`. `C/copied-evidence-hashes.json`으로 복사 자료를 확인한다. Linux 원문은 `/home/hw/mes-flaky-capture-20261019/catalog-response-boundary`에 유지한다.
- `C/linux-results/summary.json`: 제품 소스 불변, 두 실행의 결과·입력 기록, 유실0·incident0. 실제 새 조회 호출자는 첫 조회 `ensureItemsLoaded`, 두 번째 `DesktopShippingView.useEffect`로 포착했다. 현재 소스의 realtime 조회(`DesktopShippingView.tsx:624–638`)와 맞지만 과거 실패의 동일 호출자까지 확정한 것은 아니다.
- 두 실행 모두 종료 시 CDP 본문 조회는 문서 이동 때문에 unavailable이었다. **원 결과 JSON은 수정하지 않았다.** 이미 저장한 trace에서 같은 입력 문서의 유일한 두 GET과 순서를 연결하고 원문 SHA256 동일을 별도 `response-body-audit.json`에 기록했다. before-fill의 누락만 이 읽기 감사로 보완했으며 다시 실행하지 않았다. focus의 순서 미충족은 그대로다.
- native 문서/incident 유실·warnings·destructive incident는 모두 0이다. `catalog.json.done`은 JSON 파싱 완료이며 React commit 완료가 아니다. 응답 방출·browser binding 관측이 timing에 주는 영향도 제거된 것은 아니다. 작고 새로운 합성 자료이므로 과거 전체 DB·worker 수명을 복원한 실험으로 표시하지 않는다.
- 이번 국소 실행의 backend 소유 PID 종료는 영수증으로 확인했고, 프론트는 종료 영수증이 생성되지 않아 진단 포트 해제와 프로세스 부재만 확인했다. 이를 AS의 프로세스 종료 이유를 확보한 근거로 사용하지 않는다.
- 준비 실패도 보존했다. 작은 CDP 검사에서 HTML Content-Type 누락을 고친 뒤 응답·요청1회·native fill 보존 확인. 첫 앱 준비는 외부 node_modules symlink 거부로 중단(`C/linux-results/before-fill`), 다음은 잘못된 시작 앵커로 시험0개 선택(`C/linux-results/ready-02/before-fill`)이었다. 동일 의존성의 내부 사본과 실제 수집1개 확인 후 업무를 시작했으며 이 준비 실패를 제품 실패로 세지 않는다.

**직원 영향·수정 판정:** 이번에 직원 제품 결함이나 자동화만의 결함을 확정하지 못했다. 제품 원인 패치·새 회귀10회·production 재빌드 단계로 진행하지 않았다. AS 완료 문구의 기존 미커밋 변경과도 별개다. main·직원 서버·DB·예약은 변경하지 않았다. 진단 포트3100/8021은 해제됐고, 3038 PID46916/8038 PID10744 및 B DB/session 해시는 이전 보호 기록과 동일하다.

**다음 행동의 한계:** 같은 전체 묶음·같은 정상 선택자를 반복하지 않는다. BOM은 실제 DOM2/3→1 writer stack과 당시 React 값/상태 호출, AS는 원 read/-104 GET의 socket·종료 주체·프로세스 이유가 여전히 필요하다. 새 실패나 그 경계를 겨냥할 추가 근거가 없으면 원인 미확정·병합 보류를 유지한다.

## 2026-10-19 12:52 KST — 이번 실행의 최종 결과

후보 실행 HEAD는 `edd81fa0cbf4b115b74dce53edf25bed6ff1acd5`, [진단 CI39195321428](https://github.com/Hw-03/ERP/actions/runs/39195321428)는 실패로 종료했다. 같은 HEAD의 자동 일반 CI39195321547만 승인 범위에 따라 취소했다. 아래 결과는 이 HEAD·이 입력의 관측이며 새 전체 CI 성공이 아니다. 이후 절의 준비 결과와 “시작 전” 문장은 당시 경과를 보존한 것이다.

| 범위 | 실제 결과 | 판정·직원 업무에 대한 의미 |
|---|---|---|
| 관측 도구 준비 | Linux Python 24건, Node 12건, 실제 React 입력 off/on, assertion/timeout 정리 전 보존, CI 커널 수집 자체 검사 통과 | 도구 확인. 원 BOM·AS 결함의 재현이나 해결이 아님 |
| 원 일반 E2E 순서 1회 | 32건 통과 → 33번째 `STATE01 defect` timeout → 268건 미실행, retry 0·worker 1·repeat 1 | 첫 실패 중단 규칙 준수. BOM/AS 원 선택자에는 도달하지 못함 |
| 첫 실패 후·cleanup 전 보존 | 화면·browser trace·합성 DB online backup 보존 완료, quick_check `ok`, 원본/실행 사본 해시 불변 | 실패 전부터 쌓인 관측 기록과 실패 후 snapshot을 구분함. BOM recorder는 대상 화면이 아니어서 `available:false` |
| 새로 관측한 선행 실패 | 재시도 클릭 전달 전에 추가 GET에 주입된 빈 성공 응답으로 버튼이 사라짐 | 시험의 응답 전환과 재조회가 겹친 경계 확인. 추가 GET의 직접 예약자는 미확정이며 원 두 문제와 같은 원인이라고 볼 수 없음 |
| 연결 종료 관측 | 커널 6,642 events, decode/loss 0. Next의 request error 160건은 모두 destroy 선행·errno/syscall 없는 socketCloseListener 오류 | 실제 close/reset 경로 일부를 구분함. 원 AS의 `read ECONNRESET / -104`는 원 선택자에 도달하기 전까지 관측되지 않음 |
| 원 BOM·AS 해결 | 원인 확정 없음, 제품 패치 없음, 새 회귀 검사 10회·원 선택자 3회 단계 미실행 | 병합 보류 유지. 직원 업무 영향 없음으로 판정할 수 없음 |

### 선행 불량 조회 실패 — 무엇을 확인했고 어디서 멈췄나

1. **목적:** 실제 불량 화면이 최초 로딩, 오류, 사용자의 재시도, 빈 성공, 검색 결과 0을 구별하는지 확인하는 기존 일반 검사다. 이번 계획에서는 원 BOM·AS에 이르는 동일 일반 실행 순서의 선행 조건이었다.
2. **환경·순서:** GitHub Ubuntu 24.04.5, kernel `6.17.0-1022-azure`, Node `20.20.2`, Python `3.11.17`, Playwright `1.60.0`, Chromium revision `1223`. 같은 호스트의 `localhost:3100` → `127.0.0.1:8021`과 합성 DB만 사용했다. `actors.requester` 합성 계정 로그인 → 불량 → 격리 목록 → 조회 보류 → 주입한 503 오류 표시 → 빈 응답 단계 전환 → “다시 시도” 클릭 순서다. 특정 실제 품목·직원은 사용하지 않았다.
3. **수량 대조:** 조회 응답을 주입하는 화면 검사여서 입출고·예약·후속 사용·취소 수량은 적용 대상이 아니다. 이 검사에 대해 재고 전후 불변을 별도로 대조하지 않았으며 수량 PASS로 세지 않는다. 합성 DB는 실패 당시 상태를 보존했다.
4. **실제 결과:** 최초 로딩·오류 표시·버튼 활성화 단언은 통과했다. 원 시험의 `capacity-readstates.spec.ts:85–86`은 응답 상태를 `empty`로 먼저 바꾼 뒤 클릭을 기다린다. 12:41:49.204 KST에 추가 `/api/defects/locations` GET이 발생하고 시험 handler가 200·`[]`를 반환했다. Playwright는 버튼의 안정성을 기다리는 중 DOM 분리를 관측했다. 실제 클릭 전달 없이 이후 버튼을 계속 기다려 기존 60초 제한에 도달했다. 보존 화면은 정상적인 빈 목록 표시다.
5. **차이·판정:** 이번에는 main을 재실행하지 않았다. 따라서 main과 후보의 새 회귀 여부를 비교 완료하지 않았다. `scriptedRead`의 요청 시점 phase 분기(`capacity-readstates.spec.ts:27–29`)와 클릭 전 phase 전환이 겹친 자동화 경계는 확인됐다. `DesktopDefectView.tsx:172–216`의 realtime revision 재조회와 직전 config/models/items/SSE 시간은 일치하지만 실제 revision·effect 원인 기록이 없어 추가 GET의 직접 예약자로 확정하지 않는다. 원 BOM·AS와 같은 원인이라는 증거도 없다.
6. **직원 영향:** 화면이 빈 성공 응답을 받아 오류 버튼을 제거한 사실 자체는 직원 업무 결함의 증거가 아니다. 이 건으로 직원 재고·결재 결함을 선언하거나, 반대로 원 BOM·AS의 직원 영향이 없다고 판단하지 않는다.
7. **정확한 근거:** 아래 로컬 기준 `R/original-general-once/first-failures/1931981560c0ad6c017f-813adbd0069bf3c26cc8/before-cleanup-trace.zip`의 `trace.trace:285,305,320`(통과), `:322–345`(클릭 대기·응답 주입·DOM 분리), `trace.network:185`(추가 GET), 같은 폴더 `before-cleanup.png`, `receipt.json`, `before-cleanup.db`. 소스는 실행 HEAD의 `frontend/tests/e2e/capacity-readstates.spec.ts`다. 계측 사본은 줄이 달라지므로 이 문서의 소스 줄은 후보 원본 기준이다.
8. **미확인 조건:** 추가 GET의 직접 예약자, 관측이 전체 타이밍에 준 영향, 이 선행 검사에 대한 최소 수정·재현 대조, 뒤의 BOM·AS 원 실패 모두 미확인이다. 선행 결함을 원 두 문제로 바꾸어 보고하지 않는다.

실패 보존은 12:42:44.039 KST에 시작해 44.408에 끝났고 그 뒤 cleanup이 시작됐다. `page.unroute`의 닫힌 context 오류는 teardown 뒤 발생한 부수 오류다. 버튼 소실은 약 55초 앞서므로 실패 보존 I/O가 버튼을 없앤 원인이라는 근거는 없다. 지속적인 관측의 timing 영향까지 배제한 것은 아니다.

### 연결 오류 — 같은 ECONNRESET 문자열을 원인으로 합치지 않음

`next-http.jsonl`의 request.error 160건은 모두 같은 요청의 `request.destroy.called` 이후 발생했으며 errno·syscall이 없었다. 첫 frame도 모두 `Socket.socketCloseListener (node:_http_client:477:27)`이다. 원 AS의 `syscall=read`, `errno=-104` 서명은 전체 기록에서 0건이다. 이는 **AS 원 검사가 미실행된 앞 구간의 관측**이며 AS 원인이 사라졌다는 뜻이 아니다.

한 소켓을 끝까지 연결한 사례는 다음과 같다. 각 파일은 `R/original-general-once` 아래에 있다.

| 순서 | 직접 관측 | 원문 |
|---|---|---|
| 요청 | Next PID 3740, request 1973, connection 1961, `GET /api/app-session`, `56126→8021` | `next-http.jsonl:20276` |
| 종료 시작 | downstream ServerResponse close 경로에서 request.destroy → socket.destroy | `next-http.jsonl:20284–20285` |
| 커널 | 같은 socket의 owner 3740, tcp_close → `TCP_ABORT_ON_CLOSE` raw reason 11 | `kernel-events.jsonl:2858,2863` |
| 실제 통신 | Next 측 `56126→8021` RST+ACK | `packets.jsonl:9659` |
| 수신 | backend PID 3786, connection 1969의 `ConnectionResetError errno=104` | `backend-protocol.jsonl:22750` |
| Next 오류 | errno/syscall 없는 socketCloseListener ECONNRESET | `next-http.jsonl:20288` |

이 사례의 종료 주체는 Next이며 원 AS의 Next 측 OS read reset과 다르다. 시험 시작 이후 관측된 TCP RST 8건은 모두 Next 측→backend이고 반대 방향은 0건이었다. 준비 구간의 별도 RST 4건과 구분했다. 최초 실패 전 두 서버 leader의 종료나 OOM victim은 없었다. 일부 다른 TID의 종료는 서버 프로세스 종료로 세지 않았다. backend SIGTERM 및 Next SIGKILL은 실패 보존·cleanup 뒤 소유 프로세스 정리 구간에 있다. 모든 요청 종료가 업무상 정상 취소인지까지 판정한 것은 아니다.

### 재사용·보존·다음 안전한 지점

- 로컬 원문 기준 `R`은 `C:/Users/user/.codex/worktrees/mes-main-candidate-comparison/ERP/_attic/runtime/flaky-capture-20261019/ci-39195321428`이다. 원 보고서·화면·DB·로그는 ignored 안에 두며 수정하지 않았다. 별도 읽기 대조는 같은 상위 폴더의 `final_capture_audit.py`와 `final-capture-audit.json`이다.
- 실패 DB SHA256은 `ab6d9d60ff181dab8bb510bfc448154567c3e2e2de09c72d74129955cd524924`, receipt와 실제 파일이 일치한다. `checkout-final.json`·`export-final.json`의 소스 불변, `kernel-result.json`의 누락 검사, `failure-boundaries.jsonl`의 보존→정리 순서를 확인했다. ring이 없는 불량 화면에 대해 BOM 값을 관측한 것처럼 표시하지 않았다.
- 이번 CI의 Python 24건·Node 12건·관측 자체 검사와 앞선 유효 국소 검사는 해당 입력의 근거로 유지한다. 새 일반 실행의 통과 32건도 실제 실행 조건에만 연결한다. 실패·268건 미실행·이전 실패 원문을 덮어쓰지 않는다. 전체 backend·coverage·성능·복구·기대값·제품 production 빌드는 실행하지 않았다.
- 12:51 KST 읽기 확인에서 사용자 검토 DB와 session 파일 해시는 시작과 동일하고 3038/8038 PID는 각각 46916/10744로 유지됐다. 사용자의 초안·연구 요청은 진단에 사용하지 않았다. Windows 진단 3100/8021 listener는 없고 CI 소유 프로세스는 종료했다. main의 별도 세션 변경을 후보에 가져오지 않았다.
- 승인된 일반 묶음 1회는 소진했다. **다음은 원 두 문제의 해결 완료가 아니라 선행 검사 응답 전환/추가 조회 경계가 남은 상태다.** 같은 전체 묶음을 반복하거나, 앞 32건을 이미 실행한 것으로 간주해 새 DB·새 worker에서 뒤를 이어 원 실행 재현이라 표시하지 않는다. 추가 조사가 이어지면 먼저 이 별도 선행 경계의 국소 대조와 원 두 실패로 연결되는 근거의 유무를 확인해야 한다. 원 두 건에 대한 추측 패치는 하지 않는다.
- 이전 artifact에 포함된 중복 node_modules 정리는 자동 승인 검토가 `blocked by policy`로 거부해 수행하지 않았다. 해당 사본은 보존했으며 다른 삭제 경로로 우회하지 않았다.

## 2026-10-19 도구 준비

후보 시작 HEAD는 `121706c3f7f578dc236665512677d94f0f62f95d`. main·직원 환경과 사용자 검토 3038/8038·초안·요청은 변경하지 않았다. 시작 변경 목록과 파일 해시는 후보의 `_attic/runtime/flaky-capture-20261019/preflight.json`, 기존 미커밋 patch는 같은 폴더의 `starting-working-changes.patch`에 보존했다. AS 완료 문구 수정과 이전 문서는 별도 기존 변경이다.

| 확인 경계 | 확인 결과 | 의미와 한계 |
|---|---|---|
| BOM native setter | 원 descriptor·호출1회·인수/반환/예외·비대상 입력 무관측·메모 원문 배제·incident 보존·encoded chunk 정제를 검사 | 도구 계약이다. 실제 MES의 값 덮어쓰기는 아직 포착하지 않음 |
| 실제 React 입력 | 같은 Chromium/Next compiled React에서 관측 off/on의 2·3 입력과 변경 이벤트가 같음 | 전체 앱 타이밍이 전혀 변하지 않는다는 증명은 아님 |
| kernel 종료 경계 | 자체 검사에서 PID namespace 불일치를 발견·수정. init PID와 namespace PID를 연결한 뒤 정상 exit7 및 signal15 종료·소켓 owner·close를 기록 | 관측 도구 결함 수정이다. AS의 과거 reset 원인이 namespace 문제라는 뜻이 아님 |
| 실패 보존 순서 | 가짜 assertion 실패 → DB 원형값0·화면·browser trace 보존 → 원 오류 유지 → cleanup 후 값1 | 업무·원 제품 실패 재현이 아닌 도구 검사 |
| 정지한 renderer·test timeout | 수집 기한 초과는 partial, 테스트 timeout은 기존 cleanup 직전 hook에서 보존 | fixture 준비 안에서 먼저 정리된 실패는 완전한 before-cleanup 근거로 쓰지 않음 |
| 원 일반 실행 순서 | CI38886739485의 원 보고서에서 첫 시도 순서를 추출. 현재 수집한 301개/64파일의 선택·fixture 그룹별 순서가 원 첫 시도와 일치 | 실제 업무 재실행은 아직 시작 전. 원 retry1과 새 retry0의 차이를 기록하며 실패 후 가짜 worker 재시작을 넣지 않음 |

현재 코드에서 원 보고서 HEAD `eddd08118fb8c0e02bb794ffdc19adceacf63c72` 대비 E2E 원문·기본 설정·lockfile 차이는 없다. 테스트 몸체·정리 경계 계측은 Git 없는 CI export 사본에만 적용한다. 원 테스트 표현식·fixture 인수·개별 제한시간은 유지한다. 정상 경로에서 관측 때문에 상태 setter를 함수형으로 바꾸거나 추가 렌더를 만들지 않는다.

## 원문 위치

최종 도구 국소 검사: Linux Python22건, Node12건, actionlint와 diff check 통과. Windows의 SQLite 임시 파일 정리 실패는 명시적 connection close 누락을 드러냈고 도구와 자체 검사를 수정했다. Linux의22건에는 Windows에서 권한 문제로 skip했던 symlink 가드도 포함된다. 제품 DB나 서버는 이 검사에 사용하지 않았다.

- 후보 `_attic/runtime/flaky-capture-20261019/bom-writer-red.log`, `bom-writer-green.log`, `bom-observer-browser.json`.
- 후보 `_attic/runtime/flaky-capture-20261019/kernel-selftest-01`~`07`: 컴파일·namespace·decode 실패를 포함한 도구 개발 이력. 최종07 통과. 실패 자료를 성공으로 덮어쓰지 않았다.
- WSL `/home/hw/mes-flaky-capture-20261019/failure-selftest-01`: 원 assertion과 cleanup 전 DB·화면·trace.
- 같은 상위 경로의 `failure-selftest-02`: renderer 수집 정지의 bounded partial, `failure-selftest-03`: 실제 테스트 timeout과 cleanup barrier.
- 같은 상위 경로의 `collection-probe-02/cohort-collection.json`: 업무를 실행하지 않는 수집 순서 검증. `collection-probe`는 동기 afterEach 계측 지원 전 거부 기록이다.
- 후보 `_attic/runtime/comparison-checks/ci-eddd0811-playwright-general/parsed`: 원 보고서. 정제한 선택·순서와 원문 해시는 `scripts/dev/mes-flaky-diagnosis/general-cohort.json`에 연결했다.

## 긴 실행의 판정 규칙

### 첫 CI 준비 결과

후보 진단 커밋 `cbd6ac2b`의 [CI39192678405](https://github.com/Hw-03/ERP/actions/runs/39192678405)는 업무 실행 전 도구 가드에서 중단했다. CI 기본 브라우저 경로를 쓰는 경우 자체 검사 설정이 `executablePath:null`을 전달해 Playwright가 `expected string, got object`로 거부했다. 원 assertion에 도달하지 못한 준비 결함이며 BOM·AS 실패 재현으로 세지 않는다. 기본 경로일 때 해당 옵션을 생략하고, 원래 의도한 assertion/timeout 오류가 실제 발생했는지도 가드에서 확인하도록 수정했다. 같은 기본 브라우저 경로의 국소 자체 검사04가 통과했다.

원문은 후보 `_attic/runtime/flaky-capture-20261019/ci-39192678405`이며 checkout/export 해시 가드는 모두 불변이다. 일반 E2E는 미실행이다. 자동 시작 일반 CI39192678195는 정확한 후보 SHA 확인 후 취소 완료했다. 자체 검사에 재사용한 node_modules symlink의 내용이 artifact에 불필요하게 포함되어 이후 upload에서 그 경로만 제외한다.

진단 중 main이 별도 변경 `58dca032`(초기 재고 내역 표시)로 전진한 것을 읽기 확인했다. 이 변경을 후보에 가져오거나 main을 수정하지 않았다. 사용자가 보는3038/8038의 PID도 시작 시 값과 같다.

### 두 번째 CI 준비 결과와 커널 형식 보완

후보 `c414f338`의 [CI39193197093](https://github.com/Hw-03/ERP/actions/runs/39193197093)에서 실제 React 입력과 assertion/timeout 실패 전 보존 검사는 통과했다. 원 일반 E2E는 커널 수집기 컴파일 거부로 시작하지 않았다. 이 실행은 BOM·AS 제품 실패가 아니다. 같은 SHA의 자동 일반 CI39193197062는 취소 완료했다.

원문은 후보 `_attic/runtime/flaky-capture-20261019/ci-39193197093`에 있다. CI의 kernel6.17.0-1022-azure / bpftrace0.20.2에서 `tcp_send_reset`은 기존 `family/sport/dport` 대신 sockaddr 배열과 `reason`을 제공하지만 `tcp_receive_reset`은 기존 필드를 유지했다. 실제 tracepoint format을 읽어 두 probe를 각각 생성하도록 보완했다. 모르는 형식은 거부하고, 종료 이유 필드가 없는 커널은 -1로 남긴다. 생성된 BPF 소스와 해시도 보존한다.

국소 형식 선택 검사4건과 Linux kernel 자체 검사10은 통과했다. 자체 검사10의 decode 오류·손실 보고는 0이다. 자체 검사08은 구 커널의 socket 없는 reset 송신 이벤트를 기대해 실패했고, 09는 이전 도구 실행의 포트 재사용 준비 단계에서 멈췄다. 각각 원문을 남기고 실제 제공되는 reset 수신 경계, 새 커널에서만 제공되는 송신 이유, 기존 listener를 허용하지 않는 자체 검사 포트 재사용을 구분했다. 이 자연스러운 닫힌 합성 포트의 reset 검사는 수집기 확인이며 원 MES 오류 재현이 아니다. 새 커널 형식의 실제 기동은 다음 CI 준비 검사에서 확인한다.

### 세 번째 CI 준비 결과

후보 `948a3789`의 [CI39194178641](https://github.com/Hw-03/ERP/actions/runs/39194178641)도 원 업무 시작 전 중단했다. bpftrace0.20.2가 tracepoint byte array를 sockaddr 포인터로 cast하는 문법을 지원하지 않는다는 컴파일 원문을 확보했다. 배열의 family 두 바이트는 실제 호스트 byte order로, port 두 바이트는 network order로 읽도록 한 경계만 수정했다. 새 커널 자체 검사에서 진단 포트3154의 자연스러운 거부와 `NO_SOCKET` raw reason1까지 일치해야 통과시킨다. 국소 형식 검사4건은 통과했고 새 CI 실제 기동은 아직 확인 전이다. 원문은 후보 `_attic/runtime/flaky-capture-20261019/ci-39194178641`. 같은 SHA 일반 CI39194178648는 취소 완료했다. 원 일반 E2E 실행 횟수는 여전히0이다.

### 도구 버전 일치 후 국소 대조

후보 `1d64cf46`의 [CI39194509253](https://github.com/Hw-03/ERP/actions/runs/39194509253)는 bpftrace0.20에서 `probe`와 문자열 비교가 거부되어 업무 전 중단했다. 원문은 후보 `_attic/runtime/flaky-capture-20261019/ci-39194509253`이며 같은 SHA 일반 CI39194509380는 취소 완료했다. [공식 bpftrace0.20.2](https://github.com/bpftrace/bpftrace/releases/tag/v0.20.2)를 별도 로컬 경로로 받아 kernel-selftest11에서 같은 컴파일 오류를 재현했다. close와 active reset을 각 probe의 고정 kind로 기록하도록 보완해 컴파일을 통과했다.

국소12에서는 WSL의 중첩 PID namespace에서0.20이 init PID를 반환해 부모 추적이 성립하지 않는 차이와 빈 필터 lookup의 기존 버전 메시지·빈 구분행을 관찰했다. 이 실행은 정상으로 세지 않았다. 관측 PID와 실제 자식 PID가 다르면 준비 완료를 거부하는 가드를 추가했고 `kernel-namespace-rejection-15/guard-result.json`에서 거부를 확인했다. CI는 기록된 init namespace이며 그 실제 가드는 다시 확인해야 한다. 알려진 빈 lookup 두 형식만 별도 집계하고 다른 helper 오류는 계속 실패로 처리한다. 빈 owner를 삭제하는 호출도 피했다.

현재 국소 형식/오류 분류5건과 WSL0.25의 kernel-selftest14(정상 종료·signal·소켓 owner·close/reset 수신, decode/loss0)는 통과했다.0.20과 WSL 중첩 namespace의 조합은 지원한다고 주장하지 않는다. 원 일반 업무 묶음은 아직 시작 전이며 제품 원인은 두 건 모두 미확정이다.

일반 E2E만1회, worker1/retry0/repeat1/first failure stop, job 준비 포함90분이다. 최초 실패 전후를 `failure.frozen`, `failure.collection.finished`, `cleanup.begin`, `global-cleanup-start.json`으로 구분한다. browser trace는 실패 전 chunk와 cleanup chunk를 분리하고 독립 APIRequestContext trace는 최종 원문과 cutoff를 연결한다. collector는 종료까지 drain해 늦게 flush된 실패 직전 기록을 빠뜨리지 않는다.

원인 판정에는 기록 손실 여부·실제 입력/요청 경계·소켓 owner·원 오류 서명까지 필요하다. 자료가 부분이거나 원 실패와 다른 사건이면 그 범위를 명시한다. 모두 정상이면 같은 전체 묶음을 반복하지 않는다. 기존 전체 통과를 새 통합판 PASS로 승격하지 않는다.
