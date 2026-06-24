# 📁 dependencies

## 이 폴더는 뭐예요?
FastAPI 라우터에서 `Depends()`로 주입하는 인증·권한 검증 의존성들을 모아 둔 폴더입니다. 각 파일은 특정 역할(관리자 PIN, 창고 관리자)의 접근 제어를 담당합니다.

## 언제 여기를 보나요?
- 엔드포인트에 인증/권한 조건을 추가하거나 변경할 때
- 403/400 인증 오류의 발생 지점을 추적할 때
- 새로운 역할 기반 접근 제어가 필요한 라우터를 작성할 때

## 주요 파일
- `admin.py` — 관리자 PIN 인증 (`require_admin_pin`). 헤더·query·body 3경로 지원
- `warehouse_manager.py` — 창고 정/부 관리자 + 본인 PIN 검증 (`require_warehouse_manager`)

## 관련 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/settings.py]] — `require_admin` 실제 PIN 검증 로직
- [[ERP/backend/app/services/pin_auth.py]] — PIN 해시 검증 서비스
- [[ERP/backend/app/models/📁_models]] — `Employee.warehouse_role` 필드
