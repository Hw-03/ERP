# BOM 입력·AS 조회 오류 조사 결과

**판정: 두 원인은 아직 미확정이다. 제품 수정이나 병합 가능 판정을 하지 않았다.**

기록 범위는 2026-10-19의 격리 진단이다. 원 실패와 새 정상 관측을 함께 보존한다. 정상 관측 횟수를 원인 해결이나 새 전체 기대값 PASS로 바꾸지 않는다.

| 문제 | 확인한 사실 | 확인하지 못한 것 | 직원 업무 영향 판단 |
|---|---|---|---|
| BOM에2·3 입력 후1이 전달됨 | 원 CI는 fill 호출이 끝났지만 실제 화면·매칭 본문은1이었다. 새 Linux/CI 관측은 native 입력→React→상태→매칭·저장까지2·3 유지 | 원 실패에서 native 입력이 도착했는지, 순간 상태 변경이 있었는지. 제품·자동화 원인 분류 | 새 조건에서는 정상이나 직원에게 절대 발생하지 않는다고 단정할 근거는 없음 |
| AS·연구 제출 후 조회 연결 끊김 | 원 제출은201이고 후속 상세·초안 조회가 Next upstream read ECONNRESET로 실패했다. 새 동일 버전 CI에서는 제출/조회/승인·재고 단언 통과 | 실패 소켓의 배정·FIN/RST 순서·종료 주체, 당시 지연 원인. 만료 연결 재사용 여부 | 제출 성공과 후속 조회 실패를 구분해야 함. 실제 요청 저장 실패나 재고 계산 오류로 확인된 것은 아님. 직원 환경에서의 연결 실패 가능성도 배제하지 않음 |

## 실행 환경과 보존 범위

- 시작 후보: `codex/mes-main-candidate-comparison-20261016`, `782eb344ab0360db93ecc38821b355a2375b1980`.
- 제품 소스·기존 시험·lockfile·설정의 시작 해시는 `D/preflight.json`에 있다. 기존 AS 완료창 문구 수정은 별도 미커밋 변경으로 보존했으며 이번 원인 수정으로 세지 않는다.
- 로컬 진단은 WSL Ubuntu26.04의 같은 호스트에서 브라우저·Next·백엔드·실행기를 사용했다. CI는 Ubuntu24.04.5, Node20.20.2, Python3.11.17, Playwright1.60.0/Chromium1223이며 의존성·이미지 차이는 각 `environment.json`에 기록했다.
- 업무 자료는 새 합성 `mes_e2e.db`뿐이다. 실제 직원 DB·사용자 후보3038/8038·기존 BOM 초안·연구 요청을 재현이나 초기화에 사용하지 않았다. main·직원 서버·예약을 변경하지 않았다.
- **D** = `C:/Users/user/.codex/worktrees/mes-main-candidate-comparison/ERP/_attic/runtime/flaky-diagnosis-20261019-0902`.
- **R** = `C:/ERP/_attic/runtime/main-candidate-20261016`. 원 실패의 정제 시간축은 `R/diagnosis-20261017/io/saved-trace-timeline.json`, 원 입력 snapshot 분석은 `R/diagnosis-20261017/bom/ci-input-ancestors.json`, `trace-reconstructed-inputs.json`이다. 원문 trace·로그는 기존 위치에 보존했다.

## BOM: 입력부터 저장까지 무엇을 보았는가

