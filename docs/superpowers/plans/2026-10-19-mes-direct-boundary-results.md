# BOM·AS 직접 경계 조사 결과

**현재: 승인된 조사 한도 종료, 두 원인은 미확정·병합 보류.** BOM 네 동시 작업 조건은 정상 관측했고 AS는 실제 발행 시각이 기준을 벗어나 제출 전에 중단했다. 새 정상 업무에서 재현한 결함의 해결과 과거 CI 사건의 귀속을 별도 판정한다. [승인 계획](2026-10-19-mes-direct-boundary-diagnosis.md)을 따른다.

**15:12 KST 진행 불가 감사:** 마지막 새 근거인 요청 전 스냅샷 대기 확인 뒤3회 후속 확인에서 동일한 증거 공백이 유지됐다. 후보HEAD·원문 해시는 같고 진단 프로세스/포트는 종료, 해당HEAD 진단CI는skipped·일반CI는cancelled로 모두 terminal이다. 원BOM writer/상태와 원AS 실패GET의 종료 주체·이유는 여전히 미관측이며 제품 원인 수정·회귀 검증은 미완료다. `R/tool-checks/no-progress-after-1506-{01,02,03}.json`에 대조와 안전하게 진행할 수 없는 이유를 남겼다. 목표는 완료가 아니라 진행 불가로 전환한다. 새 실제 실패 기록 또는 별도로 정한 추가 실행 범위가 있어야 재개한다.

| 영역 | 현재 결과 | 직원 영향·한계 |
|---|---|---|
| CP0 | 후보63d4ed59·기존 변경·검토 DB/session 해시·PID 보존 | 사용자3038/8038과 main·직원 환경 미변경 |
| BOM 두 사용자 동시 업무 | 입력 완료 후 갱신·입력 중 갱신 각각2·3 모두 유지, 승인된4조건 종료 | 새 결함 미재현, 과거 원인·직원 영향 미확정 |
| AS 요청 구간·간격 재생 | 1회 시도, 초기11GET은200이나 발행 시각20ms 기준 초과. 제출·문제의 후속 조회는 미실행 | 조건 미충족이며 제품 정상/자동화 원인 확정으로 세지 않음 |
| 최소 수정·재발 방지 | 원인 확보 전이므로 미실행 | 제품 패치 없음 |

## 환경·근거 위치

- 후보 `codex/mes-main-candidate-comparison-20261016`, 시작 HEAD `63d4ed59acf223e6cad62b3a360d905825d92021`.
- 로컬 원문 R=`C:/Users/user/.codex/worktrees/mes-main-candidate-comparison/ERP/_attic/runtime/flaky-boundaries-20261019-135838`.
- Linux L=`/home/hw/mes-flaky-boundaries-20261019-135838`, 진단 source=`L/source`, 합성 DB=`L/source/backend/mes_e2e.db`, 전용3100/8021.
- 시작 `R/preflight.json`, 기존 변경 `R/starting-working-changes.patch`, HEAD archive 식별값 `R/source-archive.json`. 진단 export에는 기존 미커밋 AS 문구를 넣지 않으며 사용자 검토 빌드는 그대로 둔다.
- 검토용 B DB SHA256 `bddc1c4f61c04fa2ecf3479b6e8d737886cb18f399ee24a005e1cd97a7716376`, session `c2a8b25f7d15b4ab269462d576aaa2dc67d79bb6030e86ddee6e48fa8bf95694`. 시작 PID3038=46916/8038=10744.
- 시작 C 여유 약123.4GiB. 기존 Linux 런타임을 재사용하고 합성 source/의존성 한 세트만 추가한다.

## 재사용과 실행 한도

기존 native writer·React 관측·커널 수집·cleanup 전 보존 도구 검사 및 과거 업무 통과는 당시 입력에만 재사용한다. 이전 일반1회·응답 순서 대조·실패 원문은 수정하지 않는다.

BOM은2·3 × 두 순서 최대4건, AS는 요청 구간1건이다. 첫 실패·관측 누락은 해당 묶음을 멈춘다. 실제 순서 미충족을 PASS로 표시하거나 목표 시점에 맞을 때까지 반복하지 않는다. 원인 확보 뒤에만 수정 전후 대조와 회귀10회/직접 원 선택자3회를 진행한다.

