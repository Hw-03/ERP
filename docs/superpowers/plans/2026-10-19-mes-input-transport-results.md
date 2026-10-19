# AS 요청 지연 보완·BOM 입력 전달 조사 결과

**종료: AS 진단 도구 대기 제거 완료. 보완 후 AS 1회는 원 실패 미재현·조건 미충족, BOM 네 입력 조건은 정상·관측 손실0이다. 두 과거 제품 사건의 원인은 미확정이며 병합 보류를 유지한다.**

[승인 계획](2026-10-19-mes-input-transport-diagnosis.md). 이전 [직접 경계 결과](2026-10-19-mes-direct-boundary-results.md)는 당시 근거로 보존한다.

| 묶음 | 상태 | 업무 영향·한계 |
|---|---|---|
| AS 요청 전 스냅샷 대기 | 수정·국소 32건·실제 무업무 probe 통과 | 원 AS 연결 끊김과 별도 |
| AS 보완 후 요청 구간 | 승인한 1회 종료. 36개 응답, 제출201·초안200·상세200 | 발행 오차 최대7.385ms. Next 수신14건 기준 초과·패킷 수집기 drop2로 조건 미충족 |
| BOM 입력 전달 4조건 | fill2·숫자키2·숫자키3·fill3 각1회 정상. 입력·React·매칭 수량 일치 | 원 실패를 포착하지 못했으므로 원인 미확정 |
| 제품 원인 수정·회귀 | 미실행 | 새 제품 실패가 없어 추측 패치·10회/3회 검증을 시작하지 않음 |

## CP0 — 2026-10-19 15:43 KST

- W=`C:/Users/user/.codex/worktrees/mes-main-candidate-comparison/ERP`, 브랜치 `codex/mes-main-candidate-comparison-20261016`, HEAD `63d4ed59acf223e6cad62b3a360d905825d92021`.
- R=`W/_attic/runtime/flaky-input-transport-20261019-154319`. 시작기록 `preflight.json`, 기존변경 `starting-working-changes.patch`, 미추적파일 `starting-untracked/`로 보존.
- L=`/home/hw/mes-flaky-input-transport-20261019-154319`, 합성 source=`L/source`, DB=`L/source/backend/mes_e2e.db`. 새 gitless 사본을 준비했고 이전 Linux 사본·증거는 보존했다.
- 보호검토DB/session SHA256은이전기록과동일.3038 PID46916/8038 PID10744도동일. 정확한해시는R/preflight.json. 보호자료를테스트입력으로쓰지않는다.
- 시작 시 업무 요청0회였으며 새 한도는 AS1구간·BOM4조건/첫 실패 중단으로 고정했다. 아래 최종 실행 내역과 구분한다. 제품변경·커밋·푸시·CI·main·직원변경없음.

## 재개 정보

AS1구간과 BOM 네 입력 조건의 한도를 소진했고 소유 프로세스 정리를 마쳤다. 다음 행동은 새 실패 자료가 생겼을 때 해당 입력 writer 또는 실패 요청 socket부터 읽는 것이다. 이번 한도를 같은 조건 반복·새 폴더·CI로 우회하지 않는다. 기존 kernel/소켓 수집·원 manifest·실패 보존·동일 제품 업무 근거는 입력이 동일한 범위에만 재사용한다.

## CP1 — AS 도구 보완과 요청 구간 1회, 16:00 KST

### 확인 목적과 변경

재생 도구가 각 `page.evaluate` 앞에서 DOM 스냅샷을 기다려 요청을 늦게 발행하던 문제를 고쳤다. 준비한 동일 CDP 세션의 `Runtime.callFunctionOn`으로 동일 Chromium `fetch`를 호출한다. Playwright의 네트워크 원문 기록은 유지한다. 공개 API·업무 코드·DB 스키마는 바꾸지 않았다.

- 도구 오류(CDP·문서 교체·반환 형식)와 실제 fetch/본문 읽기 실패를 구분한다. 기준 요청 자체가 실패한 경우도 `first_failure`에 보존한다.
- 원문 추적 형식의 `Frame/evaluateExpression`, 본문 별도 resource 저장 형식은 실제 probe에서 확인해 검증기만 보완했다. probe01/02의 도구 실패를 보존했으며 제품 실패로 세지 않는다.
- probe03에서 이전 경로의 사전 스냅샷1개, 새 경로0개, 단일 요청·본문·쿠키·상태·오류 전달, 원문 HAR 보존과 새 진단 JSON의 비밀 복사 없음이 확인됐다. 업무 API·DB 사용0건이다.
- 실제 Next worker PID628에 두 관측기가 설치됐음을 인증 요청의 ID·메서드·시각·동일 socket tuple로 확인했다. 일반 Node 자식 단위검사만으로 대신하지 않았다.

