# 개발서버·병합 후보 비교 검증

## 2026-10-19 최신 main → 후보 통합: 완료 4 / 전체 5

승인 계획: [후보 통합 실행](../../../docs/superpowers/plans/2026-10-19-mes-candidate-main-integration.md). 기존 미확정 원인의 추가 진단은 중단하고 아래 통합을 진행한다. 과거 미확정 기록은 해결로 승격하지 않는다.

- [x] CP0 (2026-10-19) 기존 변경·후보 DB 보존과 선행 커밋76133d5e/b34ae8ac/217c6ce0/e9f98f19, 후보 서버 중지.
- [x] CP1 (2026-10-19) main9824903e의 충돌 통합·읽기 전용 계약 리뷰. merge commit은 검증 후 작성.
- [x] CP2 (2026-10-20) 관련 자동 검사·DB 사본·타입·정적·production 빌드·승인3.30MiB 번들 게이트 통과. bundle-approved.log.
- [x] CP3 (2026-10-19) 격리 production에서 OR 검색·창고 격리/복귀/취소·관리자 BOM 저장/취소 확인. 사용자 원 DB 해시 불변·3038 production 복원.
- [ ] CP4 후보 브랜치 푸시·최종 CI·결과 기록.

CP4 진행(2026-10-20): 이전 CI39336151664는 일반 E2E46실패/1재시도통과/254통과, 다른7job성공. 추가 승인으로 main e55918bc·62ab7305를 후보에 결합(faa27b1c·ed12b9b0), UI 테스트만 현재 화면에 맞춘56e84518을 작성했다. 관련 Vitest286·실사커서7·E2E122조건(관리자50/내역출하6/불량모바일66)·타입/ESLint·원장 연결 검사·최종 production 빌드3.273MiB 통과. 근거는 R의followup-*이며 과거 실패·실행 기록 보존. 후보 푸시와 새 최종 HEAD CI는 아직 미완료다.

2026-10-20 사용자 승인으로3.30MiB 한도 적용, 실제3.271MiB 게이트 통과. CP4 병합 커밋·후보 push·CI 진행. 원문 `_attic/runtime/integration-main-20261019/`. 백엔드375·관련 프론트·타입/ESLint/production 빌드/DB 사본 보존 통과. 원 사용자3038/8038은 기존 DB로 production 복원했고 임시 QA3039는 종료했다. main·직원·예약은 변경하지 않는다. 상세: [통합 결과](../../../docs/superpowers/plans/2026-10-19-mes-candidate-main-integration-results.md).

## 2026-10-19 관측 신뢰성 보완: 완료 5 / 전체 5, 과거 제품 원인 미확정

[승인 계획](../../../docs/superpowers/plans/2026-10-19-mes-observation-reliability.md)·[현재 결과](../../../docs/superpowers/plans/2026-10-19-mes-observation-reliability-results.md). 이번 목표는 도구 보완이며 과거 제품 원인 해결과 별도다.

- [x] CP0 (16:58): HEAD·기존 변경·보호 DB/session/PID 보존. `flaky-observation-reliability-20261019-165811/preflight.json`과 `start-files/`.
- [x] CP1 (2026-10-19): 실시간 IPC·20ms guard·발행 전 중단·진행 요청 보존. 초기50/후속26 근거 보존, 지정 Linux Node20 최종51검사 통과. 실제 Next worker/고정 GET probe 통과. `R/as-unit/`, `R/linux-evidence/next-01/`.
- [x] CP2 (2026-10-19): kernel 포트 필터·100ms/reset 구간 누계·손실 중단 연결. 패킷25검사, 커널 수명/보존 Linux20검사, 실제 필터 및 Next 양방향 기록 확인. `R/packet-unit/`, `R/kernel-health-linux-green.log`, `R/linux-evidence/packet-linux-01/`.
- [x] CP3 (2026-10-19): passive 복사본·원 입력/단언 유지·이벤트 부재/관측 손실 분리·정리 전 보존. Windows37, Linux Node20의36+플랫폼 준비 수정 후 국소1 통과. 실제 React off/on/on-reviewed 동일, 원 선택자2개는 `--list`만 확인. `R/bom-unit/`, `R/bom-generated-list.log`.
- [x] CP4 (2026-10-19 17:34): 묶음별 상세/첫표/인계, 최종 소스·근거 해시, 보호 DB/session/main/검토 PID 불변과 진단 포트 해제 확인. `R/final-audit.json`, `R/postflight-ports.json`, `R/verification-index.json`. R=`_attic/runtime/flaky-observation-reliability-20261019-165811`.

AS 기존 업무 구간·BOM 정상 선택자·전체 검사·커밋·푸시·CI는 실행하지 않았다. main·직원·검토3038/8038 보존. 자연 발생 실패 기록은 기본 비활성이며 다음에 해당 검사가 필요할 때만 사용한다. 아래 이전 실행의 제품 원인 미완료 상태와 병합 보류는 그대로다.