## 관측 준비 기록

- BOM 설치 도구의 CRLF 비교 오류를 작은 설치 검사에서 재현해 수정했다. 원본 바이트·해시는 보존하고 비교할 텍스트만 정규화한다. LF/CRLF·경로 보호·소스맵·관측 판정 등 도구 검사11건 통과. 제품 실패의 재현으로 세지 않는다.
- `L/bom/prepare-01`은 수량 입력·구매 메모 저장 전에 중단했다. `match:manual`의 소스맵이 생성 코드의 표현식 안쪽을 가리켜 실행 가능한 중단점이 해소되지 않았다. 같은 원본 statement의 실제 진입 위치를 확인 중이며, 다른 줄로 임의 이동하거나 위치 가드를 해제하지 않는다.
- 초기 로그인 후 화면 이동에서 취소된 catalog 조회와 본 실험의 요청 실패를 구분한다. 준비 실패의 합성 DB·화면·trace는 `L/bom/prepare-01/first-failures/`와 `test-results/`에 보존했다. 이 시점의 동시 업무 실행은0건이다.
- AS 원 실패 자료에서 정상 요청36건과 이미 취소된 요청1건을 분리했다. 새 추출본은 `R/as-manifest.json`; 원문 trace·ID 집합·추출 도구 해시를 연결한다. 같은 경로의 동시 요청은 합성 `X-Request-Id`로 유일하게 연결하고, 이 헤더가 업무 값이나 Agent 설정을 바꾸지 않는지 사전 확인한다.
- AS는 CDP 발행 기록 외에 실제 Next 수신까지20ms 범위 안인지 보수적으로 검사한다. 요청·소켓 연결 누락, 모호한 중복, 시간 조건 미충족은 정상으로 세지 않는다.

### 준비 보완과 실제 업무 구분

- BOM 준비02에서도 `match:manual`의 실행 위치가 없었다. 실제 소스의 `matchBom`은 선언 외 참조가 없으므로 원본 해시·식별자 참조 개수1·제외 사유를 manifest에 남겼다. 실제 실행되는 `match:request`와 `match:ensureReady`는 계속 검사한다. 준비03은 위치·상태 읽기·관측 유실0을 확인했다. 준비03은 수량 입력/메모 저장을 하지 않은 도구 준비 검사다.
- 초기 catalog 취소는 원인을 확정하지 않았다. 같은 document의 후속200과 적용 완료가 있어야 준비를 허용하고, 본 업무 구간의 취소는 정상으로 넘기지 않는다. BOM 도구13건 통과는 제품 결함 수정 근거가 아니다.
- AS `L/as/segment-01`은 준비용 API까지 진행한 뒤 브라우저 시계 측정이10ms 기준을 넘어서 중단했다. `replay/segment-started.json`이 없어 시간표 재생은0회다. 최초 도구가 초과한 측정 원값을 남기지 못한 한계도 보존한다. 같은 CDP 세션으로 시각을 읽고 검사 전에 원 측정값을 남기도록 보완했으며10/20ms 기준은 유지했다. 새 시계 검사3건 RED→GREEN, 기존15건 재사용(`R/tool-checks/as-final.clock.json`).
- 같은 준비의 커널 helper 오류12건은 `signal_generate`의 namespaced PID/TID 읽기였다. 신호를 보낸 주체는 원 자료만으로 확정할 수 없다. sender만 init namespace ID로 기록하도록 보완하고 target과 오류 거부 가드를 유지했다. 국소 Python8건 통과(`R/tool-checks/kernel-signal-result.json`). 이전 오류 자료를 수정하거나 정상으로 승격하지 않는다.

## BOM — 입력 완료 후 갱신·입력 중 갱신

목적은 다른 사용자의 품목 저장이 출하 작성자의 수량을 기본값1로 되돌리는지 확인하는 것이다. 합성 두 계정만 사용하고 실제 직원 자료·3038/8038의 초안은 사용하지 않았다.

