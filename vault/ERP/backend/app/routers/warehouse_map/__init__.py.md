# __init__.py

## 이 파일은 뭐예요?
창고 지도 라우터 패키지의 진입점. 서브 모듈(`query`, `angles`, `boxes`)의 라우터를 하나의 `router`로 합쳐 FastAPI 앱에 등록할 수 있게 한다.

## 언제 보나요?
- FastAPI 앱에서 창고 지도 라우터가 어떻게 마운트되는지 확인할 때
- 경로 충돌 우선순위(정적 `/angles/reorder` → 동적 `/angles/{id}`) 규칙을 파악할 때

## 중요한 내용
- `router = APIRouter()` — 세 서브 라우터를 순서대로 포함
- 포함 순서: `query.router` → `angles.router` → `boxes.router` (정적 경로가 먼저)
- `__all__ = ["router"]`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/routers/warehouse_map/query.py]] — 공개 GET 엔드포인트 묶음
- [[ERP/backend/app/routers/warehouse_map/angles.py]] — 앵글 CRUD
- [[ERP/backend/app/routers/warehouse_map/boxes.py]] — 박스 CRUD
