---
type: index
project: ERP
layer: backend
source_path: backend/app/routers/
status: active
tags:
  - erp
  - backend
  - router
aliases:
  - API 라우터 목록
---

# backend/app/routers

> [!summary] 역할
> REST API 엔드포인트를 기능별로 분리한 라우터 파일들이 모인 폴더.
> 총 14개 라우터가 있으며, `main.py`에서 각각 `/api/...` 경로로 등록된다.

## 라우터 목록

| 파일 | API 경로 | 주요 기능 |
|------|----------|-----------|
| [[backend/app/routers/items.py.md]] | `/api/items` | 품목 마스터 CRUD, 엑셀 내보내기 |
| [[backend/app/routers/inventory.py.md]] | `/api/inventory` | 입고·출고·조정·이력 |
| [[backend/app/routers/bom.py.md]] | `/api/bom` | BOM 등록·조회·트리 |
| [[backend/app/routers/production.py.md]] | `/api/production` | 생산 입고, BOM 체크 |
| [[backend/app/routers/queue.py.md]] | `/api/queue` | 생산 대기열 배치 관리 |
| [[backend/app/routers/employees.py.md]] | `/api/employees` | 직원 마스터 CRUD |
| [[backend/app/routers/ship_packages.py.md]] | `/api/ship-packages` | 출하 패키지 관리 |
| [[backend/app/routers/alerts.py.md]] | `/api/alerts` | 안전재고 알림 |
| [[backend/app/routers/counts.py.md]] | `/api/counts` | 실물 재고 조사 |
| [[backend/app/routers/scrap.py.md]] | `/api/scrap` | 스크랩(불량) 기록 |
| [[backend/app/routers/loss.py.md]] | `/api/loss` | 손실 기록 |
| [[backend/app/routers/variance.py.md]] | `/api/variance` | BOM 차이 기록 |
| [[backend/app/routers/codes.py.md]] | `/api/codes` | ERP 코드 체계 조회 |
| [[backend/app/routers/settings.py.md]] | `/api/settings` | 관리자 핀, DB 리셋 |

---

## 쉬운 말로 설명

"라우터"는 URL별 담당자. 예를 들어:
- `/api/items/...` 로 온 요청은 `items.py` 가 처리
- `/api/inventory/...` 로 온 요청은 `inventory.py` 가 처리

FastAPI 라이브러리를 통해 각 라우터가 자동으로 모여 하나의 서버가 된다. `main.py` 에서 14개 라우터를 전부 등록한다.

---

## 라우터 역할별 그룹화

### 마스터 데이터 CRUD
- [[backend/app/routers/items.py.md]] — 품목 마스터
- [[backend/app/routers/employees.py.md]] — 직원 마스터
- [[backend/app/routers/codes.py.md]] — 코드 체계 마스터
- [[backend/app/routers/bom.py.md]] — BOM 마스터

### 재고 이동 처리
- [[backend/app/routers/inventory.py.md]] ⭐ — 입/출/이관/불량 (가장 많이 쓰임)
- [[backend/app/routers/production.py.md]] — 빠른 생산 입고
- [[backend/app/routers/queue.py.md]] ⭐ — 배치 기반 정밀 처리

### 예외 기록
- [[backend/app/routers/scrap.py.md]] — 폐기
- [[backend/app/routers/loss.py.md]] — 손실
- [[backend/app/routers/variance.py.md]] — BOM 차이

### 관리 기능
- [[backend/app/routers/alerts.py.md]] — 안전재고 경고
- [[backend/app/routers/counts.py.md]] — 실사 재고 조사
- [[backend/app/routers/ship_packages.py.md]] — 출하 패키지
- [[backend/app/routers/settings.py.md]] — 관리자 설정

---

## 공통 패턴

모든 라우터는 다음 구조를 따른다:

```python
router = APIRouter(prefix="/api/xxx", tags=["xxx"])

@router.get("")        # 목록
def list_xxx(...): ...

@router.get("/{id}")   # 단건 조회
def get_xxx(...): ...

@router.post("")       # 생성
def create_xxx(...): ...

@router.put("/{id}")   # 수정
def update_xxx(...): ...
```

실제 로직은 `services/` 에 있다. 라우터는 **요청 받기 + 검증 + 서비스 호출 + 응답**만 담당.

---

## FAQ

**Q. `/docs` 로 접속하면 뭐가 나오나?**
FastAPI 자동 생성 Swagger UI. 브라우저에서 API를 직접 테스트해볼 수 있다. 주소: `http://localhost:8000/docs`.

**Q. 라우터 하나 추가하려면?**
1. `routers/new_feature.py` 생성
2. `APIRouter` 정의
3. `main.py` 에 `app.include_router(new_feature.router)` 추가

**Q. 요청 본문 JSON 형식은 어디 정의되어 있나?**
`schemas.py` 의 Pydantic 클래스. 예: `ItemCreate`, `InventoryAdjustRequest`.

---

## 관련 문서

- [[backend/app/app]] (상위)
- [[backend/app/services/services]] — 라우터가 호출하는 로직
- [[backend/app/schemas.py.md]] — 요청/응답 형식
- [[frontend/lib/api.ts.md]] — 이 라우터들을 호출하는 프론트엔드
- 재고 입출고 시나리오, 생산 배치 시나리오

Up: [[backend/app/app]]