### 실행 방법과 실제 결과

새 합성 사본의 `http://localhost:3100` → Next → `127.0.0.1:8021`에서 기존 manifest의 36개 요청을 원 순서·간격으로 한 번만 발행했다. 브라우저 계정·품목·새 미리보기 토큰은 합성 자료이며 사용자 검토 환경의 초안·요청은 쓰지 않았다. 정확한 요청 매핑은 아래 원문에서 확인할 수 있다. 핵심은 연구 사용출고의 새 제출 → 초안 조회 → 상세 조회다.

| 확인 | 실제 결과 | 판정 |
|---|---|---|
| 시계 준비 | CDP2.326ms·페이지1.165ms, 한도10ms 이내 | 준비 통과 |
| 실제 클라이언트 발행 | 36개, 최대 오차7.385ms·불확실성 포함8.548ms | 발행20ms 기준 충족 |
| 독립 Next 수신 | 14건에서 기존20ms 가드 초과, 최대170.500ms | 완전한 시각 조건 미충족 유지 |
| 업무 응답 | 제출 `b212` 201 1회, 초안 `b213` 200, 상세 `a16` 200. 전체 요청 실패0 | 이번에 연결 끊김 미재현 |
| 요청·socket 연결 | 36/36 연결, 첫 실패 없음 | 실패 socket의 종료 이유는 조사할 사건 없음 |
| kernel/패킷 | 실행 구간에서 관측한 reset0. 패킷 수집기 전체 drop2 | drop의 발생 구간을 특정할 수 없어 완전한 무손실 근거로 사용 불가 |
| 보존·정리 | context 종료 전 trace·화면·온라인 DB 백업 완료. 수집 오류0, 소유 backend SIGTERM 종료 | 정상 정리 종료를 원 오류로 해석하지 않음 |

**직원 영향:** 수정 대상은 진단 도구다. 직원에게 제공되는 AS 업무 동작은 변경하지 않았다. 원 CI의 `read ECONNRESET/-104` 원인은 아직 미확정이다. 이번 정상 응답을 제품 결함 해결·병합 가능으로 확대하지 않는다.

**수량·남은 조건:** 요청 구간의 제출·조회만 실행했으며 최종 승인·물리 재고 차감·하위 반환·취소는 이번에 새로 검증하지 않았다. 과거 관련 업무 근거는 당시 상태로 보존한다. 새 승인이나 수량 대조를 실행했다고 표시하지 않는다. Next 수신 초과는 사후 대조에서 확인됐고 동일 구간을 추가 실행하지 않는다.

**중단 구현의 한계:** 클라이언트의 실제 발행 초과는 즉시 중단하도록 연결되어 있지만, 독립 Next 수신 시각은 현재 도구가 모든 요청 종료 후 평가한다. 따라서 이번 수신14건 초과는 실시간 중단으로 이어지지 않아 36건이 모두 발행됐다. 승인 계획의 첫 시각 초과 중단을 모든 관측 지점에서 충족한 것은 아니다. 이 실행을 조건 충족으로 승격하거나 동일 구간을 다시 실행하지 않는다.

### 정확한 근거 경로

모든 경로의 `R`은 위 CP0의 ignored 로컬 폴더다. Linux 원문도 그대로 보존했다.

- 도구 변경/국소32건/RED→GREEN: `R/tool-checks/transport-implementation.md`, `transport-files-final.json`, `transport-green-final-04.log`.
- 실제 무업무 probe: `L/tool-checks/browser-transport-03/{report.json,old-trace.zip,new-trace.zip}`. probe01/02도 보존.
- 실행·판정: `R/linux-evidence/as/preparation-01/replay/{segment-started.json,before-cleanup.json,replay-events.jsonl}`.
- 화면·요청 원문·DB: 같은 `replay/{before-cleanup.png,before-cleanup-trace.zip,before-cleanup.db}`.
- 수신/소켓/kernel/프로세스: `R/linux-evidence/as/preparation-01/{next-receipts.jsonl,next-http.jsonl,backend-protocol.jsonl,kernel-events.jsonl,packets.jsonl,pids.jsonl}`.
- 읽기 분석·종료: 같은 폴더 `{analysis.json,parent-before-cleanup.json,result.json,after-run.db}`. 파일50개의 원문 SHA256=`R/as-evidence-index-50.json`.