순서: 진단 `http://localhost:3100`에서 A 출하 요청→합성PF 선택→BOM 수량2 또는3 입력→포커스 이동. B 관리자 품목에서 별도의 합성품목 구매 메모만 저장. A의 실제 SSE 수신→품목 재조회/상태 적용 완료→다음 단계. 입력 중 조건은 B저장→재조회 시작→A입력·즉시 다음 순서다. A는 결재 역할 없는 합성 직원, B는 창고/생산부 정·AS연구 결재 역할의 합성 직원이며 품목 편집은 별도 관리자 PIN 기능을 사용했다. 품목 ID와 fixture 정보는 각 원문 `bom-concurrent-result.json`의 `fixture`에 있다. 두 Chromium context의 viewport는1920×1080이며 인앱 브라우저의 사용자 탭은 조작하지 않았다.

| 조건 | 입력→예상→실제 | 실제 순서 근거 | 판정 |
|---|---|---|---|
| `q2-after-reload` | 기존1→입력2→갱신 뒤2→매칭2·다음 상태2 | input→blur→B저장→조회시작→본문완료→상태적용→다음 순서, 관측 유실/오류0 | 이 조건 정상, 원인 해결 아님 |
| `q3-after-reload` | 기존1→입력3→갱신 뒤3→매칭3·다음 상태3 | 같은 순서와 실제 SSE·onChange·updater 확인, 관측 유실/오류0 | 이 조건 정상, 원인 해결 아님 |
| `q2-inflight` | 기존1→입력2→매칭2·다음 상태2→재조회 적용 뒤2 | 조회 시작77.086ms 뒤 입력, 본문 완료19.467ms 전에 다음 클릭, 오류/유실0 | 조건 충족·정상, 원인 해결 아님 |
| `q3-inflight` | 기존1→입력3→재조회 적용 뒤3→매칭3·다음 상태3 | 조회 시작85.481ms 뒤 입력, 입력71.710ms 뒤 본문 완료, 다음 클릭은 본문 완료36.190ms 뒤 | 입력과 조회 겹침 충족·정상, 다음 클릭까지 조회 중이었던 것은 아님 |

원문은 `L/bom/<조건>/test-results/bom-concurrent-BOM-CONCURRENT-<조건>-chromium/bom-concurrent-result.json`; 수량·시각·원문 해시와 부모 승인 근거는 각 `admission.json`, 실행 결과는 `result.json`, DB는 `after-run.db`에 있다. B의 저장 전후 비교에서 구매 메모만 달랐고 서버 갱신시각은 별도 메타데이터로 기록했다.

이 조사는 수량 입력과 다음 단계/매칭 경계다. 실제 출하 요청 저장·재고 차감·후속 사용·취소는 수행하지 않았다. main과의 새 비교도 하지 않았으며 과거 동일 소스의 유효 업무 검사는 별도 근거로 유지한다. 네 조건의 정상 관측만으로 직원 영향 없음·과거 CI의 자동화 문제를 확정하지 않는다.

네 조건 모두 B의 구매 메모 UI 저장200과 실제 SSE→품목 재조회→상태 적용을 연결했고, native/React/updater/렌더/매칭에서 수량을 읽었다. 승인된 BOM4조건을 소진했으므로 같은 조건을 반복하지 않는다. 실패가 없어 결정적 관측 축소 대조·계측 끈 재검사·제품 수정·수정 효과10/3회 검사는 실행하지 않는다. 새 재현 결함은 없고 과거 CI와의 원인 일치는 미확정이다.

## AS — 원 요청 구간1회 시도와 중단

목적은 원 실패 직전의 요청 간격을 실제 Next 프록시에서 재생해, 실패 GET의 upstream 연결과 종료 이유를 연결하는 것이다. 화면 탐색은 제거하고 Chromium fetch와 APIRequestContext를 구분했다. 같은 Linux의 Next3100→backend8021·합성 DB만 사용했다.

요청자는 연구 소속·창고/생산부 결재 역할 없음, 별도 합성 정/부 및 AS연구 승인 담당자를 준비했다. 상위·선택하위·미선택하위는 실제 API로 새로 만든 합성품목이며 ID는 `before-cleanup.json`의 `synthetic_fixture`에 있다. 원 자료의 품목 규모/공정 분포 준비를 재사용했지만 과거 DB 전체 이력·브라우저 수명을 복원한 것은 아니다.

