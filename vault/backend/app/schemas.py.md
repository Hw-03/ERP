---
type: code-note
project: ERP
layer: backend
source_path: backend/app/schemas.py
status: active
tags:
  - erp
  - backend
  - schema
  - pydantic
aliases:
  - API 스키마
  - 데이터 형식
---

# schemas.py

> [!summary] 역할
> FastAPI가 API 요청/응답 시 사용하는 데이터 형식(Pydantic 모델)을 정의한다.
> 프론트엔드가 보내는 데이터와 백엔드가 돌려주는 데이터의 형태가 모두 여기 있다.

> [!info] 주요 책임
> - 품목 생성/수정 요청 스키마 (ItemCreate, ItemUpdate)
> - 재고 입출고 요청 스키마 (ReceiveRequest, ShipRequest, AdjustRequest 등)
> - 직원, BOM, 출하패키지, 생산, 큐 배치 등 전체 도메인 스키마
> - 응답 스키마 (ItemResponse, InventoryResponse 등)

> [!warning] 주의
> - 이 파일의 스키마가 바뀌면 프론트엔드의 `lib/api.ts` 타입 정의도 함께 맞춰야 함.
> - Pydantic v2 기준으로 작성됨.

---

## 쉬운 말로 설명

**API 요청·응답 데이터의 틀(mold)**. 프론트에서 JSON 보낼 때 "어떤 필드가 필요하고 어떤 타입이어야 하는지" 검증하는 규칙 모음.

`models.py` 가 **DB 테이블 구조**라면 `schemas.py` 는 **API 인터페이스 구조**. 둘은 비슷해 보이지만:
- `models.py` = SQLAlchemy (DB 전용)
- `schemas.py` = Pydantic (HTTP 전용)

FastAPI 가 `@router.post(..., response_model=ItemResponse)` 같은 식으로 스키마 지정 → 자동 검증 + Swagger 문서 생성.

---

## 주요 스키마 그룹 (661줄 전체)

### Item 관련
- **`ItemCreate`** — 품목 신규 등록 요청
  - `item_name`, `spec`, `category` (CategoryEnum), `unit` (기본 "EA")
  - `barcode`, `supplier`, `min_stock`
  - 레거시: `legacy_file_type/part/item_type/model`
  - `initial_quantity` (기본 0)
  - `model_slots: List[int]` (공유 제품 슬롯, 1~5)
  - `option_code` (BG/WM/SV 등)
- **`ItemUpdate`** — PATCH 용 (모든 필드 Optional)
- **`ItemResponse`** — GET 응답
  - `item_id` (UUID), `erp_code`, `model_symbol`, `model_slots`
  - `symbol_slot`, `process_type_code`, `option_code`, `serial_no`
  - 타임스탬프(created_at/updated_at)

### Inventory 관련
- **`ReceiveRequest`** — `POST /inventory/receive`
  - `item_id`, `quantity`, `supplier`, `operator`, `memo`
- **`ShipRequest`** — `POST /inventory/ship`
  - `item_id`, `quantity`, `destination`, `operator`, `memo`
- **`AdjustRequest`** — 수동 조정
  - `item_id`, `new_quantity`, `reason`, `operator`
- **`TransferRequest`** — 부서 이동
  - `item_id`, `from_dept` (Optional), `to_dept`, `quantity`, `operator`
- **`MarkDefectiveRequest`** — 불량 격리
  - `item_id`, `quantity`, `reason`, `operator`, `source_dept` (Optional)
- **`SupplierReturnRequest`** — 공급사 반품
  - `item_id`, `quantity`, `operator`, `memo`
- **`InventoryResponse`** — GET 응답
  - 품목 기본 + 3버킷 수량 + `available` 계산값 + `buckets` 배열

### Queue 관련
- **`QueueBatchCreateRequest`** — 배치 생성
  - `batch_type` (PRODUCE/DISASSEMBLE/RETURN), `item_id`, `quantity`, `operator`
- **`QueueLineOverrideRequest`** — 라인 수량 수정
- **`QueueBatchConfirmRequest`** — 확정
- **`QueueBatchResponse`** — 상태 + 전체 라인 + Variance 등
- **`QueueLineResponse`** — direction/quantity/bom_expected

### BOM 관련
- **`BOMCreate/Update`** — CRUD
- **`BOMTreeNode`** — 재귀 구조
  - `item_id`, `item_name`, `quantity_per`, `current_stock`, `children: List[BOMTreeNode]`

### Codes 관련
- **`ProductSymbolResponse`** — slot/symbol/model_name/is_reserved/is_finished_good
- **`OptionCodeResponse`** — code/label_ko/label_en/color_hex
- **`ProcessTypeResponse`** — code/prefix/suffix/stage_order
- **`ProcessFlowRuleResponse`** — from_type/to_type/consumes_codes
- **`ErpCodeGenerateRequest`** — symbol/process_type/option
- **`ErpCodeResponse`** — erp_code/parts/validation

### Alerts / Counts / Others
- `AlertResponse`, `CountRequest/Response`, `EmployeeResponse`, `ShipPackageResponse` 등

---

## Enum 재사용

`schemas.py` 는 자체 Enum 을 만들지 않고 `models.py` 의 Enum 을 그대로 가져다 씀:
```python
from app.models import (
    CategoryEnum, DepartmentEnum, TransactionTypeEnum, ...
)
```
→ DB 와 API 의 Enum 값이 **절대 갈리지 않음**.

---

## Pydantic v2 특징

- `ConfigDict(from_attributes=True)` — ORM 객체에서 직접 필드 추출 가능 (구버전 `orm_mode=True` 의 신버전).
- `Field(...)` 로 제약(길이/최소/최대) + description (Swagger 에 표시).
- `Optional[X]` = `X | None` (Python 3.10+).

---

## 흐름 예시 (품목 등록)

```
프론트 fetch POST /api/items
body: { "item_name": "튜브", "category": "RM", ... }
  ↓
FastAPI가 ItemCreate 로 자동 검증
  ↓ (필드 빠짐 / 타입 오류 → 422 자동 반환)
라우터 함수 item_create(payload: ItemCreate)
  ↓ DB 저장
return ItemResponse.from_orm(item)
  ↓
FastAPI가 ItemResponse 로 자동 직렬화 → JSON
  ↓
프론트가 TypeScript 타입과 매칭
```

---

## FAQ

**Q. `ItemCreate` 에 있는 필드를 바꾸면?**
프론트 `lib/api.ts` 의 타입 정의도 같이 수정. 안 하면 TypeScript 빌드 오류.

**Q. 새 Enum 값 추가는 어디?**
`models.py` 에 추가 → `schemas.py` 는 자동 반영.

**Q. `from_attributes=True` 안 쓰면?**
ORM 객체 → Pydantic 변환 시 `AttributeError`. 응답 스키마엔 필수.

**Q. 요청과 응답 스키마가 왜 다름?**
요청은 **사용자 입력 필드만**(UUID/타임스탬프 없음), 응답은 **DB에서 계산된 필드까지 모두** (id/계산된 available 등). 분리가 표준.

**Q. 661줄인데 더 쪼갤까?**
도메인별로 `schemas/items.py`, `schemas/inventory.py` 분리 가능. 현재는 편의상 한 파일. 프로젝트 성장 시 고려.

---

## 관련 문서

- [[backend/app/models.py.md]] — Enum/ORM 정의
- [[frontend/lib/api.ts.md]] — TypeScript 타입 미러
- [[backend/app/routers/routers]] — 각 라우터에서 참조

Up: [[backend/app/app]]
