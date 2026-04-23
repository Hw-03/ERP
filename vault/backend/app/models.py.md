---
type: code-note
project: ERP
layer: backend
source_path: backend/app/models.py
status: active
tags:
  - erp
  - backend
  - model
  - database
aliases:
  - DB 모델
  - 테이블 정의
---

# models.py

> [!summary] 역할
> SQLAlchemy ORM 모델을 정의하는 파일. 데이터베이스의 모든 테이블 구조가 여기 있다.
> 이 파일을 보면 ERP 시스템에서 어떤 데이터를 저장하는지 한눈에 파악할 수 있다.

> [!info] 주요 책임
> - **Item** — 품목 마스터 (이름, 규격, 카테고리, ERP코드, 바코드 등)
> - **Inventory** — 재고 현황 (창고수량, 생산수량, 불량수량, 예약수량)
> - **TransactionLog** — 모든 입출고 거래 이력
> - **Employee** — 직원 마스터 (부서, 등급, 활성여부)
> - **BOM** — BOM(자재명세서) 부모-자식 관계
> - **ShipPackage / ShipPackageItem** — 출하 패키지 구성
> - **QueueBatch / QueueLine** — 생산 대기열 배치
> - **ScrapLog / LossLog / VarianceLog** — 스크랩·손실·차이 기록
> - **StockAlert** — 안전재고 알림
> - **PhysicalCount** — 실물 재고 조사 기록
> - **ProductSymbol / OptionCode / ProcessType / ProcessFlowRule** — ERP 코드 체계

> [!warning] 주의
> - 컬럼 추가는 `main.py`의 `run_migrations()`에서 처리. 직접 모델만 수정하면 기존 DB와 불일치 발생.
> - `category` 컬럼은 Enum 타입 (RM/TA/TF/HA/HF/VA/VF/BA/BF/FG/UK)

---

## 쉬운 말로 설명

이 파일은 **"ERP에 저장되는 모든 정보의 설계도"**다. 데이터베이스에는 여러 "표(table)"가 있고, 각 표는 "어떤 열(column)을 가지는지"가 여기에 적혀 있다.

엑셀로 치면: 이 파일은 **엑셀 시트 하나하나의 열 구성을 미리 정의한 메타 파일**에 해당한다. `items`라는 시트는 어떤 열을 가지는가, `inventory`라는 시트는 어떤 열을 가지는가 등등.

### 표(테이블) 전체 지도

```
[마스터]                  [재고 상태]                [이력]
items ────────── inventory ────── transaction_logs
   │                │
   │              inventory_locations (부서×상태별 분포)
   │
   ├── bom (품목-품목 부모/자식)
   ├── item_models (품목-제품 연결)
   └── ship_package_items ─── ship_packages

[코드 체계]
product_symbols / option_codes / process_types / process_flow_rules

[대기열]
queue_batches ─── queue_lines

[예외·조사]
scrap_logs / loss_logs / variance_logs / stock_alerts / physical_counts

[관리]
employees / system_settings
```

---

## 테이블별 상세

### 1. `items` — 품목 마스터

품목(자재·반제품·완제품) 기본 정보 저장. 시스템의 **모든 것의 기준**이 되는 표.

| 컬럼                         | 타입            | NULL                   | 설명                                       |
| -------------------------- | ------------- | ---------------------- | ---------------------------------------- |
| `item_id`                  | UUID          | NOT NULL (PK)          | 품목 고유 ID                                 |
| `item_code`                | String(50)    | NULL, UNIQUE           | 레거시 CSV 코드 (ERP코드 전환 후 제거 예정)            |
| `item_name`                | String(200)   | NOT NULL               | 품목명                                      |
| `spec`                     | Text          | NULL                   | 규격·사양                                    |
| `category`                 | Enum          | NOT NULL, default=`UK` | RM/TA/TF/HA/HF/VA/VF/BA/BF/FG/UK         |
| `unit`                     | String(20)    | NOT NULL, default=`EA` | 단위 (EA, kg, m 등)                         |
| `barcode`                  | String(100)   | NULL                   | 바코드                                      |
| `legacy_file_type`         | String(50)    | NULL                   | 원자재/조립자재/발생부자재/완제품/미분류                   |
| `legacy_part`              | String(50)    | NULL                   | 자재창고/조립출하/고압파트/진공파트/튜닝파트/출하              |
| `legacy_model`             | String(50)    | NULL                   | DX3000/ADX4000W/ADX6000/COCOON/SOLO/공용   |
| `supplier`                 | String(200)   | NULL                   | 공급업체                                     |
| `min_stock`                | Numeric(15,4) | NULL                   | 안전재고 임계값                                 |
| `erp_code`                 | String(40)    | NULL, UNIQUE           | 4파트 ERP 코드 (예: `346-AR-0012-BG`)         |
| `model_symbol`             | String(20)    | NULL                   | 기호 조합 (예: "346", "3", "34678")           |
| `process_type_code`        | String(2)     | NULL, FK→process_types | 공정 코드 (TR/TA/HR/HA/VR/VA/NA/AR/AA/PR/PA) |
| `option_code`              | String(10)    | NULL                   | 옵션 코드 (자유 텍스트)                           |
| `serial_no`                | Integer       | NULL                   | 일련번호                                     |
| `created_at`, `updated_at` | DateTime      | NOT NULL               | 생성·수정 시각                                 |

