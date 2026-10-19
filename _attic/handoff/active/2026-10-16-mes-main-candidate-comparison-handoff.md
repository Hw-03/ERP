# main·후보 비교 — 현재 재개 지점

## 2026-10-20 승인 후 재개

병합 c2f8d3f5 후보 push 완료, 첫 CI39335133787의 프론트3파일11실패를 조사했다. 정렬 combobox→버튼, 목록→격리 목록, useAccessRevocationLeave mock 누락. 테스트3파일만 수정 후39건·관련 ESLint 확인, 제품 변경 없음. 다음은 수정 commit/push 및 새 HEAD CI. 원장 registry에 세 파일 참조 없음. 기존 전체 검증을 재실행하지 않는다.

사용자가3.30MiB 조정을 승인했다. bundle-approved.log의 도구3검사·실제3.271MiB 게이트 통과. fetch 후 origin/main9824903e 동일, 병합 충돌 없음. 제품 소스/빌드 입력 불변으로 기존 검사·production 빌드를 재사용한다. 아래 번들 차단은 해제됐다. 다음은 병합 커밋·후보 push·최종 CI이며 main·직원 변경은 계속 금지한다.

## 최신 진행 — 2026-10-19 main을 후보에 통합, 번들 결정 대기

- 아래 과거 종료 기록의 커밋/푸시 금지는 당시 진단 범위다. 이번 승인 범위는 후보에 main 결합·후보 push·최종 CI이며 main/직원 변경은 금지한다.
- W=`C:/Users/user/.codex/worktrees/mes-main-candidate-comparison/ERP`, 후보 `codex/mes-main-candidate-comparison-20261016`, HEAD=e9f98f19, MERGE_HEAD=9824903eee733e352b90bdf381bd08b8373271ef. 충돌20파일 해결·stage, merge commit 전.
- R=`W/_attic/runtime/integration-main-20261019`. 기존 변경53개·DB 온라인 백업은 preflight.json/working-files/review-before.db. 새 권한/BOM 경합 RED→GREEN, 백엔드375·관련 프론트·타입/ESLint·복제 DB·production 빌드 통과. 정확한 근거와 범위는 [결과](../../../docs/superpowers/plans/2026-10-19-mes-candidate-main-integration-results.md).
- 브라우저 QA3039 종료. 사용자3038/8038은 원래B/qa.db로 production 재기동. 원 DB SHA256 bddc1c4f61c04fa2ecf3479b6e8d737886cb18f399ee24a005e1cd97a7716376 불변, 기동 전후 행 동일. 원래 사용자 탭·BOM 초안·연구 요청 유지.
- 현재 단계: 변경된 기대값 테스트의 hash/line 연결 갱신 및 마지막 check 통과(ledger-final.log). 추가 불량 장바구니68검사도 통과(defect-cart-final.log). 과거 binding/실행 기록은 보존하고 전체 NOT_RUN 상태를 임의 PASS로 바꾸지 않았다.
- 차단: 번들3,430,232바이트(3.271MiB)가3.25MiB 초과. 3.30MiB 승인 질문 답변 대기. 답변 전 상한 변경 금지.
- 다음: 원장 check 확인 → 번들 답변 반영 후 해당 검사만 → 날짜/cached check/merge commit → main 최신 여부 확인 → 후보만 push·최종 CI. main과 직원 배포 금지. 과거 BOM/AS 원인 조사는 재개하지 않는다.
- 재사용: R의 유효한 국소 실행들, 이전 관측 도구 검사. 전체 백엔드/E2E/성능/복구를 다시 실행하지 않는다. 변경된 검증 입력을 과거 전체 PASS로 승격하지 않는다.

## 최신 종료 — 2026-10-19 17:34 관측 도구 신뢰성 보완 완료

- [계획](../../../docs/superpowers/plans/2026-10-19-mes-observation-reliability.md)·[결과](../../../docs/superpowers/plans/2026-10-19-mes-observation-reliability-results.md). 후보 HEAD63d4ed59·기존 미커밋 변경 보존. R=`W/_attic/runtime/flaky-observation-reliability-20261019-165811`.
- 코드·환경: W=`C:/Users/user/.codex/worktrees/mes-main-candidate-comparison/ERP`, 브랜치 `codex/mes-main-candidate-comparison-20261016`, HEAD63d4ed59, main 참조f4f9d8d3. Linux L=`/home/hw/mes-observation-reliability-20261019-165811`, Node20.20.2/Python3.11.17/Next16.3.4/Chromium1223. 이번 도구 probe는 업무 DB가 없다.
- 완료: 초기 Windows AS50/후속26·BOM37을 보존하고 고정 Linux Node20/Python3.11에 맞춰 AS51, packet25, kernel20, BOM36+국소1 통과. BOM 한 건은 Windows esbuild 참조의 준비 오류여서 Linux 의존성으로 해당1건만 재확인했다. 소스 수정 없음. 실제 React off/on/on-reviewed·원2선택자 `--list`, 실제 Next worker PID694의 고정 GET2·업무/DB0·양방향 data·drop0·최종 ACK 확인. 원문 `R/verification-index.json`, 각 unit폴더와 `linux-evidence`.
- 종료 지점: 승인한 도구 CP0~4 완료, 소스 동결·미커밋. 실제 Next 이후 바뀐 종료 상태 두 파일은26검사로 연결했고 정상 probe를 반복하지 않았다. 보호3038 PID46916/8038 PID10744, DB/session·lockfile·기존 문구·main/HEAD 불변. 진단3100/8021 해제. `R/final-audit.json`, `R/postflight-ports.json`.
- 다음 행동: 현재는 실행을 마친다. 다른 작업에서 원 BOM 검사가 필요할 때만 새 전체 합성 gitless export에 passive를 연결한다. 상세 결과의 5단계 활성 절차를 따르고 이번 L/source 부분 probe 사본을 업무에 재사용하지 않는다. 별도 반복/예약/CI 금지.
- 미확인·주의: 원AS read/-104의 실패 소켓/종료 이유, 원BOM 값 출처는 계속 미확정. 실제 Next 검사는 development이고 실제 BPF는 새로 실행하지 않았다. 표준 trace/화면/DB에는 자료가 담길 수 있어 ignored 로컬 보관. 도구 PASS를 직원 결함 해결·병합 가능으로 승격하지 않는다.
- 금지: AS 업무 구간·원 BOM 선택자·전체 검사 재실행, 커밋·푸시·새 CI, main·직원·실DB·예약 변경.
- 재사용: 이전 AS snapshot 대기 제거, BOM fill/키 2·3 네 조건, SSE·RSC 대조. 과거 원인은 계속 미확정이고 이번 완료를 제품 해결/병합 가능으로 바꾸지 않는다.

