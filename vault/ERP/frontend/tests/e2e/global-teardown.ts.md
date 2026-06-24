# global-teardown.ts

## 이 파일은 뭐예요?
Playwright e2e 전체 실행 후 딱 한 번 호출되는 전역 정리 파일입니다. 전용 백엔드 프로세스를 종료하고, 전용 DB(`mes_e2e.db`)를 삭제하며, 실 `mes.db`가 e2e 도중 변경되지 않았는지 SHA256으로 검증합니다.

## 언제 보나요?
- e2e 실행 후 전용 백엔드 프로세스가 좀비로 남아 포트 8021을 점유할 때
- 실 `mes.db`가 오염됐다는 오류 메시지(`치명적: 실 mes.db 가 e2e 도중 변경됨!`)가 뜰 때

## 중요한 내용
- `globalTeardown()` — Playwright `globalTeardown` 훅의 기본 export
- `killBackend()` — PID 파일 기반 1차 종료 + netstat/lsof 폴백으로 포트 8021 잔존 프로세스까지 제거 (Windows/POSIX 양쪽 처리)
- 실 DB 불변 검증: `HASH_FILE` 해시와 현재 해시가 다르면 즉시 Error throw
- 임시 파일 3개 삭제: `.e2e-backend.pid`, `.e2e-realdb-hash`, `.e2e-seed.json`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/tests/e2e/global-setup.ts]] — 쌍을 이루는 셋업 파일 (DB 생성·백엔드 기동·시드)
- [[ERP/frontend/playwright.config.ts]] — globalSetup/globalTeardown 등록