샘플 row:
```
item_id=550e8400-..., item_name="ADX6000 튜브 어셈블리",
category=TA, erp_code="346-AR-0012-BG",
model_symbol="346", process_type_code="AR", option_code="BG",
unit="EA", min_stock=2
```

---

### 2. `inventory` — 재고 현황 (품목당 1행)

각 품목의 전체 재고 상태. `items`와 1:1.

| 컬럼 | 타입 | NULL | 설명 |
|------|------|------|------|
| `inventory_id` | UUID | PK | |
| `item_id` | UUID | NOT NULL, UNIQUE, FK→items | 어떤 품목인지 |
| `quantity` | Numeric(15,4) | NOT NULL, default=0 | **총 재고 = warehouse_qty + Σ(inventory_locations)** |
| `warehouse_qty` | Numeric(15,4) | NOT NULL, default=0 | 창고 보관량 |
| `pending_quantity` | Numeric(15,4) | NOT NULL, default=0 | 큐 배치에 예약된 수량 |
| `last_reserver_employee_id` | UUID | NULL, FK→employees | 마지막으로 예약한 직원 |
| `last_reserver_name` | String(100) | NULL | 예약자 이름 (비정규화) |
| `location` | String(100) | NULL | 임의 위치 메모 |
| `updated_at` | DateTime | NOT NULL | |

**핵심 불변식**:
- `quantity = warehouse_qty + Σ inventory_locations.quantity`
- `available = warehouse_qty + (inventory_locations 중 PRODUCTION 합) − pending_quantity`

---

### 3. `inventory_locations` — 부서×상태별 분포

같은 품목이 **어느 부서**에, **어떤 상태**(생산중/불량)로 있는지 저장. `(item_id, department, status)` 당 1행.

| 컬럼 | 타입 | NULL | 설명 |
|------|------|------|------|
| `location_id` | UUID | PK | |
| `item_id` | UUID | NOT NULL, FK→items | |
| `department` | Enum | NOT NULL | 조립/고압/진공/튜닝/튜브/AS/연구/영업/출하/기타 |
| `status` | Enum | NOT NULL | `PRODUCTION`(생산중) / `DEFECTIVE`(불량) |
| `quantity` | Numeric(15,4) | NOT NULL | 해당 부서·상태의 수량 |
| `updated_at` | DateTime | NOT NULL | |

유니크 제약: `(item_id, department, status)` — 부서·상태 조합당 행 1개.

샘플:
```
item=튜브X, department=조립, status=PRODUCTION, quantity=5
item=튜브X, department=조립, status=DEFECTIVE, quantity=1
item=튜브X, department=고압, status=PRODUCTION, quantity=3
```

---

### 4. `bom` — 자재명세서 (부모-자식)

"A를 만들려면 B 몇 개가 필요하다"는 관계. 재귀 가능 (자식이 또 부모일 수 있음).

| 컬럼 | 타입 | NULL | 설명 |
|------|------|------|------|
| `bom_id` | UUID | PK | |
| `parent_item_id` | UUID | NOT NULL, FK→items | 완제품 또는 상위 조립품 |
| `child_item_id` | UUID | NOT NULL, FK→items | 필요한 하위 자재 |
| `quantity` | Numeric(15,4) | NOT NULL | 부모 1개당 필요 수량 |
| `unit` | String(20) | NOT NULL, default=`EA` | |
| `notes` | Text | NULL | |

유니크 제약: `(parent_item_id, child_item_id)` — 같은 관계 중복 방지.

---

### 5. `transaction_logs` — 모든 재고 변동 이력

품목 수량이 바뀔 때마다 **반드시** 1행이 들어간다. 감사(audit) 기록.

| 컬럼 | 타입 | NULL | 설명 |
|------|------|------|------|
| `log_id` | UUID | PK | |
| `item_id` | UUID | NOT NULL, FK→items | |
| `transaction_type` | Enum | NOT NULL | 14가지 (아래 참고) |
| `quantity_change` | Numeric(15,4) | NOT NULL | +입고, −출고 |
| `quantity_before` | Numeric(15,4) | NULL | 변동 전 수량 |
| `quantity_after` | Numeric(15,4) | NULL | 변동 후 수량 |
| `reference_no` | String(100) | NULL | 외부 참조 번호 (발주번호 등) |
| `produced_by` | String(100) | NULL | 작업자 이름 |
| `notes` | Text | NULL | |
| `batch_id` | UUID | NULL, FK→queue_batches | 생성 원인 배치 |
| `created_at` | DateTime | NOT NULL | |

