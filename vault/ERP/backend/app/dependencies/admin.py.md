# admin.py

## 이 파일은 뭐예요?
관리자 PIN 인증을 FastAPI `Depends`로 제공하는 어댑터입니다. HTTP 헤더(`X-Admin-Pin`) → query 파라미터 → request body 순서로 PIN을 추출한 뒤 `require_admin`으로 검증합니다.

## 언제 보나요?
- 관리자 전용 엔드포인트에 PIN 인증을 추가하거나 수정할 때
- `X-Admin-Pin` 헤더가 없는데 인증 오류가 나는 원인을 추적할 때
- 새로운 admin 라우터를 작성할 때 (`require_admin_pin` 사용법 참고)

## 중요한 내용
- `extract_admin_pin(request, x_admin_pin, pin)` — 헤더 → query → body 순으로 PIN 문자열 추출, 없으면 400
- `require_admin_pin(pin_value, db)` — 추출된 PIN을 `require_admin(db, pin)` 으로 검증, 실패 시 예외. 반환값은 `None`
- 우선순위: `X-Admin-Pin` 헤더 > `pin` query param > body의 `pin` 필드
- 엔드포인트 시그니처 패턴: `_admin: Annotated[None, Depends(require_admin_pin)]`

## 위험도
🔴 높음 — 전체 관리자 기능의 인증 게이트. 로직 변경 시 모든 admin 엔드포인트 보안에 영향.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/settings.py]] — `require_admin` 실제 구현 (PIN DB 검증)
- [[ERP/backend/app/routers/_errors.py]] — `ErrorCode`, `http_error` 헬퍼
- [[ERP/backend/app/database.py]] — `get_db` 세션 의존성