## 최신 종료 — 2026-10-19 16:18 입력 전달 조사 한도 종료

- W=`C:/Users/user/.codex/worktrees/mes-main-candidate-comparison/ERP`; 후보 `codex/mes-main-candidate-comparison-20261016`, HEAD63d4ed59. 기존미커밋AS문구/도구/문서는보존했다. 커밋·푸시·CI는이번범위아님.
- 새계획/결과=`docs/superpowers/plans/2026-10-19-mes-input-transport-{diagnosis,results}.md`. R=`W/_attic/runtime/flaky-input-transport-20261019-154319`; preflight/기존patch/미추적원본보존완료.
- L=`/home/hw/mes-flaky-input-transport-20261019-154319`; source=`L/source`; DB=`source/backend/mes_e2e.db`; 전용3100/8021. 이전Linux사본/원문은보존.
- 완료: AS 도구32검사·무업무 probe03 통과. 실제 worker PID628/run/socket 관측 확인 후 요청 구간1회 종료. 36응답·제출201·초안/상세200·client발행 최대7.385ms. Next 수신14건20ms초과/최대170.5ms와packet drop2로 조건 미충족. 원 실패 없음. L/as/preparation-01 및 R/linux-evidence/as/preparation-01/analysis.json, R/as-evidence-index-50.json에 보존. 소유 서버 종료, 추가 AS 요청 실행 금지.
- BOM 완료: 무업무 off/on 동일값2·변경1회·업무요청0. 첫 앱 준비 `L/bom/q2-fill`의 helper 누락은 입력전 실패로 보존·의존 검사 보완. `L/bom/ready-02/{q2-fill,q2-key,q3-key,q3-fill}` 최초 네 입력 모두1회 정상, protocol/native/React/updater/render/match 연결·손실0·pause0. 같은 구조의 R/linux-evidence/bom/ready-02에 원문, R/bom-evidence-index-97.json에 SHA. 최종 저장·재고·취소는 미실행.
- 현재 정확한 단계: 새 AS1구간·BOM4조건 한도 종료, 진단 프로세스 없음. CP0/1/2/4 실행·기록 완료4/5, CP3 원 제품 원인·수정효과는 미완료. 후속 반복·추측 제품 패치를 시작하지 않는다.
- 다음 행동: 새 원 실패 자료가 생기면 BOM 최초 writer와 값 출처 또는 AS 실패 GET/socket/종료 이유부터 읽는다. 새 판별 조건이 별도로 정해진 경우만 추가 실행한다. 기존 SSE·이번 입력4조건·AS구간·전체 검사·CI를 반복하지 않는다.
- AS 도구 한계: Next 수신20ms 초과는 모든 요청 후 평가되어 첫 초과 중단이 되지 않았다. 36요청 모두 발행됐고 조건 미충족으로 남긴다. 클라이언트 발행 가드는 정상 동작했으며 제품 해결로 표시하지 않는다.
- 재사용: 기존kernel/소켓수집·실패보존·원manifest·동일제품업무근거. AS사전snapshot53ms는도구문제근거이며원reset귀속아님. 원BOM/AS미확정·병합보류유지.
- 보호: main·직원·예약·사용자3038/8038·BOM초안·연구요청에쓰기/종료없음. 아래이전종료지점은과거기록이다.
- 종료 근거: R/postflight.json. 후보 HEAD·main ref·3038 PID46916/8038 PID10744·보호 DB/session 해시 유지, 이번 제품 코드 변경0, Linux 제품/Playwright 원본 불변, 진단3100/8021 해제. 도구 unit 원문/세션 근거는 R/tool-checks, 실제 probe는 R/linux-evidence/tool-checks. 제품 원인이나 전체 기대값 PASS로 확대하지 않는다.

## 가장 최신 재개 지점 — 2026-10-19 직접 경계 계획 승인 후

- 15:12 KST 현재 상태는 **진행 불가**다. 마지막 실제 새 근거(아래 snapshot await 확인) 이후3회 후속 확인에서 원실패 경계 부재와 실행 한도 소진이 같았다. `R/tool-checks/no-progress-after-1506-{01,02,03}.json`의 최종감사에서 HEAD/원문 불변·진단PID 없음·CI terminal 확인. 원인 분류/수정/회귀 검증은 미완료다. 새 실제 실패 기록 또는 별도로 정한 추가 실행 범위가 오기 전 같은 재생·CI·추측 제품 수정을 시작하지 않는다. 사용자3038/8038과 원문은 보존한다.

