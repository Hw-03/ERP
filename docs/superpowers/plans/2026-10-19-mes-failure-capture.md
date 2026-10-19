# BOM·AS 실패 순간 보존 실행

**추천 모델: GPT-6.1 Sol** — 기존 진단 도구의 누락 경계를 보완한다.
**추천 추론 수준: Extra High** — 관측 영향과 원 실패·정리 중 오류를 구분한다.
**실행 방식: 하위 에이전트 병렬 조사 + 부모 순차 실행** — 조사·리뷰를 분담하고 수정·재현·Git은 부모가 수행한다.

**GOAL:** BOM 값을 되돌린 호출 경로와 AS 조회 연결을 끊은 주체를 포착하고 확인된 원인만 최소 수정한다.

## 승인 범위와 체크포인트

- CP0: 후보 `121706c3`의 소스·기존 변경·사용자 검토 서버 식별값 보존. main·직원 환경·3038/8038·사용자 초안 및 요청은 변경하지 않는다. 새 합성 DB/3100·8021, 같은 Linux 호스트의 기존 고정 런타임만 사용한다.
- CP1: BOM native setter를 보존한 조건부 writer stack, incident 버퍼, 누락 집계를 추가한다. React 상태 setter/scheduling을 바꾸지 않는다. AS는 실제 backend exit status, kernel socket/owner/close/reset 및 signal/OOM 정보를 연결한다. 지원하지 않는 필드를 추정하지 않는다. 작은 도구 안전성 검사와 실제 React 입력 보존 검사부터 통과시킨다.
- CP2: 원 일반 E2E 보고서의 선택·순서·worker 및 서버/DB 수명을 기록한다. 승인된 일반 묶음은 1회, worker1/retry0/repeat1/first failure stop. 기존 개별 test/API/readiness timeout은 그대로, 진단 job 준비 포함 상한만90분. 별도 AS 전용 묶음과 전체 CI는 실행하지 않는다. 실패 본문의 catch에서 정리 전에 snapshot/trace/log/온라인 DB backup을 보존하고 원 오류를 다시 던진다. 수집 완료/실패와 cleanup 시작을 분리한다.
- CP3: 새 실패가 지목한 경계만 대조한다. 결정 경계 누락이면 그 관측만 보강해 국소 실행한다. 모두 정상이고 새 단서가 없으면 반복하지 않고 미확정 유지. 확정 원인은 수정 전 실패→최소 수정 성공→되돌림 대조와 관련 회귀로 확인한다. 새 회귀10회/영향 원 선택자3회, 모두retry0이며 첫 실패에서 중단한다.
- CP4: 문제별 완료 시 상세 보고서·첫 표·TODO·인계를 함께 갱신한다. 신규/재사용/미실행, 과거 원 실패와 새 사건의 귀속을 구분한다. 원인 미확정이면 병합 보류를 유지한다.

## 도구 계약과 실행 제한

setter는 원 descriptor/getter/인수/this/예외/호출1회를 보존한다. 대상2·3→1 또는 합성 메모→빈값 때만 제한된 호출 스택을 수집한다. 정상 초기화도 incident가 될 수 있으므로 원 assertion과 대조하며 자동 결함 판정하지 않는다. PIN·쿠키·메모 원문·업무 본문은 수집하지 않는다.

API는 request→실제 socket 수명→소유 process→종료/RST→원 `read ECONNRESET errno=-104`→브라우저500을 연결한다. softirq current PID를 socket owner로 간주하지 않으며, TCP 패킷 방향/과거 EOF 실험만으로 원인을 선택하지 않는다. 도구 준비·기록 손실 가드를 통과해야 긴 실행을 시작한다.

기존 전체 백엔드·커버리지·성능·복구·기대값은 재실행하지 않는다. 제품 수정 때만 관련 정적 검사·production 빌드/3.25MiB·별도 인앱 진단 탭을 확인한다. 후보 전용 명시 진단 커밋·푸시는 승인되었으며 자동 시작한 일반 CI는 정확한 후보 SHA의 실행만 취소한다. 원격 main·직원 서비스·DB·예약은 변경하지 않는다.

시작 및 재개 기록은 `_attic/runtime/flaky-capture-20261019/preflight.json`과 활성 TODO/인계를 따른다. runtime 자료는 ignored이며 원문 실패와 이전 정상 근거를 덮어쓰지 않는다.
