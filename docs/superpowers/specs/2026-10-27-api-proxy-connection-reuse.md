# API 프록시 유휴 연결 재사용 오류 조사·수정

## 현재 적용 정책 — 2026-10-28

전체 `Connection: close` 처리는 아래에 남긴 과거의 임시 수정이다. 현재 개발 코드는 `frontend/scripts/next-server.js`의 공식 custom server 진입점과 공개 `httpxy@0.5.6`으로 API를 한 경로에서 전달한다. `frontend/proxy.ts`와 외부 API rewrite는 제거했다. 페이지·정적 파일·HMR은 Next가 처리하며, 직접 Next CLI의 dev/start를 실행하는 방식은 API를 전달하지 않는다.

- `api-agent.mjs`: 백엔드 전용 keep-alive, LIFO, 최대 연결 256·유휴 64, 유휴 만료 1초. 단조 증가 시계로 요청 직전에도 만료·종료 소켓을 검사하고, 재사용 시 타이머와 정리 리스너를 취소한다. 활성 조회·저장·SSE에는 유휴 만료를 적용하지 않는다.
- `api-proxy.mjs`: 브라우저·백엔드의 연결별 헤더를 독립적으로 처리한다. 경로·쿼리·본문·상태·쿠키·작업자 헤더를 보존하고 Next의 슬래시 리다이렉트와 API 접두사 대소문자 처리를 유지한다. 본문은 스트리밍하며 자동 재시도는 하지 않는다. 상류 비활성 제한 30초, 전송 실패의 500 계약을 유지한다. WebSocket은 별도 연결을 사용한다.
- 분할 요청의 전송 정보는 헤더 정리 전에 보관하고 공개 `proxyReq` 훅에서 상류 프레이밍을 복원한다. DELETE/OPTIONS에 자동으로 붙는 길이 0을 제거해 GET을 포함한 분할 본문을 보존한다. `Expect: 100-continue`는 훅이 생략되므로 호출 전에 프레이밍을 복원하며, 이 예외만 응답 완료 후 상류 close를 허용한다. 브라우저 연결은 계속 재사용한다.
- 기존 감독 프로세스·진단·프로필별 산출물 분리를 유지한다. raw/start·Playwright·격리 QA도 같은 진입점을 사용한다. 개발 서버 3001만 표준 스크립트로 재시작했고 백엔드와 직원 프로세스의 PID·시작 시각은 유지됐다. 구현·검증 단계에서는 직원 배포·커밋·푸시를 수행하지 않았다.

실제 Uvicorn 기본 유휴 종료 5초에 Node 이벤트 루프 5.2초 중단·본문 20ms 지연을 조합한 독립 재현에서, 무관리 풀은 `ECONNRESET`이고 새 전달 경로는 200·POST 1회였다. 전송·연결 풀·실제 Next/HMR·종료 회귀 28개, 종료 진단 Vitest 19개, production 빌드와 PC·모바일 BOM 미리보기가 통과했다. 기존 과거 QA 한 건의 원인을 확정할 수 없다는 아래의 해석 경계는 그대로 유지한다.

읽기 전용 스냅샷과 동일 백엔드를 통과하는 production HTTP로 close·무관리 재사용·새 관리 방식을 비교했다. 6종 조회를 조건별 100회, 동시성 1·5·10·20 및 SSE 혼합으로 측정했다. 초기 비교와 교차 후속 측정·집계 재검증을 합친 업무 조회 15,600건은 응답 해시가 같고 오류·취소가 0이었다. 종료를 위해 의도적으로 해제한 SSE는 정상 조회 취소 수에 포함하지 않는다.

- 새 관리 방식의 순차 합성 100회에서 양쪽 신규 TCP 연결은 각각 0개로 재사용률 100%였다. close는 각각 100개였으며, 최종 전송 p95는 6.835ms→1.926ms였다.
- 최초 세 방식 비교의 새 관리 방식 p95 최댓값은 일반 867ms·혼잡 4,749ms였다. 시간대 편차를 줄인 교차 측정에서는 각각 776ms·2,028ms로 일반 2초·혼잡 5초 기준을 통과했다. 이는 해당 스냅샷·호스트·조회 조건의 측정값이며 직원 환경의 보장값이 아니다.
- 교차 비교 30조건 중 집계 동시성 5에서 상대 악화 기준을 한 번 초과했다(245.1ms→401.4ms). 원자료를 보존하고 미리 정한 세 차례의 추가 교차 측정에서 매번 조건별 100회씩 확인했다. 세 차례 모두 허용 범위 안이었고 p95 중앙값은 268.3ms→233.2ms였다. 최초 변동의 원인을 특정했다고 주장하지 않는다.

