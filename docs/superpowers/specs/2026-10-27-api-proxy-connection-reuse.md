# API 프록시 유휴 연결 재사용 오류 조사·수정

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