1. 원 `SHIP-VARIANT`와 `SHIP-GENERATED-ROLES`의 품목 생성·로그인·입력 순서와 단언을 유지했다. 수량 필드는 `data-bom-line-child`의 실제 품목과 `shipping-bom-line-controls`로 선택하며,2/3 입력 직후 다음 단계로 이동한다.
2. 원 실패 trace의 fill 인자는 DOM에 값이 들어갔다는 관측이 아니다. VAR fill은167.343ms, GEN은172.733ms 걸렸고 종료 후 각각9.090/17.282ms의 snapshot은1이었다. native 이벤트와 React 변경 처리 기록이 없어 그 사이를 추정하지 않는다.
3. 원 input/after snapshot의 대상 표시와 page/frame/URL은 유지됐다. HTML·BODY를 포함한 조상에 inert/hidden, input에 disabled/readonly가 없었고 같은 품목의 숨겨진 복제 입력도 없었다. 순간 상태와 계산된 CSS까지 관측한 것은 아니다.
4. 새 관측에서는 native focus/beforeinput/input, React 값·품목 key, 각 setter와 commit, 매칭 본문 및 실제 저장 응답을 연결했다. 잘못된 재입력·sleep·허용 오차·재시도는 추가하지 않았다.
5. 로컬 최초 두 선택자 각3회와 CI39181286366의 각3회 모두 정상이다. CI의 repeat-each3은 worker0/1/2로 새 브라우저였으므로 브라우저 누적 상태의 증거가 아니다.
6. CI39182577349에서는 원 파일의 `DISCARD → VARIANT → CANDIDATE-DRIFT → GENERATED-ROLES`를 같은 worker0에서 각각1회 실행했다. VAR2/GEN3은 native→React→commit→매칭→저장 요청/201 응답까지 유지됐다. 모든 ring의 dropped0·warnings 없음이다.
7. React 계측의 setter wrapper/layout effect가 타이밍에 영향을 줄 가능성은 남는다. 제품 파일을 쓰지 않는 native 관측 대조의 결과는 아래 실행 원장에 별도로 남긴다. native/fetch observer 자체의 영향이0이라고 주장하지 않는다.
8. CI39183694728의 native-only 대조에서 `SHIP-DISCARD`가 요청 메모 없음으로 실패했다. VAR/DRIFT/GEN은 첫 실패 중단으로 미실행이다. 제품 파일 원형 SHA256은 적용 전후 동일했다. 메모 fill 중 같은 textarea UID7에 focusin→beforeinput→input과 window-bubble을 관측했고 defaultPrevented=false, focus 유지였다. fill 종료 약11ms 뒤 snapshot과 다음 클릭 전 snapshot은 빈값이다. 단 메모 본문·React 값은 당시 개인정보 가드로 수집하지 않아, 입력 시점의 빈값과 제품 복원을 아직 구분하지 못한다. 이 신규 입력 실패의 값/tracker/React props를 내용 없는 길이·동일성으로 보강하며 원 BOM과 같은 원인이라고 미리 단정하지 않는다.
9. 보강된 observer의 CI39185603420 attempt1~3은 각각 준비1건과 같은 worker의4조건을 통과했다. 테스트 retry/skip0, ring dropped/warnings0이며 제품 소스 원형 SHA256도 유지됐다. 수량2/3과 메모는 capture에서 DOM에 들어온 뒤 window-bubble에서 tracker·현재 React props까지 반영됐다. 이 관측 조건은 사전 한도3회에 도달해 반복을 종료했다. 값 경계를 보강한 뒤에는 실패 순간이 잡히지 않았으므로 원인 해결이나 자동화 문제 확정으로 표시하지 않는다.
10. 전역 입력을 먼저 받는 `useIdleOperatorConfirmation.ts:55,121`의 같은 null 상태 갱신도 읽기 조사했다. 실제 호출자는 `login/MesLoginGate.tsx:59`이고 자식 화면을 그대로 받는다. 설치된 React는 Gate 자체에 대기 lane이 없고 같은 상태이면 예약을 생략한다. 자식 BOM 응답의 lane만으로는 이 조건을 깨지 못하므로 유휴 기능을 원인으로 고치지 않았다.
11. 별도 DB 없는 작은 화면에서 같은 React와 실제 유휴 훅을 사용해 입력 전달 기전을 대조했다. 추가 갱신이 없는 조건은 fill/Playwright 키보드 모두2가 유지됐다. 진단 코드가 native input capture에 자식 상태 갱신을 **인위적으로 예약한** 조건은 DOM2→중간 commit1→bubble1이 되고 onChange가 실행되지 않았다. 이 현상은 유휴 훅을 비활성화해도 같았다. 따라서 이런 입력 유실 기전이 fill에만 한정되지 않고 Playwright의 `page.keyboard.type`에서도 발생하는 것은 확인했지만, 실제 사람의 입력이나 원 MES 화면이 같은 갱신을 예약했다는 증거는 아니다. 이 진단용 실패를 원 BOM 재현이나 직원 결함 확정으로 세지 않는다. 원문 `D/bom/capture-mechanism-02-result.json`, 재현 코드 `D/bom/capture-probe.tsx`, `run-capture-probe.cjs`.