최종 원자료·처리량·응답 해시·측정 한계는 `_attic/runtime/proxy-pool-20261028/results.md`, 화면 증거는 `_attic/runtime/mes-browser-regression/proxy-pool-20261028-a/results.md`에 보존한다. 실행 항목은 `docs/superpowers/plans/2026-10-28-managed-api-proxy.md`를 따른다.

같은 날 후속 리뷰에서 발견한 분할 DELETE/OPTIONS 본문 유실은 별도 수정했다. 새 실패 재현의 400을 확인한 뒤 전체 프록시 회귀 42개가 통과했다. 실제 production 진입점과 DB 없는 Uvicorn에서 본문 보존을 확인했고, 일반 분할 순차 100회의 브라우저/상류 재사용률은 100%/99%였다. 후속 근거는 `_attic/runtime/proxy-framing-20261028/results.md`에 분리한다. 위 대규모 성능 측정의 원자료·당시 소스 해시·기존 화면 검증을 이번 수정 버전의 재측정으로 간주하지 않는다.

## 아래 기록의 상태

아래 내용은 2026-10-27의 조사·close 수정·측정에 대한 역사적 기록이다. **[STALE: 현재 연결 정책·실행 방법으로 사용하지 않는다.]**

## 결론과 과거 사건의 확정 범위

Node 20.20.2 / Next 16.3.4 / 내부 httpxy / Uvicorn 0.29 기본 keep-alive 5초 조합에서, API 서버가 닫은 유휴 TCP 연결을 Next가 아직 감지하지 못한 채 다시 쓰는 경합을 재현했다. 응답 헤더 이전에 연결이 끝나면 `socket hang up`, `ECONNRESET`, 프록시 HTTP 500이 발생한다. 합성 Uvicorn 실험에서는 해당 POST가 ASGI 처리 함수에 도달하지 않았다. 같은 본문·쿠키를 새 연결로 보내면 정상 응답했다.

과거 QA 사건에는 소켓 재사용 여부·유휴 시간·이벤트 루프 지연 기록이 없으므로, 그 한 건의 원인을 같은 경합으로 확정하지 않는다. 재현의 5.2초 이벤트 루프 중단과 20ms 본문 전달 지연은 경합을 결정적으로 만드는 합성 조건이며, 당시 개발 컴파일이 이 조건을 만들었다고 입증한 것은 아니다. 기존 사건의 완료 로그 부재도 ASGI 미도달의 증명으로 확대하지 않는다.

구 QA의 로그인 화면 복귀는 별도로 확인했다. 유효한 작업자 토큰이 있어도 탭 소유권 확인 중 작업 건수 조회가 즉시 인증 실패로 판단하는 경합을 old/current 소스의 메모리 실행으로 재현했다. 이 문제는 기존 커밋 `4075e0c1`에서 이미 수정돼 있어 이번 작업에서 인증 코드를 다시 바꾸지 않았다. 미리보기 호출에는 AbortSignal이 없고, 일반 500 응답을 곧바로 로그아웃시키는 경로도 없다.

## 최소 수정

`frontend/proxy.ts`를 Next 16의 공식 서버 진입점으로 추가한다. 실제 파일은 `app`과 같은 프로젝트 루트에 있으며, `/api/:path*` matcher로 API에만 적용한다.

- API 요청 헤더의 `Connection`을 `close`로 전달해 완료된 연결이 유휴 풀에 남지 않게 한다.
- 비어 있지 않은 `Upgrade` 값과 쉼표로 구분한 `Connection`의 정확한 `upgrade` 토큰이 모두 있는 실제 업그레이드 요청은 기존 헤더를 유지한다. Upgrade 헤더만 있는 일반 HTTP 요청은 우회하지 않는다.
- 기존 URL rewrite, 상태·본문·쿠키·작업자/행위자 헤더 및 요청 횟수를 유지한다. 저장 요청 자동 재시도는 추가하지 않는다.
- 화면 경로·정적 파일·HMR은 matcher에 포함하지 않는다. DB·권한·업무 계산·패키지·node_modules는 수정하지 않는다.

Next의 일반 `httpAgentOptions`는 이 문제의 해법이 아니다. 설치된 httpxy는 별도의 모듈 공용 Agent를 만들어 쓰므로 Node globalAgent 설정을 바꾸어도 이 rewrite 연결에는 적용되지 않는다. 의존성 내부 패치나 전체 API 전달 구현 교체 대신 공식 요청 헤더 경계만 사용했다.

## 연결 비용과 적용 조건