## 2026-10-19 입력 전달 조사: 실행·기록 완료 4 / 전체 5, 제품 원인 해결 미완료

새 승인 [계획](../../../docs/superpowers/plans/2026-10-19-mes-input-transport-diagnosis.md)·[결과](../../../docs/superpowers/plans/2026-10-19-mes-input-transport-results.md). 기존 한도 종료 기록은 과거 상태로 보존한다. 이번은 AS 도구 대기 제거와 새 BOM 입력 방식 대조이며 main·직원·검토3038/8038 미변경이다.

- [x] CP0 (15:43): 후보63d4ed59·기존변경·보호DB/session/PID 보존, 새실행자료 `flaky-input-transport-20261019-154319/preflight.json`.
- [x] CP1 (16:00): AS 도구32검사·실제 무업무 probe 통과, 실제 Next worker 관측 확인. 새1구간36응답·제출201/조회200. 발행 최대7.385ms지만 Next 수신14건 초과·packet drop2로 조건 미충족, 원 오류 미재현. `flaky-input-transport-20261019-154319/linux-evidence/as/preparation-01`에 실패 전 보존 형식·DB·분석 저장. 추가 AS 실행 금지. 제품 해결 완료 아님.
- [x] CP2 (16:16): 무업무 React off/on 동일값 확인. 첫 helper 누락은 입력 전 준비 실패로 보존·의존 검사 보완. ready-02의 fill2·숫자키2·숫자키3·fill3 각1회 정상, 명령/native/React/상태/매칭 연결·손실0·pause0. `flaky-input-transport-20261019-154319/bom-evidence-index-97.json` 및 조건별 admission. 원 실패 미재현, 최종 저장·재고·취소는 새 검증 아님.
- [ ] CP3: 원인확보후최소수정·직접관련검사. 근거없으면미완료유지.
- [x] CP4 (16:18): 상세·첫표·인계에 새 결과/재사용/미실행/도구 한계 구분. `postflight.json`에서 HEAD/main ref·보호 DB/session/PID·제품 소스 불변, 진단3100/8021 종료 확인. 제품·전체 검사·커밋·푸시·CI·main·직원 변경 없음. 두 원인 해결·병합 가능으로 승격하지 않음.

## 2026-10-19 직접 경계 조사: 실행·기록 완료 3 / 전체 5, 원인 해결 미완료

새 승인 [계획](../../../docs/superpowers/plans/2026-10-19-mes-direct-boundary-diagnosis.md)·[결과](../../../docs/superpowers/plans/2026-10-19-mes-direct-boundary-results.md). 새 정상 업무 재현 결함과 원 CI 귀속은 별도 판정한다. 아래 이전 완료 수치는 당시 관측·기록 범위다.

15:12 KST: 마지막 추가 읽기 근거 뒤3회 동일한 차단 조건을 재확인했다. 실행 한도 소진·새 원실패 근거 부재·진행 중 진단 없음으로 목표 진행 불가 판정. CP2/CP3와 완료 수치는 그대로이며 해결 완료가 아니다. 재개에는 새 실제 실패 기록 또는 추가 실행 범위가 필요하다. 감사=`flaky-boundaries-20261019-135838/tool-checks/no-progress-after-1506-03.json`.

- [x] CP0: 후보63d4ed59·기존 미커밋·소스/lock·검토 DB/session 해시·PID 보존. 새 Linux 합성 사본과3100/8021만 사용.
- [x] CP1 (2026-10-19): 두 사용자 실제 구매 메모 저장/SSE/목록 갱신과 BOM 입력2·3 네 조건을 각1회 실행. 입력 중 조건의 실제 겹침과 값 유지 확인, 관측 유실0. `flaky-boundaries-20261019-135838`의 조건별 admission/trace/DB 보존. 원인 해결은 미확정이며 같은 조건 반복 금지.
- [ ] CP2 (조건 미충족): 시계 준비 보완 후 실제 AS1회 시도. 초기11GET200이나 첫 CDP발행표식+83.886ms로20ms 기준 초과, 제출/문제GET 포함25요청 미발행. marker·before-cleanup·775kernel이벤트/유실0 보존. 같은 구간 재시도 금지, 원인 판정 조건 미충족 유지.
- [ ] CP3: 확보된 실패의 원인 변수 대조·최소 수정·관련 회귀. 원인 확보 전 제품 변경 없음.
- 진단 도구 보완(2026-10-19): Next 자식 옵션에서 중복 `--require`가 마지막 것만 남는 원인을 확인하고 단일 preload로 보완. 실제 설치 parser와 일반 자식 Node에서 기존 미로딩/새 로딩 대조 통과. 서버·요청 재생 없이 기록했으며 CP2·CP3 완료로 세지 않는다. 근거 `flaky-boundaries-20261019-135838/tool-checks/as-preload.json`.
- 추가 읽기(15:06): AS 첫 `page.evaluate`가 fetch 전에 기다린 DOM snapshot 구간53.021ms를 저장 trace·설치 소스로 확인. 20ms 시각 조건을 놓친 도구 대기 근거이며 원 reset 원인은 아니다. 원문 `tool-checks/as-snapshot-dispatch-readonly.json`. 새 검사·요청 실행0건, CP2·CP3 상태와 한도 유지.
- [x] CP4 (2026-10-19): 상세/첫표/인계에 새 정상·조건 미충족·미실행·재사용을 구분. 로컬 원문249파일 해시 보존, 소유 진단3100/8021/3154 정리, 사용자3038/8038 PID·DB/session 해시·제품 소스 보존 확인. 커밋/푸시·main·직원 변경 없음. 원인 해결 완료로 승격하지 않음.