작은 화면은 development 번들의 단일 `type=text` controlled input 실험이다. 실제 BOM 숫자 입력·메모 textarea·Next production 화면을 재현한 것은 아니다. 이 기전은 React의 [native capture 상태 갱신과 controlled 입력에 관한 이슈](https://github.com/react/react/issues/12643)와도 일치한다. 과거 이슈의 존재를 현재 MES 실패의 원인 증거로 대신하지 않았다. 첫 작은 화면 준비는 번들에 브라우저용 API 환경 상수를 제공하지 못해 준비 기한 내 probe가 생성되지 않았다(`capture-mechanism-01`). 진단 번들의 환경 상수를 보완한02와 구분하며 제품 실패로 세지 않는다.

이 검사는 BOM·출하 요청의 수량 보존을 확인한다. 실제 픽업·실물 재고 증감·취소 전체를 새로 검사한 것은 아니며, 해당 조건은 기존 업무 근거의 범위를 따른다. 원본 기본 BOM 불변 단언은 원 선택자에서 유지했다.

## AS·연구: 저장 성공과 조회 실패의 경계

1. 원 `IO-RESEARCH-RETURNS`를 그대로 사용한다. 합성 연구 요청자, 결재 담당자, 조립의 상위AA·선택AR·미선택AR를 만들고, 브라우저에서 AS·연구 사용출고→연구→조립 BOM→상위 차감·하위 반환→선택 하위만 재입고→결재 요청을 수행한다.
2. 제출은1회/201, 상세와 초안 조회, 실제 결재 UI를 확인한다. 첫 승인 뒤 조립은7/7/7, 최종 연결 승인 뒤6/9/7이며 창고·미선택 하위·격리 수량 불변, 선택 하위 거래7→9를 검사한다. 원 시험의 정리 취소는 유지하지만 새 전체 취소 정합성 검사로 확대하지 않는다.
3. 원 실패 시각: submit201 완료11:01:16.938958Z, browser drafts 시작16.980Z, 상세 시작17.097Z, reset 로그17.550873/17.568757Z. 약5초 후보인 이전 응답부터 GET 시작까지는4.46/4.58초, reset까지5.03/5.05초다. 클라이언트 HAR 시각은 실제 backend 응답·전송 시각과 다르며 원 upstream socket ID가 없다.
4. 새 기본 CI3회는 원 read errno-104/syscall-read 오류0, input gap0, backend 예외0이다. 별도의 화면 이탈/소켓 destroy 오류38개는 원 실패와 구분했다. 모든 오류 이름을 같은 원인으로 묶지 않는다.
5. 원 `/items` 응답은286개·294,523바이트·671.747ms였고 초기 새 CI는5개였다. 원 공정 분포에 맞춘 합성 배경281개와 seed2개, 원 시험3개로286개를 만들었다. 과거 재고·거래·예약·BOM 관계를 복제한 것은 아니다.
6. CI39183151452의 실제 제출 후 `/items`는286개·284,086바이트·83.859ms였다. 공정별 개수는 일치하지만 약8배 빨라 원 지연 조건까지 재현하지 못했다. submit78ms/201, 최초 drafts200은 완료84ms 뒤, 두 상세200은180/193ms 뒤였다.
7. 그 실행의 최초 drafts 재사용 idle은3.904초, 상세는35.54/5.71ms였다. 원 read reset0·packet drop0·input gap0·backend 예외0이다.18개 JS/destroy reset은 원 오류와 구분했다. 실패한 만료 경계 소켓은 이번에도 관측하지 못했다.
8. 원 실패 trace 자체의 제출 직전 품목 조회는103.391ms(대기92.757ms), 직후는671.747ms(대기668.221ms)였다. 두 응답의286개 품목 ID는 같고 상위1개 품목의 예약·가용 수량4필드만 바뀌었다. 따라서 누적 품목·BOM 자료가 항상 느린 원인이라고 설명할 수 없다. 읽기 대조 원문은 `D/io/original-items-before-after.json`, 원 trace의 `1-trace.network:208,216`이다. 일시 지연의 주체는 여전히 미확정이다.
9. 원 두 GET을 정상 화면 이탈 취소로 분류할 수 없다. 원 trace `0-trace.trace:261`의 상세 GET은 예외가 아니라 status500 APIResponse이며, `:276`의 같은 ID 재조회는200이다. 브라우저 drafts는 `1-trace.network:213`에서500·본문21바이트를 실제 수신했고 `_failureText`가 없다. 같은 trace의 실제 취소 BOM GET(`:189`)은 status=-1·`net::ERR_ABORTED`로 구별된다. `DesktopWarehouseView.tsx:192`의 cleanup은 결과 반영만 중단하며 `frontend/lib/api/io.ts:77`은 AbortSignal을 전달하지 않는다.
10. 실제 Next의 내장 httpxy와 Node20.20.2 종료 경로도 읽어 대조했다. downstream close의 인수 없는 `proxyReq.destroy()`가 만드는 `socket hang up`에는 원 오류의 errno=-104/syscall=read가 없다. 원 서명은 OS read 오류 경로와 맞으며, 정상 응답 완료 뒤의 늦은 destroy에는 다음 요청 소켓을 보호하는 Node 상태 검사가 있다. 다만 실패한 실제 소켓의 기록이 없어 reset 주체까지 확정하지 않는다. 기존 Linux 실험은 이미 Next 프록시와 같은 프로세스를700ms 막고 자연 keepalive 만료를 관측했다. 그 결과는 EOF 오류였으며,600ms로 바꿔 반복하는 것을 새로운 원인 증거로 삼지 않았다.
11. 원 실행38886739485의 원격 artifact 목록·전체 job 로그·실패 첨부까지 추가 조사했다. 서버 stderr·파일 로그·실패 순간 프로세스/TCP 기록은 없다. 당시 `frontend/tests/e2e/global-setup.ts:204`의 백엔드 기동은 stdio를 버렸고, workflow는 Playwright 보고서를 업로드했다. 원 실행의 미보존 로그를 뒤늦게 복원할 수 없다. 별도의500/반복 정상 관측만으로 서버 예외·프로세스 종료·만료 연결 재사용 중 하나를 선택하지 않는다.

자연 keepalive 종료 때 커널에 읽지 않은 요청이 남아 있으면 RST가 생길 수 있으나 이번 원 CI에서 발생했다고 증명하지 못했다. Uvicorn은 data_received 진입 시 timer를 먼저 취소한다. 일반 서버 CPU 지연만으로 timer가 앞섰다고 단정할 수 없으며, 기존 EOF 실험도 원 read ECONNRESET의 대체 증거가 아니다.

## 실행 원장과 정확한 근거

| 실행 | 대상·결과 | 원문 경로 |
|---|---|---|
| 로컬 최초 | VAR3·GEN3·IO3 통과, 실제 앱 준비 통과 | `D/linux-artifacts/bom-observed-01`, `bom-variant-03`, `bom-generated-01`, `io-research-01`, `io-research-01-net` |
| 로컬 선행 조건 | DISCARD→VAR→GEN3통과,101개 준비+IO2통과 | `D/linux-artifacts/bom-after-discard-01`, `io-after-items-01`, `io-after-items-01-net` |
| CI39181180800 | workflow 컨텍스트 사용 오류로 job 준비 전 실패. 수정 후actionlint통과 | `1bb420d5` 실패와 `4cfee12b` 수정 이력. 제품 실패로 세지 않음 |
| [CI39181286366](https://github.com/Hw-03/ERP/actions/runs/39181286366) | 준비1+원 선택자9통과, 원인 미확정 | `D/ci-39181286366/run-summary.json`, 각 batch의 `report.json`·trace·BOM ring·Node/Python/TCP/PID 기록 |
| [CI39182577349](https://github.com/Hw-03/ERP/actions/runs/39182577349) | BOM선행4통과. IO준비 단언 오류1실패, 원IO미실행 | `D/ci-39182577349/bom-original-precursors`, `io-original-item-scale`, `D/ci-39182577349-failed.log` |
| 로컬 준비 수정 확인 | POST plain 응답 대신 GET의 모델 슬롯을 확인.281생성·283목록·재고0·분포1건 통과 | `D/linux-artifacts/item-shape-preparation-01/report.json`, `runner.log`, synthetic-item-shape 첨부 |
| [CI39183151452](https://github.com/Hw-03/ERP/actions/runs/39183151452) | 준비1+원IO1통과. IO를2회 실행한 것이 아님 | `D/ci-39183151452/io-original-item-scale`: `report.json`, `batch-result.json`, `io-report/summary.json`, `next-http.jsonl`, `backend-protocol.jsonl`, `packets.jsonl`, `test-results/**/trace.zip` |
| [CI39183694728](https://github.com/Hw-03/ERP/actions/runs/39183694728) | 준비1통과. 제품 소스 그대로 native 관측 중 DISCARD 메모1실패, 뒤 BOM3조건 미실행 | `D/ci-39183694728/bom-patch.json`, `bom-native-only-precursors/report.json`, `test-results/**/trace.zip`, bom-boundary-ring 첨부. 원 BOM 수량 실패 재현으로 세지 않음 |
| [CI39185603420 attempt1](https://github.com/Hw-03/ERP/actions/runs/39185603420/attempts/1) | 후보121706c3의 준비1+같은 worker4조건 통과. 메모 길이10, BOM2/3이 capture의 DOM값→bubble의 tracker·React값에 반영됨 | `D/ci-39185603420-1`: ring warnings0/dropped0. 제품 소스 불변. 가드3건/Node 구문 통과. 원인 해결은 아님 |
| [CI39185603420 attempt2](https://github.com/Hw-03/ERP/actions/runs/39185603420/attempts/2) | 같은 관측 설정에서 준비1+4조건 통과. 수량2/3·메모가 DOM→tracker·React props까지 유지 | `D/ci-39185603420-2`: retry/skip0, ring warnings0/dropped0. 실패 순간은 미포착 |
| [CI39185603420 attempt3](https://github.com/Hw-03/ERP/actions/runs/39185603420/attempts/3) | 마지막 사전 관측도 준비1+4조건 통과. 같은 조건 반복 종료 | `D/ci-39185603420-3`: retry/skip0, worker0, ring warnings0/dropped0, 제품 소스 불변. 테스트 내부 재시도가 아니라 별도 실행3회로 구분 |

진단 가드16건(Linux, skip0), 관련 Python/Node/TS 구문·workflow actionlint를 확인했다. 범위가 변하지 않은 이전 전체 백엔드·프론트·빌드·성능·복구 근거는 다시 실행하지 않았다. 이를 이번 진단 HEAD의 전체 CI 성공으로 표현하지 않는다.

## 현재 남은 조건

- BOM 원 실패의 native 입력·focus·React/state 순서가 연결된 결정적 기록.
- AS 원 실패와 같은 socket의 실제 재사용, 종료·RST·서버/프록시 지연 순서.
- 원인에 맞는 수정 전 실패→수정 후 성공 대조와 재발 방지 검사. 현재는 제품 원인을 확정하지 못해 이 단계로 진행하지 않았다.
- 직원 영향 분류와 병합 판단. 현재는 **미확정·병합 보류**다. 반복 통과만으로 확정하지 않는다.

## 안전한 중간 종료와 재개 조건

- **요청한 최종 완료 기준은 미충족이다.** 원인에 맞는 제품 수정·수정 전후 회귀 검증을 완료했다고 보고하지 않는다. 추가 실패 시점을 관측해야 하는 단계이며, 같은 정상 조건 반복이나 임의 부하 주입을 다음 행동으로 두지 않는다.
- 후보/원격 진단 HEAD는 `121706c3f7f578dc236665512677d94f0f62f95d`다. 시작782eb344부터 이 HEAD까지 `frontend/`, `backend/`의 커밋 변경은 없다. 이미 있던 AS 완료 문구 수정은 별도 작업 파일로 보존했다. 진단 source·lockfile·설정10개는 시작 해시와 동일하다(`D/checkpoint-1051.json`).
- 독립 조사 결과도 원 로그의 공백과 인과 증거 부족을 확인했다. 다음에 원 실패가 관측되면 BOM은 **native DOM→tracker/React props→commit**, AS는 **같은 실제 소켓의 요청→FIN/RST→프로세스/서버 예외**부터 읽는다. 서로 다른 실패를 같은 원인으로 합치지 않는다. 원 업무 선택자와 새 관측 도구는 이미 준비되어 있다.
- 진단3100/8021 및 작은 화면3153의 소유 프로세스는 종료했다. 사용자 화면의 기존3038 프론트 PID43536이 확인 시점에 이미 종료돼 있었고 로그에 종료 이유는 없었다. 기존 빌드 그대로 프론트만 PID46916으로 복원했으며, backend10744·boot와 DB bytes는 동일했다. 빌드 재생성·화면 이동·입력·요청 초기화는 하지 않았다. `D/review-frontend-restore-result.json`, `review-frontend-restored.log`와 보존한 기존 session을 따른다. 이 검토 프론트 종료 원인도 원 AS 오류에 연결할 근거는 없다.
- main `29583972129c8340aa19416e6c554ea60db3c490`, 직원 서버·DB·예약은 변경하지 않았다. 원본 실패·현재 정상·진단 준비 실패를 모두 보존했다. 전체 업무 테스트·production 빌드·성능·복구·전체 기대값은 재실행하지 않았다.