## CP2 준비 — BOM 무업무 probe 통과, 앱 helper 누락 보완

- 새 관측 도구15건·기존13건 및 문법 검사 통과. 실제 Next에 설치된 React 숫자 입력을 별도 unpatched/off·patched/on 프로세스에서 각각 한 번 확인했다. 양쪽 모두 DOM·React 추적값·상태·제출값2, 변경 이벤트1회, 업무 요청0건이었다. 근거=`L/tool-checks/bom-probe-01/{off.json,on.json,comparison.json}`.
- 첫 앱 준비 `L/bom/q2-fill`은 로그인·BOM 입력 전 `_failure-boundary` 모듈 누락으로 종료됐다. 합성 fixture 준비만 수행했고, 이 시점의 실제 수량 입력은0건이었다. 원 로그·DB는 보존하며 제품 실패로 세지 않는다. 누락 helper 설치·시작 전 의존 검사만 보완했다. 독립 읽기 검토로 실패 줄83이 관측기·로그인·입력 앞임을 확인했다.
- 보완은 `--dependencies-only`로 누락 파일만 추가했으며 기존 spec·manifest·제품 파일은 그대로 유지했다. 별도 `ready-02`에서 최초 실제 입력을 시작했다. 초기 원문=`R/linux-evidence/bom/q2-fill/{runner.log,preparation-audit.json,after-run.db}`, 보완 영수증=`R/linux-evidence/tool-checks/bom-install-ready02.stdout.json`.

## CP2 — BOM 네 입력 조건 종료, 16:16 KST

### 무엇을 확인했는지 / 재현 순서

자동 입력 명령이 실제 숫자 입력칸과 React에 어떻게 전달되는지 확인했다. 동일 Linux 합성 코드·DB 구성에서 각 조건마다 새 동등한 품목과 초안을 만들었다. 서버는 `http://localhost:3100`, 계정은 관리자 특례 없는 합성 직원이며 실제 직원·사용자 검토용 초안은 사용하지 않았다.

각 조건은 로그인 → 출하 요청 → 합성 PF 검색·선택 → BOM 구성 조정 → 초기값1인 AF 숫자 칸 선택 → 지정 방식으로2 또는3 입력 → 추가 조회·재입력·대기 없이 다음 버튼 → 단계3과 매칭 요청 확인 순서다. 품목 식별값은 각 원문의 `fixture.af`, `fixture.pf`, 실제 요청 `match.lines`로 연결된다. 계정·품목 생성 절차는 고정 원본 fixture를 재사용했다.

| 조건 / 처리 전 | 입력 방식·예상 변화 | 실제 Next 직전 상태 | 실제 단일 매칭 요청 | 관측·판정 |
|---|---|---:|---:|---|
| q2-fill / 1 | fill로2 → 상태·매칭2 | 2 | 2, HTTP200 | insertText1회, 손실0·pause0·정상 |
| q2-key / 1 | 전체선택 후 숫자키2 → 상태·매칭2 | 2 | 2, HTTP200 | Control+A 및 실제 keyDown/keyUp, 손실0·pause0·정상 |
| q3-key / 1 | 전체선택 후 숫자키3 → 상태·매칭3 | 3 | 3, HTTP200 | Control+A 및 실제 keyDown/keyUp, 손실0·pause0·정상 |
| q3-fill / 1 | fill로3 → 상태·매칭3 | 3 | 3, HTTP200 | insertText1회, 손실0·pause0·정상 |

입력 명령 송수신 → native input → React 추적값 비교·변경 이벤트 큐·기존 값 복원 경로 → 제품 onChange·상태 updater → 다음 버튼 직전 render → 실제 매칭 요청을 연결했다. 원래 화면의 매칭은 다음 버튼에서 직접 요청하는 것이 아니라 기존350ms effect가 발행한다. 이전 기본값1의 선행 요청을 새 입력 결과와 혼동하지 않도록 입력 시점·단일 요청 ordinal/hash·숫자 본문·호출 위치를 연결했으며, 원하는2/3 응답을 골라 통과시키지 않았다.

**main과 후보 / 직원 영향:** 이번은 후보의 새 입력 경계 조사다. main을 새로 기동·변경하거나 재검사하지 않았다. 후보에서 새 불일치는 없었으나 이를 과거 CI 실패가 자동화 문제였다는 증거로 소급하지 않는다. 관측이 시간에 영향을 줄 가능성도 남는다. 제품 변경은 없으며 직원 BOM 동작을 바꾸지 않았다.