## 2026-10-19 실패 순간 보존 재개: 완료 4 / 전체 5

**13:42 진행 불가 판정:** 마지막 새 증거 후3개 후속 턴에서 원인 판별 자료 부재·진단 종료 상태가 유지됐다. 원인 수정·회귀 검증은 미완료이며 CP3는 열어 둔다. 새 원 실패의 writer/소켓 경계 또는 구체적인 새 판별 조건의 실행 승인 전에는 같은 검사 반복을 재개하지 않는다. 상세 결과13:42절과 ignored `no-progress-audit-*.json`에 근거·재개 조건을 남겼다.

새 승인 범위: [실행 계획](../../../docs/superpowers/plans/2026-10-19-mes-failure-capture.md). [단계별 결과](../../../docs/superpowers/plans/2026-10-19-mes-failure-capture-results.md). 아래 이전 진단의 미확정 판정과 원문은 보존한다.

- [x] CP0: 후보121706c3·기존 미커밋·검토 서버·DB 해시 보존. 별도 synthetic Linux/3100·8021만 사용. main·직원·3038/8038 미변경.
- [x] CP1 (2026-10-19): native setter/React 입력·kernel 종료·정리 전 DB/trace 보존 자체 검사 완료. 후보edd81fa0의 CI39195321428에서 실제 kernel6.17/bpftrace0.20과 브라우저 관측 가드까지 통과. 준비 실패·호환 보완은 별도 기록이며 제품 원인으로 세지 않음.
- [x] CP2 (2026-10-19): 원 선택·순서의 일반 묶음1회 실행 후 첫 실패에서 중단. CI39195321428 결과32통과/1실패/268미실행, retry0. 선행 STATE01 defect의 클릭 전 버튼 소실을 화면·trace·DB에 보존한 뒤 정리. kernel decode/loss0, capture complete. 원 AS204번째·BOM263/265번째는 미실행.
- [ ] CP3 (13:30 갱신): 원 BOM·AS의 실패 경계와 최소 수정·회귀 검증은 미충족. 과거 두 BOM fill 구간과 두 번째 full 품목응답의 겹침을 찾아 응답 순서만 국소 대조했다. before-fill의 원VAR1건은 정상·원문동일, focus의 원VAR1건도 정상이나 JSON완료가 input bubble보다9.9ms 늦어 조건 미충족. input-bubble arm·AS는 미실행, 새 제품 패치 없음. 유실0·제품 소스불변. 본문 조회 누락은 기존 trace 읽기로만 보완하고 재실행하지 않았다. 상세는 실패 순간 보존 결과13:30절과 ignored `catalog-response-boundary/linux-results/summary.json`. Next 선행destroy reset은 원AS read/-104와 다르며 전체 묶음/같은 정상검사 반복 금지.
- [x] CP4 (2026-10-19): 상세 결과·첫 표·인계에 실패 원문, 미실행, 재사용 범위, 보호 DB/session 해시·검토 PID 유지, 다음 안전한 지점 기록. 이 기록 완료가 두 원인 해결을 뜻하지 않으며 병합 보류 유지.

승인된 긴 관측은 소진했다. 원문은 후보 `_attic/runtime/flaky-capture-20261019/ci-39195321428`, 별도 해시/순서 감사는 같은 상위의 `final-capture-audit.json`. 원 두 조건에 도달하지 못한 결과를 반복 통과나 해결로 바꾸지 않는다. 아래 이전 계획의 수치는 당시 경과다.

13:30 후속 국소 대조와13:38 입력 노드 교체 가설의 읽기 기록·첫 비교표·인계 갱신 완료. 원 두 BOM trace의 input→after가 같은 DOM 노드라는 근거를 확인했지만 값 변경 원인은 미확정이다. 새 검사0건, AS 새 근거 없음. CP3를 완료로 올리지 않으므로 대시보드는4/5 유지한다. 현재 코드HEAD63d4ed59, 진단3100/8021종료, 마지막13:30 확인의 보호3038/8038·B DB/session 유지. 새 실패의 writer/연결 경계가 없는 상태에서 추측 패치·추가 전체 실행을 시작하지 않는다.

## 2026-10-19 원인 확정 실행: 완료 1 / 전체 5

승인 계획: [BOM 입력·AS 조회 오류](../../../docs/superpowers/plans/2026-10-19-mes-flaky-root-cause.md). 이번 목표는 기존 두 미확정 실패의 원인·최소 수정·국소 검증이다. 아래 과거 완료 기록은 당시 근거다.