Uvicorn은 요청의 `Connection: close`를 응답에도 반영하고 httpxy가 이를 전달하므로, 브라우저의 API 연결도 종료될 수 있다. **브라우저 응답 헤더 전체가 불변인 수정은 아니다.** 인증 같은 요청 전용 값이 응답으로 유출되지 않는 것과 연결 헤더 변화는 구분한다. API 호출마다 새 TCP 연결이 필요하며, 일반 페이지·정적 파일과 실제 WebSocket/SSE 동작은 별도로 확인한다.

합성 Next 개발 서버의 준비 호출 후 GET 100회씩 순차 비교에서 p95는 9.696ms→24.809ms, p50은 5.912ms→19.237ms였다. 기존에는 측정 구간에 새 client/upstream TCP 연결이 없었고 수정본은 각각 100개였다. 이 차이에는 재연결·Proxy 실행·개발 모드 및 통제하지 못한 다른 세션 CPU가 포함된다. 순수 TCP 비용이나 직원 환경의 응답 시간으로 일반화하지 않는다. 신뢰성 확보를 위한 연결 재사용 포기 비용으로 기록한다.

기존 프로세스의 유휴 풀은 파일 수정만으로 비워진다고 보장할 수 없다. 실제 배포 시 프런트 프로세스를 재시작해 새 설정으로 시작해야 한다. 이번 검증은 새 전용 QA 프로세스로 수행하며, 직원 환경 배포·원본 서버 수동 재시작·커밋·푸시는 포함하지 않는다.

## 회귀 검증

- 설치된 원본 Next `proxyRequest`와 독립 HTTP 서버를 사용한 RED에서 실제 `socket hang up`/HTTP 500을 확인하고, 수정 후 HTTP 200·새 소켓·본문/인증 보존·POST 1회 전달을 검증했다.
- 잘못된 Upgrade 헤더가 유휴 풀을 만들고 다음 정상 요청을 실패시키는 추가 RED를 재현했다. 두 헤더 조건을 함께 확인한 뒤 일반/불완전/정상 Upgrade와 실제 TCP 회귀 9개가 통과했다.
- 독립 실제 Next 앱의 Proxy→rewrite→httpxy→합성 upstream 경로에서 JSON 및 chunked binary 본문, Cookie·작업자·행위자 헤더, Set-Cookie 유지와 요청 전용 응답 헤더 비노출을 확인했다. SSE의 초기/후속 chunk·연결 해제 정리, WebSocket 101, 일반 페이지·실제 `_next/static` 미적용도 통과했다.
- 대상 3파일 ESLint·최종 국소 TypeScript가 통과했다. 프런트 전체 TypeScript 검사도 통과했으며, 이후 좁은 Upgrade 조건 변경은 해당 파일의 국소 검사로 보완했다. 별도 인증 회귀 15개도 통과했다.
- 과거 소스와 overlay 해시를 그대로 복원한 새 QA에서 일반 조건의 BOM 미리보기는 정상이었다. 따라서 과거 오류를 일반 UI 클릭만으로 항상 재현한 것으로 주장하지 않는다. 최종 코드의 실제 DEXCOWIN MES PC·모바일 검증 결과는 별도 QA 실행 폴더에 기록한다.
- 최종 QA에서는 실제 로그인, 알림 읽음 저장, PC의 6초 대기 후 BOM 미리보기 및 모바일 미리보기·수량 단계가 모두 정상이었다. 두 preview는 각각 HTTP 200/26ms였고 프록시 오류·로그인 이탈은 관찰하지 않았다. 종료 전 DB·원장 readiness가 정상이며 임시 탭·viewport·소유 QA 서버를 모두 정리했다.

## 근거

- 과거 사건: `_attic/runtime/mes-browser-regression/additional-query-20261027-a/`.
- old 소스 복원 QA: `_attic/runtime/mes-browser-regression/proxy-reset-replay-20261027-a/`.
- 최종 QA: `_attic/runtime/mes-browser-regression/proxy-reset-fixed-20261027-b/`.
- 조사·소켓 재현·RED/GREEN·비용·실제 Next 배선 원자료: `_attic/runtime/proxy-reset-20261027/`의 `transport-findings.md`, `uvicorn-delayed-body-repro.log`, `vitest-red.log`, `vitest-upgrade-red.log`, `vitest-upgrade-green.log`, `next-entry-fixed-final-guard.json`, `next-cost-baseline.json`, `next-cost-fixed.json`.

임시 서버는 소유한 프로세스만 종료하고 원자료는 보존한다. 과거 사건의 원인 확정과, 재현된 전송 경합의 차단 및 현재 전송 계약 검증은 각각 구분한다.
