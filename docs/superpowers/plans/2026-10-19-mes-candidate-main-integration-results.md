# 최신 main을 후보에 결합한 검증 기록

**2026-10-20 16시대 현재 판정: 후보48ddea95의 production 일반 키 입력→바로 다음→제출→새로고침 후 저장 확인을1회 통과했다. 사용자와 정한 마지막 메모 확인 조건은 충족했고, 해당 검증 후보의 병합을 권고한다. 과거 간헐 실패 원인 확정은 별도 후속으로 남긴다. main·직원 환경은 변경하지 않았다.**

## 최종 production 메모 확인 — 지정 흐름 1회 통과

사용자는 원인 확정을 기다리는 조건을 병합 판단에서 분리하고 production의 일반 입력 경로를 한 번만 확인하도록 승인했다. 아래는 그 신규 실행 결과이며, 앞선 미확정 원인을 해결했다고 표시하지 않는다.

| 단계 | 기대 | 실제 |
|---|---|---|
| 입력 | 일반 키 경로로 메모 한 번 입력 | `pressSequentially`로 `QA-PROD-MEMO-20261020-ONCE` 입력. fill·재입력·고정대기 없음 |
| 바로 다음 | 최종확인 화면에 같은 문구 | 입력 뒤 다른 조회/스냅샷 없이 다음 클릭, 같은 메모 표시. 입력완료→클릭완료230ms |
| 제출 | 새 QA 요청 한 건과 동일 메모 저장 | 제출1회·POST201 한 번·해당메모 원건1 |
| 새로고침 | 서버에서 다시 읽은 상세에도 같은 문구 | 새 원건 상세 열기→reload→동일 메모가 표시됨. 로컬 DB 값도 일치 |
| 무관 자료 | 기존 업무·수량 보존 | 기존 출하요청 전체 행, inventory/inventory_locations/bom/shipping_allocations 전체 행 digest 불변 |

재현 순서: 격리 `http://127.0.0.1:3039` → QA 겸임 로그인 → 출하 → 출하 관리 → 새 요청 → `6-PF-0050` 선택·수량1·기본 BOM 유지 →2·3·4단계 → 메모 키 입력 직후 다음 → 출하 요청 → 방금 만든 원건 상세 → 새로고침. 준비완료·픽업·취소나 응답 유실 주입은 이번 대상이 아니다. 실제 뷰포트는1914×884이며1920×1080 실행으로 표시하지 않는다. 해당1회 이외 업무 재실행은 없다.

환경·근거 위치: Rprod=`C:/Users/user/.codex/worktrees/mes-main-candidate-comparison/ERP/_attic/runtime/production-memo-20261020`, Lprod=`/home/hw/production-memo-20261020`.

- 후보HEAD48ddea95의 제품·설정·lockfile 등1404개 입력이 기존 Linux 최종 source와 일치함을 확인해 빌드ID `hKCIuFnWnUqvs5XfLCsCu`를 재사용했다. 새 빌드·번들 검사·전체검사·CI는 실행하지 않았다. production JS/CSS 등114개 산출물도 원 빌드와 동일하다.
- 기존 검토DB를 온라인 백업으로 Rprod/qa.db에 만들고 새 Linux 사본에서만 처리했다. backend8021/frontend3039와 새 서명세션을 사용했다. 원 production 빌드의 API 목적지8010은 **새 QA 빌드 사본의 routes-manifest만**8021로 바꿔 원본 서비스 연결을 막았다. 앱 번들은 수정하지 않았다. SQLite QA의 backend설정은development이며 직원 PostgreSQL 배포 검증으로 확대하지 않는다.
- `preflight.json`, `session.json`: 시작소스·DB·스키마0047·프로세스·빌드 식별값. `browser-actions.json`: 입력·즉시다음·단일제출·reload 시각. `after-reload-ax.txt`, `after-reload.jpg`, `saved-memo-after-reload.jpg`: 새로고침 결과와 메모가 보이는 화면. 원문은 ignored에만 보존한다.
- `verification.json`: DB동일메모1건·POST201 한 번·기존업무/재고/BOM/예약 불변·산출물동일. `after.db`, `backend.log`, `frontend.log`: 온라인 사본과 원문. `cleanup-first.txt`: Next의 공백 포함 프로세스명 때문에 최초 종료가드가 거부한 도구문제와 수정. 올바른 /proc stat필드 파싱 뒤 같은 PID·시작시각·프로세스그룹 확인을 유지해 소유서버만 종료했다. 업무 실행은 반복하지 않았다.
- `postflight.json`: 보호검토DB/session 해시 불변·후보HEAD불변·전용포트해제. 사용자3038/8038 PID32400/32304 유지, 기존BOM초안/연구요청 미사용. 검증탭만 닫고 원래 탭을 유지했다. 커밋·푸시·배포·예약 변경 없음.