- [x] CP0 (2026-10-19): 소스·기존 변경·소유권 보존, 같은 Linux 호스트의 합성 환경 준비. Node20.20.2/Python3.11.17/고정 JS 의존성/Chromium1223, Python 패키지는 원 CI 설치 목록과 맞춤. OS는 Ubuntu26.04/WSL로 과거24.04 CI와 다름. 실제 앱 load·로그인 선택 준비1건 통과(8.7초, 전체43.7초). 원문 `/home/hw/mes-flaky-20261019-0902/artifacts/preflight-01`, 시작 기록은 후보 `_attic/runtime/flaky-diagnosis-20261019-0902/preflight.json`. 사용자 DB/초안은 재현에 사용하지 않음. 종료된 검토 프론트만 동일 빌드로 복원한 별도 기록은 조사 결과 참조.
- [ ] CP1: BOM 입력/상태 및 API 연결 종료 계측·원인 구분. CI39183694728의 native-only 대조에서 선행 DISCARD 메모 유실을 관측했으나 원 BOM과 같은 원인인지 미확인이다. 값/tracker/React 관측을 보강한 CI39185603420 attempt1~3은 각각 준비1+4조건 통과·누락0으로 한도 내 관측을 종료했다. 실패 순간 경계는 여전히 부족하다. AS 두 GET은 실제500 응답이며 정상 화면 이탈 취소로 설명되지 않지만 reset 주체는 미확정이다.
- [ ] CP2: 필요한 국소 CI와 확인된 원인만 최소 수정. IO 준비 단언을 GET 계약에 맞춘 뒤 CI39183151452의286개 준비1+원IO1통과. 원 trace의 같은286개 품목 조회는 제출 직전103ms→직후672ms였고 예약·가용량4필드만 달랐다. 일시 지연과 read reset 원인은 미확정이다. 현재 후보121706c3, 제품 원인 패치 없음. [조사 결과와 실행 원장](../../../docs/superpowers/plans/2026-10-19-mes-flaky-investigation-results.md).
- [ ] CP3: 재발 방지·원 선택자·production 영향 검사.
- [ ] CP4: 상세/첫표/인계의 중간 기록과 진단 프로세스 정리는 완료. 최종 해결 판정은 미충족. 원 CI의 서버 로그가 업로드되지 않아 복원 불가하며, 입력 capture 인위적 상태 갱신 실험은 기전 확인일 뿐 원 실패 증거가 아니다. 동일 관측3회 한도를 끝냈으므로 새 실패 경계나 증거 없이 재실행하지 않는다.

기준: [승인 실행 계획](../../../docs/superpowers/plans/2026-10-16-mes-main-candidate-comparison.md).

현황: 완료 4 / 전체 5, 남음 1(CP4의 병합 판단 보류 사유 2건). `eddd0811`까지9커밋을 후보에 푸시했고 CI38886739485는8/8 job 성공이다. 일반 E2E는299건 첫 통과·2건 재시도 통과이며 실패 원문 읽기 조사를 마쳤다. 연결 reset 원인과 BOM2→1 입력 처리 순서는 미확정이다. 프론트4,601·빌드와 backend pytest/PostgreSQL/OpenAPI는 성공했다. CP2 지정 대표 업무와 CP3 상세 기록은 완료했다. 종료 문서 후속 커밋/CI는 로컬 최종 영수증과 최종 응답에 기록하며 이 문서 자체 해시를 미리 단정하지 않는다. main 병합·직원 배포 금지.

사용자용 기준 문서: [첫 페이지 비교표·업무별 8항목 상세](../../../docs/superpowers/plans/2026-10-16-mes-main-candidate-comparison-report.md). 재개용 기준: [현재 단계와 다음 행동](2026-10-16-mes-main-candidate-comparison-handoff.md). 실제 직원 원문은 ignored runtime에만 둔다.

## 2026-10-19 별도 후속: 완료 1 / 전체 1

- [x] AS·연구 완료창의 잘못된 창고 결재 문구 정정. 후보 `782eb344` 위 공용 제출 함수 분기만 수정. 기존 관련 Vitest 42건·ESLint·production 빌드·3.25MiB 번들 검사 통과. 후보 실제 AS 전용 요청에서 새 제목을 확인하고 해당 QA 요청만 취소했다. 사용자 연구 요청은 대기로 보존. 원문은 `C:/ERP/_attic/runtime/main-candidate-20261016/manual-review-20261019/label-*`, 상세는 비교 보고서 AS02 후속. 화면 크기 경고는 제외. 커밋·푸시·main 반영·직원 배포 없음. 위 CP4 미확정 두 건을 해결한 것으로 표시하지 않는다.

