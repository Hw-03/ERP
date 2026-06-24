# test_admin.py

## 이 파일은 뭐예요?
`app.dependencies.admin.require_admin_pin` FastAPI Depends 어댑터를 단위 테스트하는 파일입니다. 테스트 전용 미니 FastAPI 앱을 직접 구성해 7개 케이스(헤더·body·query param·PIN 오류·누락·우선순위·GET 엔드포인트)를 검증합니다.

## 언제 보나요?
- `require_admin_pin` 의존성 동작이 의심스러울 때 (헤더 우선순위, 403/400 응답 코드 등)
- 관리자 PIN 인증 흐름을 변경하거나 버그를 수정한 뒤 회귀 테스트 결과를 확인할 때

## 중요한 내용
- `_build_app(db_session)` — `get_db`를 override한 테스트 전용 FastAPI 앱 팩토리. GET·POST `/protected` 엔드포인트를 동적으로 등록합니다.
- `protected_client` fixture — `db_session` fixture를 받아 `TestClient`를 반환합니다.
- 검증 케이스 7종:
  1. `X-Admin-Pin` 헤더로 유효 PIN → 200
  2. body `pin` 필드로 유효 PIN → 200 (기존 호환)
  3. query param `pin`으로 유효 PIN → 200 (deprecated 호환)
  4. 잘못된 PIN → 403, `detail.code == "BAD_REQUEST"`
  5. PIN 누락 → 400, `detail.code == "BAD_REQUEST"`
  6. 헤더와 body 동시 존재 시 **헤더 우선**
  7. GET 엔드포인트에서 헤더·query 인증, 누락 시 400

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/dependencies/admin.py]] — 실제 `require_admin_pin` 구현체
- [[ERP/backend/app/database.py]] — `get_db` 의존성 (테스트에서 override 대상)