- 새 승인 [계획](../../../docs/superpowers/plans/2026-10-19-mes-direct-boundary-diagnosis.md)과 [결과](../../../docs/superpowers/plans/2026-10-19-mes-direct-boundary-results.md)를 따른다. 아래13:42 진행 불가 기록은 이전 실행의 결과이며 이번 새 조건 승인을 취소하는 지시가 아니다.
- 후보HEAD63d4ed59·기존 AS 문구/문서 미커밋 보존. R=`_attic/runtime/flaky-boundaries-20261019-135838`, Linux=`/home/hw/mes-flaky-boundaries-20261019-135838/source`, 합성DB/3100·8021. 사용자3038/8038·DB·초안·연구 요청 및 main·직원 환경은 금지 대상.
- 완료: CP0 보존, BOM 준비03 통과 뒤 네 승인 조건 각1회 정상 관측. 수량2·3의 native→React/updater→렌더→매칭·다음 상태 일치, 실제 저장/SSE/재조회 확인. `Linux/bom/<조건>/admission.json`에 시각·소스 원문 해시, 같은 폴더에 trace·DB 보존. 실패 미재현으로 BOM 같은 조건 재실행 금지. 실제 최종 요청 저장은 이번 범위 미실행.
- AS 첫 준비: `Linux/as/segment-01`은 시계10ms 가드에서 중단했고 marker가 없어 시간표 구간0회. 커널은 signal_generate PID변환 오류12건으로 usable:false. 두 준비 문제의 원문 보존, 같은 CDP 시계/원측정값 기록과 init sender 기록만 보완. 시계3건·kernel8건 국소 검사와 실제3154 커널 자체 검사 통과. 제품 실패 해결로 세지 않는다.
- 최종 AS: `Linux/as/preparation-02`에서 시계3.416/2.106ms 준비 통과 후 marker 생성·구간1회 시작. 첫 b196발행표식+83.886ms/Next수신+106.625ms로20ms 초과, 초기11GET200만 수집하고 나머지25요청(제출/문제초안/상세 포함) 중단. status/qualification=CONDITION_NOT_MET, transport/HTTP first_failure=null. 커널775이벤트/유실0, 구간RST0. 원AS 원인은 미확정이며 같은 구간 재생 금지.
- 별도 관측 도구 결함: 설치 Next16.3.4가 두 `--require` 중 마지막 것만 worker에 전달해 공용 HTTP 관측이 누락됐다. `io/replay-preload.cjs` 하나에서 두 모듈을 로딩하도록 보완, 실제 Next parser→일반 자식 Node에서 기존 미로딩/새 로딩 대조 통과(`R/tool-checks/as-preload.json`). 사전 red는 새 로더 미생성 오류이며 원AS 재현이 아니다. 서버/HTTP 재실행 없음. R/run-as.py만 향후 로더를 변경했고 실제 실행본은 `R/executed-preparation-02-run-as.py` SHA256 `42a1592d9a54b2b471f0a75583258208ca509a75f272a3d5c96704dd33382a1e`로 보존했다. 원AS 해결·이전 기록 복원으로 표시하지 않는다.
- 15:06 읽기 증거: `R/tool-checks/as-snapshot-dispatch-readonly.json`. 원문 trace와 설치 Playwright1.60의 동일 coreBundle 해시를 대조, 첫 `page.evaluate` 시작→실제 요청 실행 전 기다리는 before snapshot 기록이53.021ms(순수 수집31.5ms)였다. 초기11호출 모두 이 경로다. 재생 도구의 20ms 조건 실패에 기여한 사전 대기는 확인했으나 원AS reset·전체84ms의 단일 원인은 아니다. 새 업무/서버/브라우저/검사0회. 향후 별도 승인된 재생은 per-fetch snapshot await를 요청 발행 경로와 분리해야 하며 같은 driver 반복·20ms 완화는 근거가 없다. 원 두 원인 해결·병합 상태는 그대로다.
- 정확한 종료 지점: 요청 구간1회·BOM4조건 한도 소진. 소유3100/8021/3154 종료, 사용자3038/8038·DB/session 해시·제품 소스 불변(`R/postflight.json`). 결과원문은 `R/linux-results`에249파일60,723,196바이트 SHA대조 복사, 목록=`R/copied-evidence-hashes.json`. AS독립읽기감사=`R/tool-checks/as-attempt-audit.json`. BOM 도구13건/AS 국소 도구/커널8건+실제자체검사는 해당 source 근거로만 재사용한다.
- 다음 행동: 같은 검사·시간 허용값 완화·추측 제품 패치를 하지 않는다. 새 실패 원문이 생기면 BOM 실제 writer/상태 출처, AS 해당GET·socket·종료주체부터 읽는다. 추가 실행은 새 구체적 판별 조건과 한도를 정한 뒤에만 진행하며 이번 marker를 지우거나 폴더명을 바꿔 한도를 우회하지 않는다. 현재는 CP2·CP3 미완료, 두 원인 해결/병합 가능 판정 없음.
- 원인·직원 영향은 미확정. 새 재현 결함의 해결과 원CI의 귀속은 분리한다. 이전 native/kernel/보존 검사와 유효 업무 근거는 재사용한다. 새 제품 패치·커밋/푸시 없음.

## 가장 최신 재개 지점 — 2026-10-19 13:42 KST

- 현재 단계는 **진행 불가 판정**이다. 원인 판별 자료 부재가 마지막 새 근거 뒤3개 후속 턴에서 계속됐다. 진단CI39195321428은 terminal failure, 새 HEAD 진단은 skipped·일반CI cancelled이며 새 실행/실패 자료가 없다. 목표 완료가 아니고 CP3 원인·수정·회귀 검증은 미충족이다. `flaky-capture-20261019/no-progress-audit-*.json`의 마지막 기록과 결과13:42절을 따른다.
- 다음 행동: 새 원 실패의 native/React/writer 기록 또는 AS read/-104 실제 upstream socket·종료 주체 기록이 확보되면 그 기록부터 분석한다. 다른 구체적 판별 조건이 새로 정해져 실행 승인될 때만 추가 관측한다. 같은 일반 묶음·정상 선택자·인위 상태/RST·추측 패치는 반복하지 않는다. 과거 계획의 “다음 실행”을 현재 승인으로 되살리지 않는다. 사용자 검토3038/8038·자료는 남겨 두었다.

- 후보 `codex/mes-main-candidate-comparison-20261016`, HEAD `63d4ed59acf223e6cad62b3a360d905825d92021`. 이번 후속 작업은 ignored 진단자료와 결과4문서만 추가했다. 기존 미커밋 AS 완료 문구·이전 문서 변경을 보존했다. 새 커밋/푸시·main 통합·직원 변경은 하지 않았다.
- 13:38 추가 읽기: 원 VAR/GEN input→after snapshot의 전체 HTML cache 재사용과 설치된 snapshotter의 DOM 객체별 참조를 대조했다. 대상 입력이 새 DOM 노드로 교체됐다는 설명과 맞지 않는다. before→input·중간 값·상태 변화는 미확인이다. 제품 렌더 경로에도 단순 setItems가 key/type을 바꾸는 경로는 확인되지 않았다. 새 검사0건·제품/관측 코드 변경 없음. `catalog-response-boundary/remount-readonly-audit.json`과 [결과 13:38절](../../../docs/superpowers/plans/2026-10-19-mes-failure-capture-results.md)에 정확한 원문·소스 범위·한계 기록. AS 새 근거 없음, 두 원인 미확정 유지.
- 새 근거: 과거 VAR/GEN 실패의 두 번째 full 품목 응답 완료가 fill API 시작보다 각각 19.520/38.129ms 뒤였다. 이 API 구간 겹침은 native/React 순서 증거가 아니다. 상세와 원 zip/멤버/행은 [결과 13:30절](../../../docs/superpowers/plans/2026-10-19-mes-failure-capture-results.md)을 따른다.
- 이를 근거로 응답 도착 순서만 바꾼 국소 대조를 실행했다. before-fill은 원 VAR 1건 통과·입력 전 JSON 완료, focus는 원 VAR 1건 통과지만 JSON 완료가 input bubble 뒤 9.9ms여서 조건 미충족으로 중단. 각 retry0·worker1, native 유실0·incident0·제품 소스 해시 불변. input-bubble arm은 미실행. 전체 묶음·AS 재실행 없음. 두 원인과 직원 영향은 미확정, 제품 패치 없음, CP3 미완료.
- 현재 실행 자료: Windows `W/_attic/runtime/flaky-capture-20261019/catalog-response-boundary/linux-results`, Linux `/home/hw/mes-flaky-capture-20261019/catalog-response-boundary`. source는 Gitless 합성 사본, DB=`source/backend/mes_e2e.db`, 동일 Linux 3100/8021. 원 직원 자료·리뷰 DB는 사용하지 않았다. 기존 Node/Python/Chromium 유지. Next가 외부 node_modules 링크를 거부해 동일 설치본 약787MiB를 내부 사본으로 사용했다. 원 GitHub runner와 WSL 차이를 기록했다.
- 완료 근거: `ready-03/{before-fill,focus}/report.json`, `catalog-order.json`, `bom-boundary-extracted.json`, `response-body-audit.json`, `after-run.db`, `test-results/**/trace.zip`; `summary.json`, Windows 상위의 `copied-evidence-hashes.json`. 종료 후 CDP 본문 소실은 원 trace 원문으로만 보완했고 원 결과 JSON을 수정하지 않았다. before-fill은 읽기 감사로 조건 확인, focus의 순서 미충족은 유지한다.
- 정확한 중단 지점: `ready-03/STOP-focus.json`. 앞선 준비 실패2건은 제품 시험0개이고 보존했다. 새 업무 검사를 반복하지 않는다. 다음 행동은 새 실패/새 단서가 있을 때 실제 writer stack·React 값 또는 원 AS read/-104 socket·종료 주체를 분석하는 것이다. JSON 파싱 완료를 React commit 완료로 바꾸어 보고하지 않는다.
- 유효 재사용: 기존 일반1회 32통과/1선행실패/268미실행, 관측 도구 Python24·Node12·React off/on·kernel/보존 검사와 새 응답 보존 도구 검사. 이 정상 근거를 원인 해결·전체 PASS로 승격하지 않는다.
- 보호/종료: 13:30 확인 3038 PID46916/8038 PID10744, B DB/session 해시는 12:51 보호 기록과 같다. Windows·WSL 진단 포트3100/8021 해제. 사용자 화면·초안·연구 요청 유지. 마지막 읽기 기준 main은 다른 작업으로58dca032까지 변했으며 이 작업은 수정하거나 가져오지 않았다.