- [x] CP0 환경 고정 (2026-10-16): main 29583972, 대기 5927e532. 새 후보 codex/mes-main-candidate-comparison-20261016에 자동 병합 충돌 없음, 후속 e9560587에 커밋. 개발/직원 online backup 및 schema/SQLite/FK 검증 완료. 직원 원형에서 A/B 분기, 기존 업무 86개 테이블 보존 및 후보 신규 nullable 필드 백필 없음 확인. QA 직원 6명은 사본에만 추가. 실행자료 C:/ERP/_attic/runtime/main-candidate-20261016/pair-preparation.json.
- [x] CP1 공통 시나리오·1920×1080·근거 재사용 확정 (2026-10-16). A/B 별도 호스트와 탭, 부모만 조작. 실제 DOM 크기를 확인하고 로그인 뒤 크기가 풀린 경우 재적용하며 사진 저장 시 크기를 검사한다. 이전 CI는 당시 근거로 구분하고 새 승인 정책 소비자는 국소 재실행.
- [x] CP2 지정 AP/IO/DF/BOM/SH/HI 대표 브라우저·위치 수량·취소 비교, 관련 자동/유효 과거 근거 연결 (2026-10-16). 전 조건 신규 UI PASS 아님. 각 업무의 미실행 범위를 유지한다.
- [x] CP3 첫 페이지 판단표·업무별 상세 재현/수량/화면/한계·인계 기록 (2026-10-16). 기존 자료 복원 뒤 묶음별 갱신. `final-completion-audit.md/json` 읽기 감사 및 로컬 갤러리 추가 완료.
- [ ] CP4 일반 조회 성능·최종 production·관련 검사·후보 커밋/푸시/CI.

실행 중 기존 보고서를 새 조합 PASS로 승격하지 않는다. 직원 QA 준비는 A/B 사본에만 적용하고 기존 품목/BOM/재고는 보존한다.

## CP2 진행 근거 (2026-10-16)

아래는 수행 당시의 경과다. 당시 남았던 production 실화면은 후속 PROD-AP01/DF01/SH01에서 완료했고, CONV 대표 품목 차이의 원인은 `R/observed-display-differences-review.md`에서 대상 제품 우선 표시로 확인했다. 현재 미확인 조건은 상세 보고서의 각 업무 마지막 항목을 따른다.