검증 도중 main/origin main은62ab7305에서 **81b5875d**로 전진했다. 추가1커밋은 전수조사 대기화면의3개 제품파일과 기록이며 출하·백엔드 파일 변경은 없다. 이번 작업은 Git 변이 명령을 실행하지 않았고 이를 후보에 자동 결합하지 않았다. 이번 production·CI 근거는48ddea95에 대한 것이다. 실제 병합 시 새 main 변경을 보존해 정상 결합하고 그 영향만 확인해야 하며, 새 코드 조합의 검증을 이미 끝냈다고 표시하지 않는다.

병합 판단은 **지정 메모 조건 충족·검증 후보 병합 권고**다. 과거 간헐 실패의 제품/자동화 구분과 원인·수정 목표는 미확정으로 유지하되 그것만을 이유로 무기한 병합 보류하지 않는다. 아래15시대 보류·진행불가 기록은 당시 원인조사의 이력으로 보존한다.

## 출하 메모 경계 — 승인한 1회 관측 종료

| 확인 대상 | 과거 실패 기록 | 이번 후보 관측 | 직원 영향·판정 |
|---|---|---|---|
| 메모 입력→다음 단계 | fill성공. 후속 원문 분석에서 다음 호출 전의 입력직후 DOM도 빈값 확인. native/React 기록 없음 | 명령→native→React→다음 모두 같은 메모 유지 | 이번1회 정상. 과거 제품/자동화 원인은 **미확정** |
| 응답 유실→재제출 | 빈메모로 첫201, 그 이후 메모 단언 실패 | 메모·같은키 유지, 제출2회·서버 원건1·저장메모 일치 | 이번 지정 조건 정상. 과거 입력유실 해결을 뜻하지 않음 |
| 화면 단계와 URL 시간차 | 입력 시 서로 달랐음 | 화면4/URL3에서 입력했어도 정상 보존 | 시간차 하나만으로 원인이라 판정할 수 없음 |

### 무엇을 왜 확인했는지

CI 실패에서는 응답 유실을 주입하기 전에 메모가 이미 빠져 있었다. 자동 입력 명령의 성공 반환과 실제 입력 성공을 구분하기 위해, 빠져 있던 native입력·React반영·초기화writer·단계이동·본문 경계만 새로 관측했다. 기존 `frontend/tests/e2e/shipping-expectations.spec.ts:352`의 입력→즉시 다음→제출·응답 유실→재제출 순서와 단언은 유지했다. 실제 입력은 `frontend/app/mes/_components/DesktopShippingView.tsx:3265`의 textarea→onNotes, 상태는 같은 파일303행이다. 다섯 setNotes 위치(441/1150/1177/1208/1232행)는 진단 사본에서 호출 직전만 기록했다.

### 서버·계정·품목과 확인 순서

- W=`C:/Users/user/.codex/worktrees/mes-main-candidate-comparison/ERP`, 후보=`codex/mes-main-candidate-comparison-20261016`, HEAD=`48ddea951a698d5f50571691b74fad5f777088b3`. main/origin main=`62ab7305bcb98f9304837b45f1112f45347dde9f`는 변경하지 않았다.
- 새 진단 L=`/home/hw/shipping-memo-boundary-20261020-152043`, Rm=`W/_attic/runtime/shipping-memo-boundary-20261020-152043`. 실행기·Chromium·Next·백엔드는 같은 Linux,3100/8021. `.git`/보호mes.db 없는 별도 source와 합성 `backend/mes_e2e.db`를 사용했다. Node20.20.2/Python3.11.17/Chromium1223·동일lockfile을 재사용했고 과거 GitHub runner의 누적 부하 전체를 재현한 실행은 아니다.
- 합성 요청자(창고/생산부 결재역할 없음)로 로그인 → 출하 요청 작성 → 합성 PF `3-PF-0001`(이번 생성명 `출하검수-pf-b5749080`) 선택 → 기존 기본구성 그대로2·3·4단계 → 요청메모에 고정 합성 문자열 입력 → 즉시5단계 → 제출. 서버201을 받은 뒤 첫 브라우저 응답만 원 테스트대로 유실시켜 메모·제출버튼 유지 확인 → 재제출 → 저장메모·요청키·서버 목록 확인.
- 원문 실행 명령은 Rm/run.sh의observe 분기다. 선택자는 `SHIP-RETRY PC`, worker1·retry0·max-failures1·trace on으로 **정확히1회** 실행했다. 입력 전 추가focus·준비대기·반복입력·timeout확대·단언삭제는 넣지 않았다. 정상 종료 뒤 같은 검사를 다시 실행하지 않았다.