| 단계 | 예상 | 실제·판정 |
|---|---|---|
| 준비 시계 | 각 측정 구간10ms 이하 | CDP3.416089ms·브라우저2.105680ms, 준비 통과 |
| 첫 내역 조회 `b196` | 예정 시각에서20ms 이내 발행 | 드라이버 호출+3.848463ms, CDP 발행 표식+83.885684ms, Next 수신+106.625347ms. 조건 미충족 |
| 초기 병렬 조회 | 원 간격·중첩 유지 | 11GET의 CDP 표식 지연83.886~99.575ms. 이미 발행된 요청만 끝까지 수집했고 모두200·request ID/실제upstream 연결 일치 |
| 미리보기·제출·후속 조회 | 새 토큰→제출1회201→초안·상세 조회 | 중단으로25요청 미발행. 원 문제의 submit·b213·a16까지 도달하지 않음 |
| 실패 전 보존 | 두 context를 유지한 채 DB·trace·화면 보존 | `capture_errors=[]`, browser 살아 있음·API 미폐기 확인 뒤 정리 |

첫 발행 표식의 시계 불확실성±1.708045ms를 빼도 지연은 최소82.177639ms로20ms를 넘는다. CDP 표식은 Chromium의 요청 발행 직전 기록이며 물리 소켓 전송 시각 자체는 아니다. 실제 Next 수신도 함께 사용했다. 단순히 관측 콜백이 늦게 도착했다는 이유로 판정한 것이 아니다. 드라이버 호출과 Chromium 발행 표식 사이의 지연은 최초 분석에서 미분류였고, 아래15:06 읽기 감사에서 요청 실행 전 스냅샷 대기 구간을 확인했다. 전체 지연의 단일 원인이나 원 AS의 제품 오류 원인으로 바꾸지 않는다.

`status`·`qualification` 모두 `CONDITION_NOT_MET`, `segment_completion=INCOMPLETE`, `first_failure=null`이다. 실제 구간 시작 marker가 있으므로 이름이 `preparation-02`여도 승인된1회 시도를 사용했다. 다른 폴더로 바꿔 다시 실행하지 않는다. 허용 시간을 늘리거나 CI에서 정상 재확인을 하지 않았다.

수량은 합성 준비 입력에서 각 품목 전체17=창고10+조립7이었다. 보존 DB를 읽어 세 품목 모두 전체17·창고10·조립7·예약0을 확인했다(`R/as-snapshot-audit.json`). 시간표 구간에는 조회만 발행됐다. 승인 전후 예상 조립7/7/7→6/9/7, 후속 사용·취소·무관 위치 불변의 실제 업무 검증은 이번 시도에서 미실행이다. main 신규 비교도 하지 않았다.

커널 기록은775이벤트·decode/loss0·usable:true. 시간표 구간에는 RST가 없었고 관측된13RST는 앞선 준비 구간에 있었다. 원 `read ECONNRESET/errno=-104` 사건과 동일한 실패를 포착하지 못했다. 부모가 정리하기 직전 backend/frontend는 살아 있었고 backend exit−15는 소유 프로세스 종료 단계의 SIGTERM이다. 이를 원 조회 실패 원인으로 세지 않는다.

관측 한계도 있다. 공용 `next-http.jsonl`에는 request/socket 경계가0건이고 실제 upstream PID644의 ready 기록도 없다. 따라서 이 파일의 오류 목록이 비었다는 사실로 오류 부재를 입증하지 않는다. 이번11GET의 결론은 별도 request-ID 연결 기록과 TCP·커널 자료에 한정된다. 최초 조건 미충족은 그 시각에 메모리 이벤트로 고정했고, 이미 발행된 요청을 기다린 뒤 원문 파일·DB·trace를 보존했다. 중단 시각과 디스크 보존 시각을 혼동하지 않는다.