- AP01: 창고 전담의 조립 낱개 입고는 생산부 결재 대기. 고압 소속 생산부 정 승인 후 조립 1→2/창고 438 불변, 취소 후 초기 수량 복원. A/B 동일. `AP01-*-comparison.json`.
- AP02/IO02: 생산부 전담의 창고→조립 이동은 창고 결재 대기 및 예약 1. 창고 정 승인 뒤 창고 438→437/조립 1→2, 생산부 정이 조립 2개를 실제 출고. 출고→이동 역순 취소 후 모든 재고·예약 초기 복원. `AP02-IO02-final-comparison.json`.
- 공통 기존 문제 관측: 창고 이동 취소 시 stock request/line은 CANCELLED, io batch는 completed 유지. 실제 AP02 내역 목록·상세는 취소 표시와 사유가 정상이며 단일 이동의 별도 완료 badge는 없었다. 현재 UI 차단 근거 없이 내부 묶음 상태 불일치로 기록한다. `AP02-batch-status-readonly-analysis.json`, `A/AP02-cancelled-status-visible.png`.
- DF01 완료: 7-PR-0095 창고 격리 3개(원건 2+1), 부분 복귀 1, 일괄 복귀 2, 복귀 재고의 출하 공정 이동 및 취소, 복귀/격리 역순 취소를 브라우저에서 실행. 총 290/창고 101/출하 189/격리 0 및 모든 예약 복원. 원거래와 취소 정확한 일대일 연결·무관 재고 불변 확인. 후보는 일괄 복귀가 한 작업으로 취소되고 main은 두 작업 개별 취소. `DF01-final-comparison.json`.
- DF01 검색 차이: 양쪽 동일한 사유 메모를 main의 내역 검색은 찾지 못하고 후보는 찾음. 후보의 reason_memo 검색 추가에 따른 승인된 차이. `DF01-memo-search-analysis.json`.
- PR01/DF02: 46-AA-0080 실제 BOM 생산 2, 조립 B급/구형 각 1 격리, 원래 조립 정상 재고로 각 1 복귀 완료. 자식 46-AR-0073/0074는 생산 때 각각 조립 6→4, 창고와 무관 재고·예약 불변. 최초 분류 이력 보존. `PR01-comparison.json`, `DF02-data-comparison.json`.
- PR02: 복귀한 2개를 실제 BOM 분해하여 부모 조립 2→0, 부품 각 4→6. 전 품목 재고·위치·예약 최초 수치 일치 확인. 수량 원복과 작업 취소를 혼동하지 않으며 생산·복귀·분해 원문 이력은 보존. `PR02-comparison.json`.
- 새 공통 기존 UI 결함: 둘째 격리 사유를 빈 메모 상태에서 기타로 변경하면 입력 영역 높이가 0이 되어 메모 입력 불가. A/B 실화면과 `DEFECT-OTHER-LIVE` 수정 전 실패를 보존. inline-size containment 제거 때만 정상이며 flex·너비·경계 이동은 실패했다. 후보는 같은 content width 380px 기준을 ResizeObserver로 관찰하여 기존 배치를 유지한다. 관련 PC/모바일 E2E 7건 재시도 없이 통과, 관찰자 임계·해제 포함 Vitest 80건/ESLint 통과. 특정 Chromium 등록 결함으로 단정하지 않는다. 실제 DB 반영 전 입력 단계 결함이며 격리 결과의 수량 검증과 구분. 최종 production 실화면 확인은 남음.
- RW01/AS01: 두 서버에서 기존 공급업체 원자재 1개 입고→같은 창고 재고 AS 사용 1→취소를 실행했다. 양쪽 원자재 화면에서 공정품 46-AA-0080은 선택되지 않는다. 3-AR-0004 창고 438→439→438→439, 조립 1 유지. 원자재 입고 1은 남겨 둔다. QA 겸임의 창고 사용은 창고 역할로 자가승인되며 AS 전용 결재 경로와 구분한다.
- SH01 완료한 조건: 양쪽 새 QA 요청으로 6-PF-0050와 동반 7-PR-0095 각1 요청→준비→픽업→픽업 취소→준비 취소→요청 취소. `SH01-comparison.json`에서 수량·예약·원작업/역작업·원거래/역거래 유일 연결, 무관 재고·기존 예약 불변 확인. 기존 운영 요청은 처리하지 않음. BOM2·3 직후 다음/뒤로 유지 확인, 실제 제출은 표준1·1로 복원. 변경 BOM의 실제 출하 성공으로 세지 않음.
- 관련 검사: 승인/IO 198건, 확장 복귀 34건, 출하 단위/중복 4건, 승인 정책 연결 소비자 16건 통과. 기존 main 복귀 테스트의 일괄 취소 6조건이 후보의 한 작업 취소 계약과 달라 실패한 원문 보존 후 단언 보강, 해당 파일 18건 통과. 독립 리뷰 차단 지적 없음. 후보 `comparison-checks`에 원문/소스 해시 저장.
- AS02 완료 조건(16:44): 양쪽 QA-B 조립1 AS 요청은 AS 전용 승인 대기, QA-AS만 승인·취소. 총/창고/조립/예약 440/439/1/1 → 439/439/0/0 → 440/439/1/0. 원작업/역작업·거래 유일 연결, 전품목 수량·예약 복원. `AS02-comparison.json`, `AS02-record.md`. 실제 권한은 정상이나 완료 모달의 ‘창고 결재’ 문구는 A/B 기존 문제로 남김. 역할 회수/부재/반려/동시성 전체 UI는 미확인.
- 후보 production 빌드·빌드 내부 TypeScript·번들 검사 통과(3,379,878 bytes / 3.25MiB 한도). 원문 `comparison-checks/production-build.log`, `production-bundle.log`. production 업무 화면은 아직 미실행. RO 이전 타입 결과를 최신 타입으로 재사용한 것이 아님.

## CP3 완료분 기록 복원 (2026-10-16)

- PROD-SH01(17:54): B최종production BOM2·3즉시다음/뒤로유지→기본1·1복원→PF/가방각1출하·역순취소. PF출하5→4→5, 가방출하189→188→189/창고101불변, 준비예약각1/픽업0/픽업취소각1/준비취소0. 원역작업2·거래2쌍유일·전품목복원, `PROD-SH01-comparison.json` PASS(지정조건). 상세·첫표·인계 반영 후 커밋 단계 진행. 변경BOM실제출하/Aproduction은미실행.

아래 시각별 문장은 당시 경과를 보존한다. 현재 잔여는 맨 위 현황과 CP4 마지막 항목을 따른다.

- PROD-DF01(17:39): Bproduction기타live입력58px·제출→창고격리2→일괄복귀→복귀한번취소→격리각취소. 창고101/99/101/99/101·출하189·격리0/2/0/2/0, 원건잔량·원역작업3/거래4/격리이동4쌍유일·최종전품목복원. `PROD-DF01-comparison.json`. 상세/표/인계 갱신 후 production출하로진행. 신규후속사용미실행.

- PROD-AP01(17:31): B최종production에서QA-W요청→QA-D(진공부)조립입고승인·취소. 총440→441→440/창고439불변/조립1→2→1/예약0, 전품목복원·원역연결유일. `PROD-AP01-comparison.json`; 상세·표·인계기록 후 production격리·복귀로진행. A신규production실행아님.

- REPORT01 후속판정/REPORT02(17:24): REPORT01 네품목·QA-N·시각과정책8.20-07/11연결, A기존표시문제/B보완. REPORT02현재주6공정값A/B동일·B170/1544합계일치, SH01 PF5/순0표시. 화면·정확경로·미확인조건을상세/첫표에반영. 새업무/전체보고재검사없음. 다음B production핵심.