### 예상과 실제

| 단계 | 예상 | 이번 실제·정확한 근거 |
|---|---|---|
| 입력 전 | 빈 메모 | shipping 문서의초기writer는url:new-draft, seq4 |
| 입력 명령 | 대상에 한 번 전달 | Input.insertText 송수신 성공, pending0/drop0. memo-boundary.json의network/input-transport |
| 실제 입력 | native 이벤트→onChange→화면 상태가 같은 값 | TEXTAREA uid8의seq87/89/92, React prop·추적값·DOM 모두 고정메모와 일치 |
| 다음 단계 | 메모 보존 | seq104(4→5), 입력 후30렌더에 빈메모 없음 |
| 제출·응답 유실 | 본문과 서버 저장값 일치, 화면 메모 유지 | seq122·POST201 모두 같은메모. 첫응답 유실은 테스트의 의도된route.abort |
| 재제출 | 같은키·서버원건1 | seq139·두번째201도 같은메모·같은원건. 마지막GET의 해당PF원건1, 원래단언 통과 |
| 재고·후속사용·취소 | 이번은 요청 작성 경계만 확인 | 준비완료/픽업/후속사용/취소는 미실행. 반환원건transactions0/allocations0은 읽었으나 위치별 전후재고·기본BOM 불변의 새 검증으로 세지 않음 |

**판정:** 이번 지정 조건은 정상이며, 과거 사건은 **구분 근거 부족(미재현)**이다. 자동화 문제라고 확정할 실패 경계와 일반사용자 대조가 없고, 제품이 값을 지웠다고 할 writer 기록도 없다. 일반 입력에서 같은 일이 생기면 출하 전달메모 누락 영향이 있지만 발생 가능성·원인은 이번 정상1회로 해소하지 못했다. 재고·수량 오류가 이 사건에서 발생했다는 증거는 없다. main에서 같은 조건을 새로 실행하지 않아 이번에main/후보 차이를 발견했다고 표시하지 않는다.

### 관측 도구·신규 검사·재사용·미실행

실제 React 소형화면에서 관측off/on의 변경1회·렌더2회·focus2회·제출값이 같았고, wire명령 송수신·누락0을 확인했다. 이 검사는 업무 실패 재현도, 실제 전체화면의 타이밍 무영향 증명도 아니다. 진단복사본의 관련ESLint는 통과했다. 초기fixture의 `use` 이름이 React hook규칙에 걸린 실패를 보존하고 `runTest` 명명만 바꾼 뒤 재검사했다. 관측은메모리버퍼에만 쓰고 setter/updater를 재호출하지 않았다. shipping기록151이벤트·오류/손실/잘린스택/일시정지0이며, 메모첨부를fixture/계정정리·context종료 전에 완료했다.

제품·원래테스트·lockfile·공유진단도구의tracked소스는 모두불변이다. 새 원인이 없으므로 실패회귀/수정/되돌림대조·일반사용자입력대조는 미실행이다. production빌드·번들·전체검사·새CI·과거BOM/AS조사는 반복하지 않았다. 기존CI·실패trace·관련검사·빌드의 근거는 당시 입력 범위대로 보존하며 이번 관측을 전체 기대값 완료로 확장하지 않는다.

### 정확한 자료와 종료 상태

다음은 모두 ignored Rm 안에 보관한다. 실제 직원 정보가 담긴 원자료나 DB는 문서에 복사하지 않는다.