이 관측 누락은 실행 후 설치된 Next16.3.4 소스를 읽고 옵션 변환을 대조해 원인을 확인했다. 두 `--require`를 전달하면 Next 자식 서버의 옵션 재구성에서 마지막 `replay-receipt.cjs`만 남는다. `frontend/node_modules/next/dist/server/lib/utils.js:82,217,234`의 parse/format과 `frontend/node_modules/next/dist/cli/next-dev.js:274,318`의 전달 경로이며, 진단 `serve-next.cjs:14`는 환경을 그대로 전달했다. 실제 부모629에는 공용 관측 ready가 있고 upstream worker644에는 없으며 별도 receipt만 기록된 상황과 일치한다. 이것은 **진단 관측 도구의 누락 원인**이다. 원 AS의 `read ECONNRESET` 원인이며 해결됐다는 뜻이 아니다.

최소 보완은 `scripts/dev/mes-flaky-diagnosis/io/replay-preload.cjs` 한 파일에서 기존 두 모듈을 순서대로 불러오는 것이다. 실제 설치된 Next 옵션 변환 뒤 일반 자식 Node의 module cache를 확인하는 `replay-preload.test.cjs`로 기존 방식은 첫 관측기 미로딩, 새 방식은 두 관측기 각1회 로딩·다시 require해도 중복 없음을 확인했다. 서버·브라우저·HTTP 요청 없이 두 방식을 대조했으며 원문은 `R/tool-checks/as-preload-{red,green}.log`, 명령·소스 해시·문법 검사 영수증은 `as-preload.json`에 있다. 사전 red는 새 로더가 없어서 발생한 MODULE_NOT_FOUND이며 원 AS 실패 재현이 아니다. 실제 Next 서버의 새 로더 기동 검사는 하지 않았다. 운영 Next 코드나 timeout은 수정하지 않았다.

앞으로 사용할 로컬 `R/run-as.py`의 로더 옵션만 보완했다. 실제 시도 당시 파일은 `R/executed-preparation-02-run-as.py`(SHA256 `42a1592d9a54b2b471f0a75583258208ca509a75f272a3d5c96704dd33382a1e`)로 따로 보존했다. Linux의 실행 당시 사본과 원문 결과를 덮어쓰지 않았고, 구간 marker에 의한 재시도 금지 가드도 유지한다. 새 로더로 AS를 다시 실행하거나 앞선 조건 미충족을 통과로 변경하지 않았다.

정확한 원문은 `R/linux-results/as/preparation-02/replay/{segment-started.json,replay-events.jsonl,before-cleanup.json,before-cleanup-trace.zip,before-cleanup.png,before-cleanup.db}`, 상위의 `next-http.jsonl`, `next-receipts.jsonl`, `backend-protocol.jsonl`, `kernel-events.jsonl`, `kernel-raw.jsonl`, `kernel-result.json`, `packets.jsonl`, `pids.jsonl`, `parent-before-cleanup.json`, `result.json`이다. 독립 읽기 감사·시각 계산은 `R/tool-checks/as-attempt-audit.json`에 있다. 원 실패 trace와 새 실행 원문은 별도로 보존했다.

### 15:06 KST — 저장된 trace에서 재생 도구의 사전 대기 확인

새 업무·서버·브라우저 실행 없이 `before-cleanup-trace.zip`과 실제 설치 Playwright1.60 소스를 대조했다. Linux와 워크트리의 `playwright-core/lib/coreBundle.js` SHA256은 모두 `f74353fcb8e406756a70a6af0dfc4a5069acd577e35ec9d923ccf36ac009c2f5`다.