**TransactionType 16종**:
RECEIVE, PRODUCE, SHIP, ADJUST, BACKFLUSH, SCRAP, LOSS, DISASSEMBLE, RETURN, RESERVE, RESERVE_RELEASE, TRANSFER_TO_PROD, TRANSFER_TO_WH, TRANSFER_DEPT, MARK_DEFECTIVE, SUPPLIER_RETURN

---

### 6. `employees` — 직원 마스터

| 컬럼 | 타입 | NULL | 설명 |
|------|------|------|------|
| `employee_id` | UUID | PK | |
| `employee_code` | String(30) | NOT NULL, UNIQUE | 사번 |
| `name` | String(100) | NOT NULL | 이름 |
| `role` | String(100) | NOT NULL | 직책 |
| `phone` | String(30) | NULL | |
| `department` | Enum | NOT NULL, default=`기타` | DepartmentEnum |
| `level` | Enum | NOT NULL, default=`staff` | admin / manager / staff |
| `display_order` | Numeric(10,0) | NOT NULL, default=0 | 표시 순서 |
| `is_active` | String(5) | NOT NULL, default=`true` | 활성 여부 |
| `created_at`, `updated_at` | DateTime | NOT NULL | |

---

### 7. `ship_packages` + `ship_package_items` — 출하 패키지

특정 출하 단위(예: `SOLO 기본 패키지`)에 어떤 품목이 몇 개 들어가는지.

- `ship_packages`: 패키지 자체 (이름, 코드)
- `ship_package_items`: 패키지 × 품목 × 수량 (유니크 `(package_id, item_id)`)

---

### 8. 코드 체계 테이블 (4개)

ERP 코드(`346-AR-0012-BG`)를 구성하는 마스터 테이블.

| 테이블 | PK | 역할 |
|--------|----|----|
| `product_symbols` | slot (1~100) | 제품 기호(346, 3, ADX6000 등) 슬롯. `is_finished_good` 플래그로 완제품 슬롯 표시 |
| `item_models` | (item_id, slot) | 품목 ↔ 제품 다대다 (A 부품이 어떤 제품들에 쓰이는지) |
| `option_codes` | code (2자) | 옵션(BG/WS 등) 라벨·색상 |
| `process_types` | code (2자) | 공정 (TR/TA/HR/HA/VR/VA/NA/AR/AA/PR/PA), prefix(T/H/V/N/A/P) + suffix(R/A) |
| `process_flow_rules` | rule_id | 공정 전이 규칙 (예: TA+HR→HA). `consumes_codes` 콤마 나열 |

---

### 9. 큐 배치 (`queue_batches` + `queue_lines`)

**queue_batches**:

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `batch_id` | UUID | PK |
| `batch_type` | Enum | PRODUCE / DISASSEMBLE / RETURN |
| `status` | Enum | OPEN / CONFIRMED / CANCELLED |
| `owner_employee_id` | UUID, FK | 배치 생성자 |
| `owner_name` | String(100) | 표시용 비정규화 |
| `parent_item_id` | UUID, FK→items | 부모 품목 (완제품 등) |
| `parent_quantity` | Numeric | 만들/분해/반품할 부모 수량 |
| `reference_no`, `notes` | | |
| `created_at`, `confirmed_at`, `cancelled_at` | DateTime | |

**queue_lines** (배치 내 개별 자재 라인):

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `line_id` | UUID | PK |
| `batch_id` | UUID, FK | 부모 배치 |
| `item_id` | UUID, FK→items | |
| `direction` | Enum | IN / OUT / SCRAP / LOSS |
| `quantity` | Numeric | 실제 처리 수량 |
| `bom_expected` | Numeric, NULL | BOM 상 기대 수량 (차이 계산용) |
| `process_stage` | String(2), FK→process_types | |
| `included` | Boolean, default=true | 선택적 포함 토글 |

---

### 10. 예외·조사 테이블 (5개)

| 테이블 | 역할 |
|--------|------|
| `scrap_logs` | 폐기 기록 (item, qty, reason) |
| `loss_logs` | 누락·분실 기록 |
| `variance_logs` | 배치 확정 시 BOM 기대치 대비 실제 차이 |
| `stock_alerts` | SAFETY(안전재고 이하) / COUNT_VARIANCE(실사 차이) |
| `physical_counts` | 실물 재고 조사 결과 (counted_qty vs system_qty) |

---