- `preflight.json`, `prior-working-files/`, `prior-working.patch`: 시작 코드·문서3개·보호DB/session·입력 해시.
- `linux-evidence/observation-preparation.json`, `linux-evidence/source-observation.patch`: 진단 전후 소스해시·writer위치·업무본문 유지. `linux-evidence/observer-probe.json`, `linux-evidence/observer-probe-wire.json`: 도구off/on 검사.
- `observe-once.log`: 원선택자1pass/재시도0, 정리완료. `diagnostic-eslint.log`/`diagnostic-eslint-02.log`: 초기도구실패와통과.
- `memo-boundary.json`, `analysis.json`, `analyze.py`, `memo-boundary-screen.png`: 이벤트번호·요청키해시·서버목록·정리전보존 순서·정제분석·화면.
- `results-once/shipping-expectations-SHIP-fc7f3--06-응답-유실-뒤-초안·키-유지-및-서버-1건-chromium/trace.zip`: 이번원문. 내부 `resources/9b3681a617e2334804f9840cc06edd45818dd1ee.json`(본문), `1bce51663a12feffc207414479327ccf13f78d46.json`(201), `b410e3d673d60cce451fda40b2f93d28010fdb22.json`(마지막목록). route.fetch와브라우저의중복관측을 별도업무요청으로 세지 않았다.
- `postflight.json`:15:36 KST 후보/main/ref·제품/테스트/lockfile·검토DB/session 불변. 사용자검토3038 PID32400/8038 PID32304 유지. 소유WSL Next667/백엔드717 종료·진단3100/8021 해제. 합성DB는 원global teardown이 삭제했으며 원문trace/관측은 남겼다.

원인·수정 CP3는 미완료다. 승인한 한도에 따라 여기서 멈추며 동일정상검사나키보드대조를 추가하지 않는다. 새 실제실패의 입력/native/React/초기화 기록이 있을 때 최초불일치부터 분석할 수 있다. 자동후속예약·커밋·푸시는 만들지 않았다. 검토용3038/8038·BOM초안·연구요청·main·직원환경은 보존했다.

### 같은 날 후속 원문 분석 — 다음 호출 이전부터 기록상 빈 메모

새 업무 실행 없이 기존 실패trace의 증분 DOM 참조를 해제했다. Playwright의 `snapshotNodes` 후위순회·상대스냅샷/노드번호 계약을 설치된 `frontend/node_modules/playwright-core/lib/coreBundle.js`와 대조하고, `__playwright_value_`가 textarea.value를 직렬화하는 경로도 확인했다. 원문은 수정하지 않았다.

- fill종료: monotonic2956510.492ms.
- 입력직후 `after@call@34527`:2956518.371ms, 대상 `요청 메모`의 `__playwright_value_=""`. 이 스냅샷은 `[[1,18]]`로 직전 입력전DOM을 참조하고 있었다.
- 다음API시작:2956520.155ms. 즉 입력완료 약7.879ms 뒤·다음호출 약1.784ms 전부터 **기록상 빈값**이다.
- `before@call@34529`와 클릭직전 `input@call@34529`도 같은 빈값이다.

이로써 원래의 넓은 입력→다음 구간을 **입력 전달·처리 또는 입력 직후 복원 구간**으로 좁혔다. 다음 클릭 처리에서 최초로 사라졌다는 설명은 이 기록과 맞지 않는다. 단, 짧은 순간 값이 들어왔다가 사라졌는지와 애초 native입력이 전달되지 않았는지는 간헐스냅샷만으로 구분할 수 없다. 제품/자동화 원인 확정이나 새 수정 근거로 쓰지 않는다.

정확한 근거는 Rm/`original-dom-boundary.py`, `original-dom-boundary.json`이다. 원실패trace SHA256과 복원 알고리즘을 확인한 코드 SHA256, 네 스냅샷·타임스탬프를 함께 남겼다. 새업무실행0, 기존정상1회 한도 불변. 다음 분석에 필요한 것은 다음버튼 이후가 아니라 **원실패의 입력명령→native/React/최초값쓰기 기록**이다. 이를 확보한 실행은 현재 없다.

진행 불가 감사(2026-10-20): 같은 원자료 공백과1회정상관측 종료 조건이 세 목표 턴에 걸쳐 유지됐다. 현재 진행중인진단이나 새로운실패자료는 없다. 원인확정·수정 목표는 **blocked(진행 불가), 미완료**로 남긴다. 새 실패에서 빠진 경계를 관측한 자료나 별도로 판별 가능한 실행 범위가 있어야 재개할 수 있다. 정상검사를 반복하거나 추측수정으로 완료 처리하지 않는다. 감사 근거는 Rm/`goal-followup-audit-03.json`이다.

