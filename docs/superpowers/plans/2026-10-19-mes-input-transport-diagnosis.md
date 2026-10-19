# AS 요청 지연 보완·BOM 입력 전달 경계 실행 계획

**추천 모델: GPT-6.1 Sol** — 진단 도구와 실제 실패 계층을 구분한다.
**추천 추론 수준: Extra High** — 관측 영향과 제품 상태 경합의 인과 근거가 필요하다.
**실행 방식: 하위 에이전트 병렬 준비 + 부모 순차 실행** — AS/BOM 도구를 분담하고 실제 실행·판정은 순차 수행한다.

**GOAL:** AS의 요청 전 DOM 스냅샷 대기를 제거하고, BOM은 자동 입력 명령부터 React 값 복원까지 추적한다. 2026-10-19 사용자가 승인한 실행 계획의 저장본이다.

## CP0 — 환경·한도

- 후보 `codex/mes-main-candidate-comparison-20261016`, 기준 `63d4ed59acf223e6cad62b3a360d905825d92021`. 기존 미커밋 AS 문구·기록 보존.
- 사용자3038/8038·검토 DB/session·BOM 초안·연구 요청 보존. main·직원 서버/DB·예약·커밋·푸시·CI 실행 제외.
- 별도 Linux synthetic source와3100/8021만 사용. 기존 Node20.20.2/Python3.11.17/Playwright1.60/Chromium1223·lockfile 재사용.
- AS 새 요청 구간1회, BOM q2-fill/q2-key/q3-key/q3-fill 각각1회 최대4건. 첫 실패/조건 미충족/관측 누락에서 중단. 기존 종료 한도를 새 폴더로 우회하는 재실행이 아니라 새 승인 범위다.

## CP1 — AS 도구 보완·한 구간

- 시간표의 browserFetch만 기존CDP `Runtime.callFunctionOn`으로 바꾸며 실제Chromium fetch·APIRequestContext·프록시·입출력·의존성 유지. trace snapshots와네트워크원문 보존.
- CDP/문서/반환형 오류는 도구 조건 실패, 실제fetch/bodyread 실패는 요청 실패로 분리한다.
- 업무 없는 국소RED→GREEN과 실제 설치Playwright probe로 요청 전 스냅샷 대기 제거·한 번 발행·상태/본문/오류·원문보존·새 비밀 복사본 부재 확인. 기존HAR에 포함될 수 있는 인증정보와 진단JSON을 구분한다.
- 단일preload의 두 관측기가 실제Next worker에 설치됐는지 준비요청으로 확인. 시계10ms/발행20ms 기준 유지.
- 원manifest와간격을 유지한 새 구간1회. 새미리보기토큰 사용. 첫 실패/시각초과/누락에서 새 발행 중단, 기발행 수집 후context 종료 전에trace/DB/socket/process 보존. 원read ECONNRESET/-104 귀속은 별도 판단.

## CP2 — BOM 새 입력 경계

- 기존SSE4조건은 반복하지 않는다. 실제QuantityInput의 fill→needsinput→Input.insertText와 Ctrl+A→숫자키 Input.dispatchKeyEvent를 비교한다.
- 입력선택/포커스, 프로토콜송수신, native, React DOM/tracker 비교·change큐·복원, 제품enqueue/updater/렌더, 매칭본문을 제한메모리ring으로 연결한다. 원함수1호출·반환/예외를 보존하고 임계구간에추가await/스냅샷/파일쓰기를 넣지 않는다.
- 실제실행번들/hash/map으로development/production 관측위치를 식별한다. 도구on/off동등성·비대상비밀미기록·관측누락거부를 작은 검사로 확인한다.
- 동등한 별도초안에서 q2-fill→q2-key→q3-key→q3-fill 각1회, 즉시다음매칭수량까지. 재입력/sleep/응답보류/가짜알림/임의state/다른사용자변경 없음.
- 첫2/3→1 write의전후값/스택을고정한뒤진단browser만pause하여선별locals/큐출처회수. pause이후는자연타이밍증거제외. 자료보존후남은조건중단.
- 실패가잡힌조건만 관측축소/해제대조최대2건. 정상4건이면추가반복없이미확정종료.

## CP3 — 확보한 원인만 수정

- 수정전실패→최소수정후성공→원인변수되돌림 또는동등한인과근거. 제품/자동화/도구중확인된계층만수정.
- 제품결함수정시새회귀retry0 10회·직접원선택자3회, 첫실패중단·마지막계측off. BOM입력/매칭/저장/기본BOM불변, AS제출1회/조회/승인시점/위치수량단언유지.
- 제품코드변경때만production·3.25MiB번들·별도인앱흐름. 전체업무검사/커버리지/성능/복구/기대값반복제외.

## CP4 — 기록·종료

- 각묶음후 상세결과·첫표·활성TODO·인계동시갱신. 새도구수정/새결함/과거귀속/직원영향/미확인/재사용을구분.
- ignored로컬원문·해시·실행명령·DB/프로세스식별값보존. 소유진단프로세스만종료, 보호환경불변대조.
- 조사종료와원인해결을분리한다. 정상관측만으로해결완료/병합가능으로승격하지않는다.