- REPORT01(17:22): QA-N 취소한CONV01의일보 조회. A완료2건8EA/B완료0건·취소1건,네원거래/역거래방향표시. 화면·8항목상세·첫표기록완료, 코드/DB정확연결은comparison_a읽기대조중. 전체일보PASS아님. `A,B/REPORT01-conversion-details.*`.

- DETAIL01(17:20 기록): QA-N 양쪽 검색·열린/닫힌 상세 새로고침 유지, B품명복사 clipboard일치. 상세290/창고101/출하189/대기0. 조회로 DB전체불변까지 증명하지 않음. `DETAIL01-closed-check.json`, B/`DETAIL01-clipboard.json`과 A/B3단계 화면. 상세·첫 표 반영 후 보고 화면 진행.

- SET01(17:13): A/B QA-W 미저장테마취소→테마/사이드바저장→reload유지, QA-N로그인후기존설정불변. 실제직원전체행digest·다른QA외형불변. QA-W dark/collapsed는테스트결과로유지. 품목/재고업무아님. 다른탭·실패·동시저장은과거근거와구분. `SET01-comparison.json`/`SET01-record.md` 및단계별snapshot, 상세·첫 표갱신.

- ADJ01(17:08): A/B QA-W 창고 보정입고1·취소 완료. 총440→441→440/창고439→440→439/조립1·예약0불변, 전품목 수량 복원·원역작업/거래 유일. `ADJ01-comparison.json`, `ADJ01-record.md`; 상세·첫 표·인계 갱신 후 설정/상세/보고로 이동. 후속사용·반대방향 보정은 미실행.

- CONV01(16:57): A/B QA-N 조립 전환1과 묶음 취소 완료. 원본55→54→55/대상143→144→143/추가부품20→19→20/회수부품0→1→0, 창고·예약·무관 수량 불변. 원작업1/원거래4와 역연결 유일. 후속 사용은 미실행. 대표품목 A회수부품/B대상제품 차이 원인은 미확인. `CONV01-comparison.json`, `CONV01-record.md`; 상세·첫 표 갱신 후 다음 보정으로 진행.

- [x] 기존 스냅샷·화면·로그만 읽어 AP01/AP02/IO02/DF01/PR01/DF02/PR02/RW01/AS01/SH01 및 입력/검색 차이 상세 작성. 목적·순서·전후표·후속·취소·판정·직원 영향·정확 경로·미확인 조건을 기록. 새 업무나 기존 통과 검사 재실행 없음.
- [x] 33단계의 A/B 화면 짝과 파일별 SHA256 색인 작성. 실제 직원 자료는 `C:/ERP/_attic/runtime/main-candidate-20261016/documentation-paired-screens.md` 및 같은 루트의 원문에만 보존.
- [x] 공통31단계 stock/pending 대조 `all-workflow-stock-parity.json`, AS 표시 정정 `history-approval-display-review.json`, 재사용 경계 `reuse-scope-final-draft.md`를 연결. 원본 성능 INCONCLUSIVE·실패 로그는 덮어쓰지 않음.
- [x] 이후 묶음마다 상세·첫 비교표·이 TODO·인계 진행 단계를 갱신한 뒤 다음 묶음으로 이동했다. 마지막 production SH까지 기록 완료.

## CP4 현재 결과와 남은 조건

- 20:35 읽기 조사 완료: CI-IO는 실패 구간에도 조립7/7/7·창고 각10을 보존했고 원요청 취소 응답은 정상이나 취소 후 예약 전체 대조는 없음. CI-SHIP은 fill2 이후 표시와 매칭 POST 모두1. 기본BOM 응답은 입력 전에 끝나 지연응답 덮어쓰기 가설은 배제했지만 실제 입력 처리 순서는 미확정. 보고서에 각각8항목과 직원 영향·한계를 추가했다. 새 검사/추측패치 없이 두 건을 병합 보류 사유로 남긴다. 원문과 읽기 조사 `R/ci-flaky-io-review.md`, `ci-flaky-shipping-review.md`는 ignored에 보존한다.

- 20:28: eddd0811 CI 8개 job 성공. 일반 E2E의 IO-RESEARCH-RETURNS(요청 조회500/동시 proxy ECONNRESET), SHIP-VARIANT(BOM2 입력 후1)은 최초 실패 후 재시도 통과. 원본 `T/ci-eddd0811-general-success.log`, `ci-eddd0811-playwright-general/parsed/31c072176dbc914ff430.json`, `parsed/e3fcbb0aa0d6604ef331.json` 및 같은 report의 data/trace를 보존했다. 새 업무/전체 검사 없이 실패 자료 읽기 조사부터 진행한다. 원인·직원 영향은 미확인.

- 19:58: `eddd0811` 후보 푸시와 CI38886739485의7job 성공. backend는 pytest·PG·OpenAPI 전부 성공, 일반 E2E만 남음. `T/ci-eddd0811-{frontend,backend}-success.log`, `ci-eddd0811-postgres/`에 원문 보존. 새검사 없이 문서감사의 현재/과거 혼동을 정리 중이며, 아래 시각별 문장은 과거 경과다.