**후속 사용·취소·미확인:** 이 네 조건은 입력과 단계 이동·매칭까지만 확인했다. 최종 출하 요청 저장, 실제 재고 증감·후속 생산/출하·취소는 실행하지 않았다. 저장 수량·기본 BOM 불변을 이번 결과로 새로 PASS 처리하지 않는다. 불일치가 없어 post-write pause나 관측 축소/off 대조2건은 발동하지 않았다. 새 제품 수정이 없으므로 회귀10회·원 선택자3회·production 빌드·번들 검사는 반복하지 않았다.

### 정확한 원문 경로

공통 위치 `B=R/linux-evidence/bom/ready-02`. 각 행의 결과와 trace는 동일 실행이며, 파일 해시는 `R/bom-evidence-index-97.json` 및 각 `admission.json`에 있다.

| 조건 | 입력·상태·요청 원문 | 화면 trace |
|---|---|---|
| q2-fill | `B/q2-fill/test-results/bom-input-transport-BOM-INPUT-q2-fill-chromium/bom-input-transport-result.json` | 같은 디렉터리 `bom-input-before-cleanup-trace.zip` |
| q2-key | `B/q2-key/test-results/bom-input-transport-BOM-INPUT-q2-key-chromium/bom-input-transport-result.json` | 같은 디렉터리 `bom-input-before-cleanup-trace.zip` |
| q3-key | `B/q3-key/test-results/bom-input-transport-BOM-INPUT-q3-key-chromium/bom-input-transport-result.json` | 같은 디렉터리 `bom-input-before-cleanup-trace.zip` |
| q3-fill | `B/q3-fill/test-results/bom-input-transport-BOM-INPUT-q3-fill-chromium/bom-input-transport-result.json` | 같은 디렉터리 `bom-input-before-cleanup-trace.zip` |

각 `B/<조건>/`에는 `start.json`, `helper-preflight.json`, `report.json`, `runner.log`, `admission.json`, `result.json`, `after-run.db`가 있다. 조건별 DB는 모두 quick_check=ok다. 실제 on/off 도구 probe는 `R/linux-evidence/tool-checks/bom-probe-01/{off.json,on.json,comparison.json}`이며 전체 도구 원문 색인은 `R/tool-checks-evidence-index-32.json`이다.

도구 unit·문법 근거는 `R/tool-checks/bom-unit-session-evidence.md`에 정확한 명령·세션 출력 식별자와 한계를 적었다. 최초15건+기존13건의 통과, 이후 설치기 보완의16건 통과를 구분한다. 하위 세션의 stdout 별도 파일·당시 소스해시가 없다는 점도 명시했고, 문서 작성을 위해 검사를 다시 실행하지 않았다. 실제 Linux 설치·probe·업무 네 조건에는 별도 원문과 소스해시가 있다.

## CP3·CP4 — 최종 판정과 보호 확인, 16:18 KST

- **CP3 미완료:** 원 BOM의 값 손실이나 원 AS의 연결 종료를 이번에 포착하지 못했다. 제품/자동화/환경 중 원 사건의 귀속은 미확정이며 제품 수정·수정 효과 검증도 수행하지 않았다. AS 진단 도구의 사전 스냅샷 대기는 별도로 원인과 수정 효과를 확인했다.
- **독립 검토:** AS 수신 초과의 사후 평가 한계를 기록했다. BOM 네 조건은 입력→상태→매칭까지만 정상으로 인정하며 준비 실패·최종 저장/재고 미검증을 분리한 판정을 확인했다.
- **보호 상태:** `R/postflight.json`에서 후보 HEAD63d4ed59와 main ref가 CP0와 동일하고, 검토3038 PID46916·8038 PID10744 및 보호 DB/session 해시가 유지됨을 확인했다. 이번에 제품 소스 변경0, Linux 제품 파일 변경0, Playwright 원본 파일 해시 유지, 전용3100/8021 리스너 없음이다.
- **검증 재사용:** 이전 전체 업무·CI·복구·성능·기대값 근거는 당시 코드의 기록으로 보존했다. 이번 국소 결과를 새 전체 PASS로 승격하지 않았다. 전체 검사·새 CI·커밋·푸시·main 반영·직원 배포는 하지 않았다. `git diff --check`는 통과했다.
- **남은 것:** 새 실패 입력의 최초 writer/그 값의 출처 또는 실패 GET의 실제 socket/종료 이유가 필요하다. 이번 정상 조건과 AS 구간은 추가 반복하지 않는다. 새 판별 조건이나 실제 실패 자료가 생겼을 때 그 범위만 재개한다.