### 11. `system_settings` — 전역 설정

`(setting_key, setting_value)` 단일 key-value 저장소. PIN 해시, 관리자 플래그 등.

---

## Enum 전체 목록

### CategoryEnum (품목 카테고리)
RM(원자재), TA/TF(튜브 조립/완성), HA/HF(고압), VA/VF(진공), BA/BF(조립), FG(완제품), UK(미분류)

### TransactionTypeEnum (16종)
RECEIVE(입고) · PRODUCE(생산) · SHIP(출하) · ADJUST(조정) · BACKFLUSH(BOM 차감) · SCRAP(폐기) · LOSS(손실) · DISASSEMBLE(분해) · RETURN(반품) · RESERVE(예약) · RESERVE_RELEASE(예약해제) · TRANSFER_TO_PROD(창고→부서) · TRANSFER_TO_WH(부서→창고) · TRANSFER_DEPT(부서간) · MARK_DEFECTIVE(불량 전환) · SUPPLIER_RETURN(공급사 반품)

### DepartmentEnum (부서 10종)
조립·고압·진공·튜닝·튜브·AS·연구·영업·출하·기타

### QueueBatchTypeEnum
PRODUCE · DISASSEMBLE · RETURN

### QueueBatchStatusEnum
OPEN · CONFIRMED · CANCELLED

### QueueLineDirectionEnum
IN(입고 방향) · OUT(출고 방향) · SCRAP(폐기) · LOSS(누락)

### LocationStatusEnum
PRODUCTION(생산중) · DEFECTIVE(불량)

### AlertKindEnum
SAFETY · COUNT_VARIANCE

### EmployeeLevelEnum
admin · manager · staff

---

## 핵심 불변식 (invariants)

1. **재고 합산**: `inventory.quantity = warehouse_qty + Σ inventory_locations.quantity`
2. **가용 재고**: `available = warehouse_qty + (PRODUCTION 상태 합) − pending_quantity`
3. **거래 이력**: 모든 재고 변동은 반드시 `transaction_logs`에 1행 이상 남긴다.
4. **BOM 무한루프 방지**: 서비스 레이어에서 깊이 10 제한.
5. **배치 상태 흐름**: `OPEN → CONFIRMED` 또는 `OPEN → CANCELLED`. 확정 후 되돌릴 수 없음.

---

## FAQ

**Q. `quantity`와 `warehouse_qty` 차이?**
`quantity`는 품목 전체 총합. `warehouse_qty`는 창고 보관량만. 나머지는 `inventory_locations`에 부서별로 흩어져 있다.

**Q. `pending_quantity`는 언제 올라가고 내려가나?**
큐 배치에 품목이 OUT 라인으로 들어가면(수량 조정 시) 증가. 배치 확정(CONFIRMED) 또는 취소(CANCELLED) 시 0으로 감소.

**Q. `inventory_locations` 없으면 그 품목은 부서에 재고가 없는 거?**
그렇다. 행이 없다 = 0. UI는 0인 행도 표시할 수 있지만 DB엔 불필요한 0행을 쌓지 않는다.

**Q. 품목 삭제하면 연결 테이블은?**
대부분 `ondelete="CASCADE"`로 연결되어 같이 삭제. `transaction_logs`도 CASCADE라 이력까지 사라진다. 실무에선 삭제보다 `is_active=false` 패턴이 안전.

**Q. `erp_code`가 NULL인 품목은?**
레거시 CSV로 들어온 품목 중 4파트 규칙에 맞지 않는 경우. `reapply_erp_codes.py` 스크립트로 일괄 재부여 가능.

**Q. `item_code`와 `erp_code` 둘 다 있는 이유?**
`item_code`는 엑셀 원본의 기존 코드(legacy). `erp_code`는 새 4파트 체계. 전환 완료 후 `item_code` DROP 예정.

---

## 관련 문서

- [[backend/app/main.py.md]] — `run_migrations()`로 이 테이블들 실제 생성
- [[backend/app/schemas.py.md]] — 이 모델들의 Pydantic 입출력 스키마
- [[backend/app/database.py.md]] — DB 연결/세션
- [[backend/app/services/inventory.py.md]] — `inventory` + `inventory_locations` 동기화 로직
- [[backend/app/services/bom.py.md]] — `bom` 테이블 조작 로직
- [[backend/app/services/queue.py.md]] — `queue_batches` + `queue_lines` 배치 처리
- [[backend/app/utils/erp_code.py.md]] — 4파트 코드 생성 규칙
- 용어 사전 — BOM/백플러시/카테고리 등 용어 해설
- 품목 등록 시나리오 — `items` 행이 만들어지는 전형적 흐름
- 재고 입출고 시나리오 — `inventory` + `inventory_locations` 변동 전형

Up: [[backend/app/app]]