## 이전 재개 기록: 2026-10-19 12:52 실패 순간 보존 계획 실행

- 브랜치 `codex/mes-main-candidate-comparison-20261016`, 시작 HEAD121706c3. 사용자 검토3038/8038·BOM 초안·연구 요청 보존. 새 synthetic 진단3100/8021만 허용. main·직원 DB/서비스·예약 변경 금지.
- 새 [계획](../../../docs/superpowers/plans/2026-10-19-mes-failure-capture.md)과 [진행 결과](../../../docs/superpowers/plans/2026-10-19-mes-failure-capture-results.md)를 따른다. 아래11:10 차단 기록은 새 실행 승인 이전 기록이다.
- 현재 단계: 실행 후보/원격edd81fa0, 진단CI39195321428 종료·자료 읽기 분석 완료. 관측 도구/Python24/Node12·실제React/실제kernel6.17 bpftrace0.20 가드는 통과했다. 최초 일반 묶음은32통과→선행STATE01 defect 1실패→268미실행. 원AS/BOM에 도달하지 못했으므로 제품 원인은 두 건 모두 미확정이며 패치 없음.
- 원 일반 보고서의 첫 시도301개/64파일과 수집 순서 일치. 정확한 SHA 일반CI39195321547는 취소 완료. 이전 진단은 모두 업무 전 가드에서 중단했고 승인된 일반1회는 이번에 소진했다. 같은 전체 묶음 재실행 금지. 새 DB/worker에서 뒤만 실행한 것을 원 실행의 연속으로 표시하지 않는다.
- 최초 실패: `capacity-readstates.spec.ts:85–86`의 empty 전환 후 추가 GET이 200·`[]`를 받아 retry 버튼이 실제 click 전에 사라짐. 추가 GET의 직접 예약자는 미확정. 12:42:44.039 봉인 → 44.408 보존 완료 → cleanup. page.unroute/context closed는 후속 정리 오류다. Next request.error 160건은 모두 destroy 선행/errno·syscall 없음, 원 AS read/-104 서명 0. 한 연결의 Next close → TCP_ABORT_ON_CLOSE → backend reset까지 확인했으나 원 AS와 같은 사건 아님.
- 다음 행동: 새 원문/상세 결과를 읽고 이 별도 선행 검사의 응답 전환·추가 조회 경계와 원 두 실패의 연결 가능성을 국소 대조할 것. 아직 원 두 실패의 경계 기록 없음. 추가 전체 관측·추측 제품 패치·완료 판정으로 넘어가지 않는다.
- 환경/근거: R=`_attic/runtime/flaky-capture-20261019/ci-39195321428`, 합성 DB `/home/runner/work/_temp/mes-flaky-diagnostic/source/backend/mes_e2e.db`, before-cleanup DB SHA256 `ab6d9d60ff181dab8bb510bfc448154567c3e2e2de09c72d74129955cd524924`. `R/original-general-once/first-failures/1931981560c0ad6c017f-813adbd0069bf3c26cc8`의 receipt complete·DB/trace/screenshot과 kernel usable/유실 0. 실제 원문은 로컬에 내려받음. Node 20.20.2/Python 3.11.17/Chromium 1223, Ubuntu 24.04.5/kernel 6.17.0-1022-azure. CI 프로세스 종료. 보호 DB/session hash와 3038 PID46916/8038 PID10744 유지(12:51 KST). Windows/WSL의 진단 3100/8021 listener도 없다.
- 새 원문: 후보 `_attic/runtime/flaky-capture-20261019`, WSL `/home/hw/mes-flaky-capture-20261019`. 기존 원문·실패·사용자 DB는 그대로다. preflight.json과 starting-working-changes.patch가 현재 실행 시작 기준이다.
- 기존에 미커밋이던 AS 완료 문구·기록은 섞어 커밋하지 않는다. 이번 문서 상단 추가분만 분리한다. 도구 검사는 관련 소스가 동일한 근거를 재사용한다. 제품 코드·전체 기대값·복구·성능 검사를 반복하지 않는다.
- 한계: fixture 준비 단계에서 자체 정리가 먼저 수행되는 실패는 before-cleanup 전체 보존으로 인정하지 않는다. capture partial·kernel 기록 누락·순서 불일치면 진단 한계를 기록하고 제품 원인 확정에 쓰지 않는다.

## 현재 실행: 2026-10-19 BOM·AS 연결 원인 진단

**현재 체크포인트(2026-10-19 11:07 KST):** 후보/원격 HEAD `121706c3f7f578dc236665512677d94f0f62f95d`. 두 원인은 미확정, 제품 원인 패치 없음. [현재 조사 결과](../../../docs/superpowers/plans/2026-10-19-mes-flaky-investigation-results.md)를 먼저 읽는다. 추가 원인 판정에 필요한 실패 순간 기록이 부족하며, 아래 시각별 문장은 당시 경과이지 현재 실행 지시가 아니다.

