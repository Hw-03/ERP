---
type: code-note
project: ERP
layer: backend
source_path: backend/app/routers/items.py
status: active
tags:
  - erp
  - backend
  - router
  - items
aliases:
  - 품목 라우터
  - 품목 API
---

# items.py

> [!summary] 역할
> 품목 마스터(Item)에 대한 API 엔드포인트를 제공한다.
> 품목 조회·생성·수정과 엑셀 내보내기를 담당한다.

> [!info] 주요 책임
> - `GET /api/items` — 품목 목록 조회 (카테고리·검색·페이징·부서 필터)
> - `GET /api/items/{item_id}` — 단일 품목 조회
> - `POST /api/items` — 새 품목 생성 (ERP 코드 자동 부여)
> - `PUT /api/items/{item_id}` — 품목 정보 수정
> - `GET /api/items/export.xlsx` — 품목 목록 엑셀 다운로드
> - 바코드, legacy 필드, 공급업체, 최소재고, 모델 슬롯 등 다양한 필터 지원

> [!warning] 주의
> - ERP 코드 자동 부여 로직은 `utils/erp_code.py`에 있음
> - 엑셀 내보내기는 `utils/excel.py` 사용

---

## 쉬운 말로 설명

이 라우터는 **"품목 마스터 관리 창구"**다. 새 부품·자재·완제품을 등록하거나, 목록을 열어보거나, 정보를 수정하거나, 엑셀로 내보낼 때 모두 이 라우터를 거친다.

재고 변동(입출고)은 건드리지 않는다 — 그건 `inventory.py` 라우터 담당. 여기는 "품목이 존재하는가? 이름은? 카테고리는?" 같은 **정체(identity)** 문제만 다룬다.

---

## 엔드포인트 상세

### `POST /api/items` — 품목 생성

요청 예시:
```json
{
  "item_name": "ADX6000 튜브 어셈블리",
  "spec": "X-Ray, 125kV",
  "category": "TA",
  "unit": "EA",
  "legacy_part": "튜브파트",
  "legacy_model": "ADX6000",
  "model_slots": [3, 4, 6],
  "option_code": "BG",
  "initial_quantity": 0,
  "supplier": "ABC메탈",
  "min_stock": 2
}
```

내부 처리 순서:
1. `infer_process_type(category, legacy_part)` → `AR` (예시)
2. `slots_to_model_symbol([3,4,6])` → `"346"`
3. `next_serial_no("346", "AR")` → `12` (다음 일련번호)
4. `make_erp_code("346", "AR", 12, "BG")` → `"346-AR-0012-BG"`
5. `items` 행 INSERT + `inventory` 0행 생성 + `item_models` 3행 (슬롯당 1행)

응답: 생성된 Item 전체.

### `GET /api/items` — 목록

쿼리 파라미터:
| 이름 | 의미 |
|------|------|
| `category` | RM/TA/TF/...등 |
| `search` | 품목명·ERP코드·사양·바코드·위치 부분일치 |
| `legacy_file_type` | 원자재/조립자재/... |
| `legacy_part` | 자재창고/조립출하/... |
| `legacy_model` | DX3000/ADX6000/... (부분일치) |
| `department` | 창고/조립/고압/... (재고가 있는 품목만) |
| `barcode` | 정확 일치 |
| `skip`, `limit` | 페이징 (limit 최대 2000) |

응답은 `ItemWithInventory` — 품목 기본 + 재고 버킷 분해(창고/생산/불량/예약/가용).

### `GET /api/items/{item_id}` — 단건

찾을 수 없으면 404 `품목을 찾을 수 없습니다.`

### `PUT /api/items/{item_id}` — 수정

제공한 필드만 부분 수정. `erp_code`·`model_symbol` 같은 체계 필드는 여기서 바꾸지 않는다 (재부여가 필요하면 `scripts/reapply_erp_codes.py`).

### `GET /api/items/export.csv` — CSV 내보내기

ERP코드 순. 헤더: erp_code / item_name / category / spec / unit / quantity / location / updated_at.

### `GET /api/items/export.xlsx` — 엑셀 내보내기

카테고리별 배경색(RM=파랑, TA/TF=민트, HA/HF=노랑 등), 재고 < 최소재고면 빨간 글씨.

---

## FAQ

**Q. POST 시 `erp_code`는 왜 비워서 보내나?**
서버가 규칙에 따라 자동 생성한다. 클라이언트가 임의로 넣어도 덮어쓴다.

**Q. `initial_quantity`를 0 말고 양수로 보내면?**
해당 수량이 **창고수량**(warehouse_qty)으로 바로 들어간다. 단, 거래 이력(`TransactionLog`)은 생성하지 않는다. 초기 시드 용도로만 사용.

**Q. 이미 있는 품목을 다시 POST하면?**
`item_name`이 같아도 새 품목으로 생성된다. 유니크 제약은 `erp_code`에만 걸려 있어 중복 이름 허용. 운영 시 주의.

**Q. `department=창고` 필터와 `warehouse_qty > 0` 차이?**
같다. `department=창고`로 요청 시 서버가 `Inventory.warehouse_qty > 0`으로 변환한다. 나머지 부서는 `inventory_locations` 기준.

**Q. `symbol_slot` vs `model_slots` 차이?**
`symbol_slot`은 레거시 단일 슬롯(deprecated). `model_slots`는 복수 슬롯 (한 품목이 여러 제품에 공용). 신규 입력은 `model_slots` 사용.

---

## 관련 문서

- [[backend/app/models.py.md]] — `Item` / `Inventory` / `InventoryLocation` / `ItemModel` 테이블
- [[backend/app/schemas.py.md]] — `ItemCreate` / `ItemUpdate` / `ItemWithInventory`
- [[backend/app/services/inventory.py.md]] — `production_total` / `defective_total`
- [[backend/app/utils/erp_code.py.md]] — ERP 코드 생성 규칙
- [[backend/app/utils/excel.py.md]] — 엑셀 헤더·컬럼폭
- [[frontend/lib/api.ts.md]]
- 품목 등록 시나리오 — 품목 생성 전체 흐름

Up: [[backend/app/routers/routers]]
