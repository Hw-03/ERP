# 📁 dependencies

## 이 폴더는 뭐예요?
FastAPI `Depends` 어댑터(의존성 주입 함수)를 단독으로 검증하는 단위 테스트 모음입니다. 라우터나 DB 전체를 띄우지 않고, 테스트 전용 미니 앱을 구성해 의존성 로직만 격리해서 테스트합니다.

## 언제 여기를 보나요?
- 관리자 PIN 인증 등 `app/dependencies/` 안의 의존성 함수 동작이 의심스러울 때
- 의존성 코드를 수정한 뒤 회귀 테스트 범위를 파악할 때

## 주요 파일
- `test_admin.py` — `require_admin_pin` Depends 어댑터 단위 테스트 (7케이스: 헤더·body·query·오류·우선순위·GET)
- `__init__.py` — 패키지 마커 (빈 파일)

## 관련 파일
### 먼저 볼 파일
- [[ERP/backend/app/dependencies/admin.py]] — 이 폴더에서 테스트하는 의존성 구현체