**11:10 재개 감사:** 같은 증거 공백이 원 실행 턴과 후속2턴에서 계속됐다. 후보 HEAD·종료된 국소 CI 상태도 동일하고 새로운 실패 기록이나 실행 중인 진단은 없다. 원 서버 자료는 미보존이며 정한 관측 한도도 소진했다. 추측 수정·같은 조건 반복으로 대신할 수 없어 차단 판정 대상으로 남긴다. 다음 재개에는 새 실패의 입력/연결 경계 기록 또는 별도로 승인된 구체적 새 재현 조건이 필요하다. 완료 판정과 main 병합은 계속 보류한다.

- 새 근거: CI39183151452의 합성286개·공정 분포 준비와 원IO1회는 통과했다. `/items` 83.859ms로 원671.747ms보다 빨라 원 지연 조건은 미충족. 원 read reset0·유실0·backend 예외0. 실제 원문 `D/ci-39183151452/io-original-item-scale`.
- 새 실패: CI39183694728은 제품 React 소스 원형 hash를 유지한 native-only 관측이다. `SHIP-DISCARD`의 요청 메모가 없어 실패했고 뒤 VAR/DRIFT/GEN3개는 미실행이다. textarea native focus/beforeinput/input은 수신됐고 focus를 유지했으나 fill 종료 직후·다음 클릭 전에 빈값이었다. 메모 값/React 처리 관측이 없어 제품/자동화 원인은 아직 나뉘지 않는다. 원문 `D/ci-39183694728/bom-native-only-precursors/report.json`, trace, bom-boundary-ring. 정상 수량 검사의 실패로 바꿔 적지 않는다.
- 정확한 단계: [CI39185603420](https://github.com/Hw-03/ERP/actions/runs/39185603420) attempt1~3은 모두 준비1+같은 worker4조건 통과·retry/skip0·유실0으로 종료했다. D/ci-39185603420-{1,2,3}에 모두 내려받았으며 같은 관측의3회 한도를 소진했다. 원 BOM 실패 경계는 미포착이다. 별도 DB 없는 capture-mechanism-02에서는 진단 코드가 native capture에 자식 상태 갱신을 인위 예약할 때만 입력2→commit1→bubble1/onChange누락을 보였다. 키보드도 같고 유휴 훅을 꺼도 같으므로 원인으로 채택하지 않는다.
- 다음 행동의 조건: 새로운 원 실패가 실제 관측되면 준비된 진단의 DOM/tracker/React/commit 또는 소켓/TCP/프로세스 기록부터 읽는다. 새 근거가 없는 상태에서 같은 선택자 반복·전체 검사·임의 부하·GC·유휴 훅 추측패치를 시작하지 않는다. 원 AS trace의103→672ms 변화와4필드 차이는 `D/io/original-items-before-after.json`; 원격 artifact/전체 job 로그에도 당시 서버 stderr·TCP가 없음을 재확인해 과거 기록 복원은 불가하다.
- 보호 상태: 사용자 B DB·초안·연구 요청은 재현에 사용하지 않았다. 기존3038 프론트43536은10:50 확인 당시 이미 종료(이유미상)였고, 같은 buildID `gIMhDcGEwsnaBEKqatBk7`를 PID46916으로 복원했다. backend10744·boot와 복원 전후 DB SHA256은 그대로다. `D/review-frontend-restore-result.json` 및 보존 전 session 참조. 진단3100/8021/3153은 종료. 자동 일반 CI39183694693·39185603403은 정확한 후보 HEAD 확인 후 취소 완료. 기존 AS 문구 파일과 기록은 여전히 별도 미커밋이다.
- 검증 재사용: 진단 가드16건(Linux skip0), 관련 구문/actionlint, 원 선택자9통과와 같은 worker BOM4통과, IO286개 실행의 유효 단언. 이들을 실패 원인의 해결이나 최신 전체 CI 성공으로 확대하지 않는다.

### 이전 실행 경과

- 목표/범위: 두 간헐 실패의 원인 증명과 최소 수정·국소 검증. 사용자 승인 계획은 `docs/superpowers/plans/2026-10-19-mes-flaky-root-cause.md`. main 반영·직원 배포 없음. 필요 시 후보 진단 커밋·푸시·세 선택자 국소 CI만 허용됐다.
- 기준 후보 `782eb344ab0360db93ecc38821b355a2375b1980`와 아래 AS 완료창 미커밋 수정을 보존. 기존 3038/8038·B DB·사용자 BOM 초안/연구 요청은 재현에 사용하지 않는다.
- 진단 원문 D=`C:/Users/user/.codex/worktrees/mes-main-candidate-comparison/ERP/_attic/runtime/flaky-diagnosis-20261019-0902`. `preflight.json`, `source-head.tar`, `initial-working-tree.patch`에 시작 상태를 보존했다.
- 동일 Linux 호스트 L=`/home/hw/mes-flaky-20261019-0902`, 소스 `L/source`, 합성 DB `L/source/backend/mes_e2e.db`, 전용 3100/8021. Node20.20.2/Python3.11.17/Chromium1223·lockfile은 과거 CI에 맞췄다. Ubuntu26.04/WSL2이며 과거 GitHub Ubuntu24.04 이미지와는 다르다. 초기 앱 준비는 원래 기한 안에 통과했다.
- 완료한 관측: SHIP-VARIANT 총3회(`bom-observed-01` 1회, `bom-variant-03` 2회), SHIP-GENERATED-ROLES 3회(`bom-generated-01`) 재시도 없이 통과. 원본 테스트 본문은 유지하고 진단 사본에 native→React→setter→commit→match 계측만 추가했다. `D/linux-artifacts/<run>/report.json`, `test-results` trace/`bom-boundary-ring`을 따른다. 첫 VAR의 input2→React2→commit2→match2/200, dropped0 확인. 이 통과를 원인 해결로 간주하지 않는다.
- 환경 준비 실패는 별도: 첫 두 선택자를 합친 shell grep의 `|`가 외부 shell에서 나뉘어 VAR1회만 실행됐고, 다음 실행은 TIME_WAIT를 실제 listener로 오판한 사전 bind 검사에서 중단됐다. 각각 원문 유지. 전용 포트 guard에 SO_REUSEADDR를 사용해 실제 listener는 계속 거부한다. 제품 또는 E2E 실패로 세지 않는다.
- 현재 정확한 단계: IO-RESEARCH-RETURNS 3회 모두 통과(`io-research-01`). `io-research-01-net`의 header-only TCP/PID와 Node/Python 기록은 유실0, 원 CI와 같은 read ECONNRESET0. 별도 화면 이탈/정리 중 오류33건은 원 실패와 구분해 분석한다. collector는 명령 경로 확인 후 소유 PID1199만 종료했다. BOM은 원 SHIP-DISCARD를 먼저 붙인1회 대조도 VAR/GEN 통과(`bom-after-discard-01`). 전용3100/8021 listener 없음 확인. 원인 미확정, 제품 패치 없음.
- 추가 단일 변수 대조: 원 CI `/api/items`는286개/294,523바이트, 첫 로컬은5개/5,258바이트. `DASHBOARD01`의101개 생성 구간만 새 합성 DB에 복원한 `io-after-items-01`도 원 선택자1회 통과, read reset0/input gap0. 전체 shard 또는286개 상태 전체를 복원한 것이 아니다. 원문은 `D/linux-artifacts/io-after-items-01{,-net}`. 이 소유 collector PID495도 종료했다.
- 현재 후보 Git HEAD `4cfee12b4f81eca8e306e6d81c66063c9809186a`, 원격 동일. 진단 도구만 `1bb420d5`, 전용 workflow 컨텍스트 수정만 `4cfee12b`로 푸시했다. 제품 AS 문구와 기존3개 기록 문서는 미커밋 보존. 스마트 계획은 infra 전체 승격이었지만 실제 소비자는 전용 workflow/임시 소스뿐이므로 가드12건·Python/Node/TS 구문·actionlint만 실행했다. 기존 공통 CI·제품 코드 변경 없음.
- 완료한 외부 실행: [국소 CI39181286366](https://github.com/Hw-03/ERP/actions/runs/39181286366), 위 HEAD의 `diagnose` job117834375342 성공. 앱 준비1건과 원 세 선택자 각3회 성공, 재시도/skip0. D/ci-39181286366에 원문을 내려받았다. BOM은 모든 입력→React→commit→match·저장2/3 유지·유실0. IO 원 read reset0·유실0·backend 예외0, 상세/초안200이다. 각 batch의 반복은 worker0/1/2, 즉 동시성1이지만 서로 새 브라우저였다. 원인 해결 근거로 세지 않는다. 기존 `39181180800`은 workflow 컨텍스트 오류이며 수정 후 검사했다. 자동 일반 CI `39181181659`, `39181286340`은 정확한 branch/SHA 확인 후 취소 완료했다.
- 현재 다음 단일 변수 대조: 후보 HEAD `3538a5076083fc1f77fe509282fc88e84eada2c1`로 도구6파일만 커밋·푸시, [국소 CI39182577349](https://github.com/Hw-03/ERP/actions/runs/39182577349) 실행 중이다. 같은 HEAD의 자동 일반 CI39182577407만 확인 후 취소 요청. BOM은 원본 동일 파일의 DISCARD→VARIANT→CANDIDATE-DRIFT→GENERATED-ROLES를 같은 worker에서 각각1회 실행한다. IO는 원 실패 품목286개와 공정 분포를 맞추도록 합성 배경281개만 먼저 만들고 원 선택자1회 실행한다. 기존 DB 관계/예약/과거30분 브라우저 수명까지 복원하는 것은 아니다. D/io/ci-original-item-shape.json에 개인정보 없는 원 집계를 보존했다. 제품 패치 없음. 전체 shard·baseline9건 반복 없음. Linux가드14건·TS구문5파일·Python구문·actionlint·cached check 통과. 다음 행동은 정확한 CI 산출물의 실패/성공과 계측 누락 여부 분석이다.
- 계측 한계: BOM observer는 값을 바꾸거나 재입력하지 않지만 DOM 읽기·microtask·layout effect·setter wrapper가 타이밍을 바꿀 수 있다. 원 trace의 fill 인자는 실제 DOM2/3 관측이 아니며, native 이벤트 기록이 없어 입력 미전달과 순간 덮어쓰기를 확정할 수 없다. IO 원 trace의 상세/drafts 시작은 약5초 후보인 이전 응답 후4.46/4.58초이고 reset은5.03/5.05초다. 실제 upstream socket ID가 없으므로 단순 만료 재사용으로 확정하지 않는다.
- 09:55 후속: CI39182577349 종료. BOM 선행4개는 실제 worker0 유지·재시도0·계측 오류0으로 통과. IO는 준비 첫 생성의 POST ItemResponse에 조회용 model_slots=[1]을 기대한 진단 단언 오류로 중단됐으며 원 IO 선택자는 미실행이다. 실제 create_item은 plain ORM을 반환하고 ItemResponse의 기본 model_slots는[]; 목록 GET이 slots를 계산한다. 단언을 삭제하지 않고 준비 후 목록 GET에서 모든 합성품목[1]을 확인하도록 이동했다. 통과한 BOM은 다음 batch에서 제외해 재사용하며 IO 준비/원 선택자만 이어간다. 일반 CI39182577407은 취소 완료. 원문 D/ci-39182577349 및 ci-39182577349-failed.log 보존.
- 09:58 현재 실행: 새 준비만 WSL Linux `item-shape-preparation-01`에서1건 통과(33.3초). 실제281개·최종283개/원IO후286개 분포·조회 모델 슬롯·재고0 확인, 원문 D/linux-artifacts/item-shape-preparation-01. 부모 전용 프로세스 종료됨. `3bd1e37e01b8f40932d7707caaf2ddc6db3db3f4`에 진단3파일만 커밋/푸시, [국소 CI39183151452](https://github.com/Hw-03/ERP/actions/runs/39183151452)에서 IO 준비/원선택자만 실행 중이다. 같은 HEAD의 자동 일반 CI39183151470만 취소 요청. 다음 행동은 이 실행 산출물의 IO 결과와 연결 계측 확인이다. BOM4통과는 유효 재사용하며 다시 실행하지 않는다.
- 재사용: 기존 Windows 통과·원 CI 실패·과거 EOF 제어 실험·AS 문구42건/빌드 근거. EOF 실험은 실제 `read ECONNRESET(-104)` 원인의 대체 증거가 아니다. 전체 업무/빌드/기대값 검사는 반복하지 않는다.

## 최신 후속: 2026-10-19 AS·연구 완료창 문구

- 현재 후보 브랜치 `codex/mes-main-candidate-comparison-20261016`, HEAD `782eb344ab0360db93ecc38821b355a2375b1980`. 공용 `ioComposeOperations.ts`의 AS·연구 제목 분기와 보고서/TODO/이 인계 문서가 이번 미커밋 변경이다. 아래 10/16 내용은 과거 근거다.
- 후보 production `localhost:3038`, backend `127.0.0.1:8038`, DB `C:/ERP/_attic/runtime/main-candidate-20261016/B/qa.db`. 프론트만 재빌드·재시작했다. frontend PID43536, backend PID10744·boot 불변, buildID `gIMhDcGEwsnaBEKqatBk7`. 소유 세션은 `R/B/session.json`.
- 완료: 관련 기존 테스트 42건·ESLint·빌드·번들 통과. IAB의 새 AS 요청 완료창이 `AS·연구 전용 결재 요청 완료`인 것을 확인하고 이번 요청은 취소. 원문 `R/manual-review-20261019/label-*`. 상세 보고서의 10/19 AS02 후속에 순서·범위·한계를 기록했다.
- 중단 시점/다음 행동: 문구 수정·국소 검증 완료, 사용자 결과 보고. 커밋/푸시 요청 전에는 실행하지 않는다. main·직원 서버 변경 없음.
- 주의: 사용자가 만든 `QA-REVIEW-20261019-RESEARCH`는 승인 대기로 유지. BOM 탭의 사용자 입력은 건드리지 않았다. 크기 전환 경고는 사용자 요청대로 제외. 과거 BOM 입력·조회 연결 실패의 원인 해결이나 후보 전체 PASS로 확대하지 않는다. 기존 광범위 검사 결과는 당시 코드의 근거로만 보존하며 이번 좁은 문구 변경 때문에 반복하지 않는다.

**2026-10-16 20:35 KST:** 후보 `eddd08118fb8c0e02bb794ffdc19adceacf63c72`까지9커밋 푸시, [CI38886739485](https://github.com/Hw-03/ERP/actions/runs/38886739485)는8/8 job 성공이다. 일반 E2E는299건 첫 통과·2건 재시도 통과다. 원본 읽기 조사 결과 연결 reset 원인과 BOM 입력2→1 처리 순서가 미확정이어서 병합 판단은 보류한다. 업무 비교·production 핵심·상세 기록은 완료했고 종료 문서3개를 별도 커밋/푸시할 단계다. main 반영·직원 배포는 하지 않는다.

먼저 [첫 비교표·업무별8항목 상세](../../../docs/superpowers/plans/2026-10-16-mes-main-candidate-comparison-report.md), [활성 TODO](2026-10-16-mes-main-candidate-comparison-todo.md), [승인 계획](../../../docs/superpowers/plans/2026-10-16-mes-main-candidate-comparison.md)를 읽는다. 과거 중간 인계는 Git의 `eddd0811` 이전 판과 로컬 `R/resume-20261016-1845.md`, `resume-20261016-1925.md`에 보존돼 있다. 과거의 ‘다음 행동’을 현재 지시로 실행하지 않는다.

## 코드·DB·서버 식별값

| 구분 | A 현재 main | B 병합 후보 |
|---|---|---|
| 폴더 | C:/ERP | C:/Users/user/.codex/worktrees/mes-main-candidate-comparison/ERP |
| 브랜치 | main | codex/mes-main-candidate-comparison-20261016 |
| HEAD | 29583972129c8340aa19416e6c554ea60db3c490 | eddd08118fb8c0e02bb794ffdc19adceacf63c72 |
| 코드 구성 | 기존 main 유지 | e9560587에서 대기5927e532 전체 결합, c7c4628f에서 기타 입력 수정 |
| 주소·모드 | http://127.0.0.1:3001/mes · backend8011 · dev | http://localhost:3038/mes · backend8038 · production |
| 활성 검증 DB | C:/ERP/backend/mes.db | C:/ERP/_attic/runtime/main-candidate-20261016/B/qa.db |
| revision | 20261014_0046 | 20261015_0047 |

- R=`C:/ERP/_attic/runtime/main-candidate-20261016`, T=`C:/Users/user/.codex/worktrees/mes-main-candidate-comparison/ERP/_attic/runtime/comparison-checks`.
- 직원 원형 온라인 스냅샷: `R/backups/sqlite/mes-before-comparison-employee-source-20261016-143800-4492139c.db`, SHA256 `5b9b7211ffbe7a5a1cc9218f336d6e05dca02ade1748a000e5236391219d5bb8`. 19:33 재확인도 동일. `R/environment-check-1933.json`.
- 기존 개발 DB 보존: `R/A/development-before-switch.db`. 초기 분기·revision·행 보존: `R/pair-preparation.json`, `A/cutover.json`, `A/original-tables.json`, `B/original-tables.json`.
- B 소유 세션 `R/B/session.json`, boot_id=`782416342c5c4949892993d845a9d3a4`, build_id=`K4aEq29ysft3gVQjFIjku`, `.next-prod`. Node20.20.2는 `C:/ERP/_attic/runtime/tools/node-v20.20.2-win-x64/node.exe`.
- B 상태 확인: `py -3.12 C:/ERP/_attic/runtime/main-candidate-20261016/candidate_server.py status`. 서버 조작이 필요할 때만 이 소유권 도우미를 사용한다. 기존 개발 venv에는 psutil이 없으므로 이 도우미 실행에 사용하지 않는다.
- A/B는 사용자 검토용으로 계속 실행한다. IAB browser2/tabA2/tabB4, 1920×1080 확인. 원래 tab1은 건드리지 않았다. 압축 후 브라우저가 필요하면 `cua.rewriteDocumentation()`부터 호출한다.

## 완료 작업과 정확한 근거

- 같은 직원 원형에서 A/B 사본 분기, QA 계정 준비, 후보 명시 migration. 기존 업무86테이블과 승인 밖 값 보존·SQLite/FK·신규 nullable 백필 없음 확인. 직원 DB·서비스·예약 변경 없음.
- AP01/AP02/IO02/DF01/PR01/DF02/PR02/RW01/AS01/AS02/CONV01/ADJ01/SH01 지정 흐름의 UI 처리·위치 수량·예약·취소 대조 완료. 상세 보고서의 각 `*-comparison.json` 및 실제 화면 경로를 따른다. 숫자 복원과 DB 전체 원복을 혼동하지 않는다.
- SET01 설정 저장/취소/직원 격리, DETAIL01 검색·열린/닫힌 상세 복원·실제 품명 복사, REPORT01 취소 전환 일보와 REPORT02 현재 주 대표 수량 완료. 미실행 조건은 각 상세에 있다.
- B 최종 production의 `PROD-AP01-comparison.json`, `PROD-DF01-comparison.json`, `PROD-SH01-comparison.json` 완료. 부 담당자의 다른 공정 승인, 기타 메모 입력58px, 창고 복귀·한 작업 취소, 기본 BOM 출하·역순 취소까지 확인했다.
- BOM2·3은 입력 직후 다음/뒤로에서 유지 확인 후 실제 제출은 기본1·1로 복원했다. 변경 BOM을 실제 출하한 검사가 아니다.
- 일반 조회240회 오류0, 목록/검색/상세 응답 동일·지연 회귀 기준 내. 내역의 AS 승인자/시각 차이는 원형과 B 일치. `R/performance-run-02/summary.json`, `history-approval-display-review.json`. 원래 INCONCLUSIVE를 덮어쓰지 않고 별도 판정했다.
- 보고서 복원 때문에 기존 업무를 재실행하지 않았다. 이후 묶음마다 상세8항목·첫 표·TODO를 갱신했다. 로컬 갤러리 `R/documentation-paired-screens.md`, 원문 색인 `documentation-evidence-index.json`은 실제 직원 정보가 있어 ignored에만 보관한다.
- 읽기 감사: `R/final-local-review.md`, `final-completion-audit.md/json`, `final-doc-readonly-audit-1927.md`. 마지막 감사의 현재/과거 재개 지점 혼동은 이 문서의 단일 현재 블록으로 정리한다. 근거 경로 누락·과장·직원 개인정보 노출은 발견되지 않았다.

## CI 경과와 재사용할 검사

- 첫 CI38877549662: 프론트8실패(WorkChoice 관찰자 대역7·실사 회차 순서1), backend 알림의 옛 권한 기대1실패. `6f9a6aff`와 `5a77fbf1`에서 시험3파일만 보완했다. WorkChoice19·Stocktake92·ESLint·알림선택자1 및 원장check 통과. 제품 변경 없음. 실패·취소 원문은 `T/ci-38877549662-*`에 보존.
- 395cab9c/CI38882322838: 프론트4,601과 pytest/PostgreSQL 단계 성공, 마지막 OpenAPI description2곳만 실패. `7143b5c8`에서 기준 설명2줄만 갱신했고 전체 생성 명세와 SHA256 동일. `T/ci-openapi-red.json/.log`, `ci-openapi-green.json/.log`. 일반 E2E는 후속 푸시로 취소/미완료.
- 현재 eddd0811/CI38886739485: 프론트374파일4,601·커버리지·lint/type/build/bundle 성공. backend pytest·복구 readiness·PostgreSQL·OpenAPI까지 성공. `T/ci-eddd0811-frontend-success.log`, `ci-eddd0811-backend-success.log`, `ci-eddd0811-postgres/`. 번들3,379,878bytes≤3,407,872bytes(3.25MiB). 일반 E2E job도 성공했으나299첫통과·2재시도통과·0skip을 구분한다.
- 기존 유효 국소 근거: 권한72, IO126, 복귀확장34·출하4, 일괄복귀 계약 수정 후18, 정책소비자16, 보충IO5·상세24·Node12, RO단위80·E2E7(재시도0)·정적 검사·production 빌드. 정확 경로와 범위는 보고서 재사용 부록 및 `R/supplemental-checks-record.md`.
- 과거592cc5c6/CI38728379582의 선정9파일95조건은 당시 근거다. `R/reuse-scope-final-inputs.json`, `reuse-scope-final-draft.md`의 입력/조건 범위만 재사용. LF 정규화 동일과 raw SHA 동일을 구분한다.
- 소스입력967에는 시험도 포함됐다. 후속 시험3파일이 바뀐 뒤 전체967동일이라 주장하지 않는다. 제품 소스는 c7 이후 그대로이며 후기 변경은 시험·원장·API 설명·기록뿐이다.
- 원장 현재1,058조건 NOT_RUN과 과거 bindings/execution/원문을 보존했다. 이번 대표 UI·CI 성공을 전체 기대값의 새로운 PASS로 승격하지 않는다.

## 진행 중인 단계와 바로 다음 행동

1. CI watch6561은 완료됐다. `T/ci-eddd0811-result.json`에8job 성공을, `ci-eddd0811-general-success.log`와 `ci-eddd0811-playwright-general/`에301조건 중299첫통과·2flaky·0skip을 보존했다. CI 상태만 보고301첫통과라 쓰지 않는다.
2. 읽기 전용 조사 완료: R/ci-flaky-io-review.md 및 ci-flaky-shipping-review.md. IO 최초 실패 구간의 조립/창고 보존과 취소 응답은 확인했으나 reset 원인·취소 후 예약 전체 복원은 미확인. BOM은 실제 매칭 본문도1이고 기본BOM 응답은 입력 전 완료돼 지연 응답 덮어쓰기 가설은 배제했다. 실제 이벤트/state 순서와 재현 원인이 없어 추측패치하지 않는다. 둘 다 직원 영향0이라고 단정하지 않는다.
3. 결과에 맞춰 상세 첫 표·활성 TODO·이 인계의 종료 판정을 확정한다. main 원격이 여전히29583972인지 읽기 확인한다. 다른 세션 파일을 자동 포함하지 않는다.
4. 종료 문서만 명시 stage·cached check·smart PlanOnly·링크 검사, 기존 검사 도구의 유효 통과 근거 재사용 후 실제 날짜의 한국어 제목으로 후보에 커밋/푸시한다. 문서 후속 HEAD CI도 확인해 최종 응답에 정확히 구분한다. 종료 문서 자체 해시를 그 문서 안에 미리 단정하지 않는다.
5. A/B 검토 환경과 근거는 남긴다. 복원 절차는 보고서 ‘개발 DB 복원’ 절을 따른다. 이번에 복원·main 병합·직원 배포는 실행하지 않는다.

## 남은 한계·주의

- A/B 공통: 취소된 이동의 내부 io_batch가 completed로 남음. 요청/라인·관측 UI·재고는 취소 정상이나 전체 소비자 영향까지 확인하지 않았다.
- A/B 공통: AS 전용 완료 모달의 ‘창고 결재’ 문구. 실제 AS 담당 승인·취소는 정상이며 문구 수정은 하지 않았다.
- 실사 CI 내부 effect 순서는 미확정. 취소된 general 로그의 proxy ECONNRESET도 원인 미확정이다. 발생시각이 job 취소 전이므로 전부 취소 탓으로 돌리지 않는다.
- 현재 일반 E2E의 연결 reset·BOM2→1도 원인 미확정이며 별도8항목 기록을 보고서에 추가했다. 원인 조사를 이어갈 경우 새 업무가 아니라 이2조건의 서버/입력 이벤트 관측부터 시작한다. 전체 반복·무조건 재시도·원인 미확정 패치는 하지 않는다.
- 역할 회수/중복/동시 처리 등은 관련 자동·과거 근거와 신규 UI 조건을 구분한다. 모든 조합을 새 화면에서 반복한 것이 아니다. 실제 자료 부재·미실행은 상세에 남겼다.
- RW01 원자재 입고1과 QA-W dark/collapsed 설정은 검토 DB에 남는다. 현재3-AR-0004는 총440/창고439/조립1/예약0. B 추가 production의 정상·취소 이력도 남는다.
- A/B 업무 DB에 기존 E2E global setup·seed/reset을 실행하지 않는다. 합성 E2E의3100/8021 환경과 혼용 금지. PIN·직원 원문·DB·화면은 커밋하지 않는다.
- main의 C:/ERP에 후보 코드를 체크아웃하지 않는다. 정기 동기화와 겹치면 비교를 중지하고 자료를 보존한다. 직원 예약·서비스를 바꾸거나 새 운영 거래를 옛 백업으로 덮어쓰지 않는다.