- 재생기의 `browserFetch`는 매 요청을 `page.evaluate`로 보낸다(`scripts/dev/mes-flaky-diagnosis/io/replay-as.cjs:70`). Playwright는 실제 명령 실행 전에 `onBeforeCall`을 기다리고(`coreBundle.js:24248`), tracing의 해당 hook은 DOM 스냅샷 완료 promise를 반환한다(`:25413~25422`). 스냅샷 timestamp는 브라우저 캡처가 반환된 뒤 기록한다(`:20555~20592`).
- 첫 `b196`은 trace의 `call@53` 시작4843.241ms→before snapshot 기록4896.262ms로 **53.021ms**가 지나야 본 요청 함수를 실행할 수 있었다. 브라우저의 순수 스냅샷 수집 기록도31.5ms다. 이 사전 대기만20ms 발행 예산을 넘으므로, 이번 도구에서 시간표를 놓치는 데 기여한 경로가 확인됐다. 초기11개 호출 모두 같은 await 경로이고 시작→snapshot 기록 간격은53.021~69.700ms였다.
- snapshot 기록→HAR network entry는 첫 요청29.257ms지만 HAR timestamp는 기록기 시각이다. 실제 소켓 전송 시각 또는 남은 지연의 원인으로 단정하지 않는다. 원84ms 전체가 DOM 수집 때문이라고 주장하지 않으며 관측을 끈 대조도 수행하지 않았다.
- 이는 **새 재생 도구의 관측 대기**다. 원 사건의 초안 조회는 앱에서 자동 발행했고 상세 조회는 APIRequestContext였다. 이번 per-fetch `page.evaluate` 대기가 원 `read ECONNRESET`을 만들었다는 근거가 아니다. 기존 AS 시도는 계속 조건 미충족이며 재실행하지 않는다.

근거·11개 호출 매핑·원문/소스 해시·한계는 `R/tool-checks/as-snapshot-dispatch-readonly.json`에 있다. 다음에 별도 실행 조건을 정할 경우 요청마다 기다리는 DOM 스냅샷을 발행 경로에서 분리할 필요가 있다는 구체적 근거를 얻었다. 시간 허용값 확대·동일 재생 반복·원제품 추측 패치로 이어가지 않는다. BOM 새 실패 근거는 없다.

## 변경·검사·종료

- 이번 변경은 명시적으로 실행하는 진단 도구와 정제한 문서다. BOM 정확한 코드 위치 관측/설치/4조건 검사, AS 원문 추출/요청·소켓 매핑/시간표/실패 보존을 추가했다. 커널 sender ID·시계 측정·최종 판정 충돌은 도구의 결함을 국소 수정했다. 제품 원인 패치·업무 API·DB 스키마·재고식 변경은 없다. 시작 전 AS 완료 문구 변경은 그대로 보존했다.
- BOM 도구13건과 네 실제 조건, AS 기본 도구 근거 및 실패 본문1건·시계3건·최종 자격1건의 국소 검사, 커널8건 및 실제3154 수집기 자체 검사, 위 단일 preload의 서버 없는 검사를 연결했다. BOM 도구 출력은 기존 세션 출력에서 복원했음을 `R/tool-checks/bom-final-session-recovered.receipt.json`에 명시했다. 새 전체 검사를 실행한 것으로 표시하지 않는다.
- 최종 제품 수정이 없어 production 빌드·번들·인앱 업무 재검사, 전체 E2E/백엔드/커버리지/성능/복구/기대값 검사는 반복하지 않았다. 수정 효과10/3회는 제품 원인 미확정으로 미실행이다. 신규 진단 CI·커밋·푸시도 하지 않았다.
- Linux 원문249파일/60,723,196바이트를 `R/linux-results`에 복사해 각각 SHA256을 대조했다(`R/copied-evidence-hashes.json`). source/node_modules/빌드를 이 증거 사본에 포함하지 않았다. DB·화면·원문은 ignored 로컬 경로에만 있다.
- `R/postflight.json`: 후보 HEAD/브랜치·기존 제품 변경 상태, 사용자 B DB/session 해시·3038 PID46916/8038 PID10744 보존. 진단3100/8021/3154 종료. Linux 제품 소스1,175파일 해시 불변은 `linux-final-protection.json`에 기록했다. main·직원 환경·예약 변경 없음.

남은 것은 원 BOM의 실제 오래된 값 쓰기와 원 AS 실패 GET의 종료 주체·이유다. 이번 BOM4건의 정상 관측과 AS 초기11조회200으로 대신할 수 없다. 같은 조건 반복·추측 패치로 이어가지 않으며, 향후 추가 실행은 이번에 소진한 한도를 새 폴더명으로 우회하지 않는다. 새로운 실패 원문 또는 별도로 정한 구체적 판별 조건이 필요하다.
