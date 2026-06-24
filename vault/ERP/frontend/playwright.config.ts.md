# playwright.config.ts

## 이 파일은 뭐예요?
Playwright E2E 테스트 환경 설정 파일입니다. 전용 백엔드(포트 8021)와 전용 프론트(포트 3100)를 띄워 실제 `mes.db`에 손대지 않고 E2E 테스트를 격리해서 실행하도록 구성합니다.

## 언제 보나요?
- E2E 테스트가 실패하거나 타임아웃이 발생할 때 설정값을 확인할 때
- 새 E2E 테스트 환경을 구성하거나 포트·타임아웃 설정을 바꿀 때

## 중요한 내용
- `testDir`: `./tests/e2e` — E2E 테스트 파일 위치
- `FRONT_PORT = 3100`, `BACKEND_PORT = 8021` — 실 운영 포트(3000/8010)와 완전 분리
- `fullyParallel: false`, `workers: 1` — SQLite 동시 쓰기 충돌 방지를 위해 순차 실행
- `globalSetup` / `globalTeardown` — `./tests/e2e/global-setup.ts`, `global-teardown.ts`가 전용 DB·백엔드·시드를 자동 처리
- `timeout: 60_000`, `expect.timeout: 10_000` — CI 러너 부하·next dev 컴파일 여유 확보
- `locale: "ko-KR"`, `timezoneId: "Asia/Seoul"` — 한국 환경 고정
- `trace: "on-first-retry"`, `screenshot: "only-on-failure"`, `video: "retain-on-failure"` — 실패 시 디버그 정보 보존

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/📁_frontend]] — frontend 폴더 안내판