- 19:20: backend의 실제 실패는 OpenAPI 기준 설명2곳 차이뿐. 현재 코드와 기준의2description만 다름을 메모리DB 설정으로 재현→2줄수정→생성명세SHA동일확인→`7143b5c8`커밋. pytest/PostgreSQL 단계는 성공했으며 PG88조건 skip/error/fail0 실행자료 보존. 상세8항목·첫표·인계 갱신. 다음은 기록 포함 후보 push와 새 HEAD CI. 기존 일반 E2E 진행 중 상태를 완료로 세지 않는다.

- 19:12: `395cab9c`까지 후보 푸시 완료. CI38882322838은6개 성공·backend/general E2E 진행 중. `T/ci-395cab9c-frontend-success.log`에 현재 HEAD의4,601단위·coverage·lint/type/build/bundle 성공을 보존했다. 아래 시각별 문장은 과거 경과이며, 현재 단일 잔여는 나머지 CI 결과와 종료 기록이다.

- 18:42 알림시험/원장후속 `5a77fbf1`커밋. 해당1pytest·원장생성/check·제안JSON동일성·cached check통과. 결정문장1개,현재알림단언2수정/2추가,같은파일266해시연결만정렬;기존92조건binding·execution·원문보존.전체기대값PASS아님. 새CI6f프론트단위/커버리지통과,최종HEAD CI는후속푸시뒤확인한다.

- 18:36 추가 backend1실패: 첫CI의 생산부 알림 closure시험이 창고담당자 포함 옛기대를 유지했다. 실제 현재서비스/queue와 분리정책 확인 후 해당시험만 알림수신정·부/창고제외·창고승인함빈배열로보완, 선택자1통과. 제품·업무DB무변경. 후속원장연결과정확HEAD CI남음. `6f9a6aff`는푸시했고CI38881026887진행중이며 이추가시험수정은미포함. 첫일반E2E는취소/미완료,첫backend는취소전실제실패로구분. 상세·첫표반영.

- 18:18 CI 국소 수정: 첫4커밋 `e9560587/c7c4628f/5f660a90/fb2558d2` 후보만 푸시. CI38877549662 프론트4,593통과·8실패 원문 보존. WorkChoice의 관찰자 대역/정리 누락7건과 실사 회차 이동 동기화1건을 시험만 수정하여 해당 파일19/92건 및 ESLint 통과. WorkChoice 현재 binding4개/선언줄만 갱신, 과거 이력 보존. 실사 정확한 내부 이벤트 순서는 미확정. 제품·DB·업무 검증 반복 없음. 상세 첫 표·8항목·인계 반영, 새 HEAD CI 대기.

- 원장현재연결(17:06): 확정 권한 결정2개·4변경시험의binding85개/선언줄6개를국소정렬. 이전binding/execution·불변원문보존,1058NOT_RUN유지. generated재생성후 `--check` exit0,190입력전후동일. `ledger-after-apply-record.md`, `ledger-check-20261016-02/final-preservation-receipt.json`. 전체재실행·PASS승격없음.

- 일반 품목 목록/검색/상세 p95 A70.0/57.7/22.4ms, B63.6/49.3/23.9ms, 내용 동일. 각30회 교대·오류0·소스/DB가드 통과. 내역 p95 A2572.1ms/B868.4ms; AS 승인자·시각32필드는 원형과 B 일치, A 표시 누락 정정. 원측정 파일은 그대로 보존. 새 필드 전체 의미·고부하까지 통과로 세지 않음.
- 과거 입력103파일 중93개는 줄바꿈만 정규화한 내용 동일. 권한5·상세wrapper4·안내1 변경은 별도. 실제 실행에서 빠진 IO5조건과 새 상세wrapper 검사는 미확인으로 남김. 정확 명령과 근거는 reuse-scope-final-draft.md.
- 16:35 국소 보충 완료: IO5조건5/5, 상세wrapper2파일24/24, EOF 관련 Node12/12. 기존 검사 반복 없이 미확인 소비자만 실행했고247입력 해시 불변. `supplemental-checks-record.md`, T/supplemental-20261016-01-summary.json. 이전 재사용 초안의 미확인은 당시 상태로 보존한다.
- 남음: 연결 reset과 BOM 입력 유실의 원인·영향 판정, 종료 문서 후속 HEAD CI 확인. CI38886739485는 이미8job 성공했지만2flaky를 해결 완료로 세지 않는다. 일보/주간·production 핵심과 당시 소스967/재사용입력103/원장입력190해시불변·불변원문/과거실행해시보존·정제문서 읽기 감사 기록은 유지한다. 후속 시험3파일 변경 후 해당 binding만 정렬하며 이전 전체 입력이 여전히 같다고 주장하지 않는다. 유효 근거는 반복하지 않는다.
- 이미 유효한 권한/IO/복귀/출하/RO/성능/빌드는 입력이 바뀌지 않으면 반복하지 않는다. 전체 기대값·전체 로컬 게이트는 재시작하지 않는다.
