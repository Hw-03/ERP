# global-setup.ts

## 이 파일은 뭐예요?
Playwright e2e 전체 실행 전에 딱 한 번 호출되는 전역 셋업 파일입니다. 실 `mes.db`를 건드리지 않도록 전용 DB(`mes_e2e.db`, 포트 8021)를 새로 초기화하고, 백엔드를 기동한 뒤 테스트용 품목·BOM·직원 데이터를 시드합니다.

## 언제 보나요?
- e2e 테스트 실행(`playwright test`)이 실패하는 원인을 추적할 때 — 백엔드 기동 실패, bootstrap 실패, 시드 누락 여부 확인
- 테스트 격리 구조(전용 DB·포트)를 이해하거나 변경하고 싶을 때

## 중요한 내용
- `globalSetup()` — Playwright `globalSetup` 훅의 기본 export. 이 함수가 전체 플로우를 순서대로 실행
- 실 `mes.db`의 SHA256 해시를 `HASH_FILE`(`.e2e-realdb-hash`)에 저장 → teardown에서 불변 검증
- 전용 DB 경로: `backend/mes_e2e.db` / 전용 포트: `8021` (dev 8011·prod 8010과 무충돌)
- `seed()` — 창고 역할 직원(E22), 부서 결재 직원(E04), 원자재(TR)+조립(TA) 품목, BOM 1:2 관계 생성, 결과를 `.e2e-seed.json`에 저장
- `waitForHealth()` — 백엔드 `/health/live` 폴링(최대 30초)
- `rmDbFamily()` — `-wal`, `-shm` 포함 DB 파일 전체 삭제

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/tests/e2e/global-teardown.ts]] — 쌍을 이루는 정리 파일 (백엔드 종료 + DB 삭제 + 해시 검증)
- [[ERP/frontend/tests/e2e/_helpers.ts]] — 시드 결과를 읽어 각 spec에 배포하는 `readSeed()`
- [[ERP/frontend/playwright.config.ts]] — globalSetup/globalTeardown 등록 및 webServer 설정
- [[ERP/backend/bootstrap_db.py]] — 전용 DB 초기화에 사용