## 2026-10-20 CI 이후 병합 판단 — 출하 메모 입력 경계 확인 전 보류

사용자 요청에 따라 실제 실패 trace를 추가로 읽었다. main62ab7305는 원격에서도 동일하고 후보48ddea95의 조상이며, DB 계보·사전검사·창고/생산부 권한·복귀 위치 보호에서 이번 읽기 검토의 새 차단 사항은 발견하지 못했다. 다만 CI 성공을 직원 영향 없음으로 확대하지 않는다.

`SHIP-RETRY PC`의 실패 시도에서는 메모 fill 명령이 성공 반환했지만, **POST 이전**의 최종 화면부터 `입력된 메모 없음`이었다. 실제 생성 본문의notes=null, 서버201 응답의notes=null/PREPARING도 확인했다. 브라우저의 연결 실패는 테스트가 응답 유실을 재현하려고 의도적으로 만든 것이다. 따라서 메모가 사라진 경계는 응답 유실 이후가 아니라 메모 입력→다음 단계 구간이다. 자동 입력 전달 문제인지 제품 상태 처리 문제인지는 원래 trace에 native/React 입력 이벤트가 없어 구분하지 못했다. 메모가 정상 입력에서도 빠진다면 실제 출하 요청의 전달사항이 누락될 수 있어, 현재는 즉시 병합을 권하지 않는다. 재고·수량 손상이나 중복 요청이 이 실패에서 발생했다는 증거는 없다.

이 판단은 새 전체 검사를 반복한 결과가 아니라 CI artifact12243024446의 실패 시점 기록을 분석한 결과다. 근거: R/readiness-20261020/assessment.json, playwright-report-general/data/a7438a056688a5a82a493ae3e93fb78a371575c7.zip, data/33d64bc908f63744a477a1182bfedf490149bb3b.md, data/f0fbe1d1f06a8b7a2cdb1759529af59e548fbe89.png. trace의call@34527(입력),call@34529(다음),call@34535(제출), resources/83a5283f6e697bfddf57101dd57b04de263701f9.json(본문), resources/4c6a1c7843336db2a0a65ba84c158de0d41e9c08.json(201 응답)을 연결했다.

현재 남은 판단 조건은 메모가 입력된 순간 제품 상태에 반영됐는지, 다음 단계에서 왜 빈 값이었는지의 구분이다. 정상 입력 경로에 한정해 이를 확인하기 전에는 자동화에만 한정된 실패라고 확정하지 않는다. 과거 BOM/AS 원인 미확정도 이번 메모 사건과 같은 원인으로 묶지 않는다. 이번에는 제품·테스트·DB 수정, 서버 조작, 테스트 실행, Git 병합·커밋·푸시를 수행하지 않았으며 판단·인계 문서만 로컬 갱신했다. 실제 직원 DB의 다음 동기화 성공 여부는 이번 읽기 검토의 보장 범위 밖이다.

## CI 성공 확인 이력

예약 후속에서 [최종 CI39371380403](https://github.com/Hw-03/ERP/actions/runs/39371380403)의 브랜치·HEAD가 실제 후보48ddea951a698d5f50571691b74fad5f777088b3와 일치함을 확인했다. 전체8job은14:42:44 KST에 성공 종료했다. 일반 E2E는300건 첫 실행 통과·1건 재시도 통과다. 재시도한 `SHIP-RETRY PC`는 응답 유실 뒤 메모 표시를 첫 실행에서 찾지 못한 사건으로 원인 미확정이다. 이전 `SHELL02 shipping`은 이번 첫 통과했지만 과거 원인 해결로 소급하지 않는다. 실패 원문과 성공 결과를 함께 R의scheduled-ci-20261020-state.json/general.log/frontend.log에 보존했다. CI 성공 확인이므로 새 제품 수정·검사 반복·커밋·푸시는 수행하지 않았고 이 종료 기록만 로컬 갱신했다. 전체 기대값의 현재 실행 상태나 과거 미확정 원인은 승격하지 않았다. 아래 진행·실패 기록은 당시 이력이다.

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
