# 엔티티 관계도 (ERD)

> **2026-06-08 현행 기준.** 컬럼 정의 단일 소스: `backend/app/models/` 디렉토리.
> 총 25개 테이블 · 8개 도메인. 도메인별로 다이어그램을 나눔.

## 도메인 지도

| 도메인 | 테이블 | 핵심 목적 |
|---|---|---|
| 품목/코드 | items · bom · process_types · product_symbols | 품목 마스터 + BOM + 코드 체계 |
| 직원/조직 | employees · departments · employee_assigned_models · employee_item_orders | 사원 + 담당 모델 + 품목 순서 |
| 재고 | inventory · inventory_locations | 창고/부서별 수량 |
| 거래 이력 | transaction_logs · transaction_edit_logs | 입출고 로그 + 수정 이력 |
| 입출고 배치 | io_batches · io_bundles · io_lines | IO 제출 단위 |
| 재고 요청/결재 | stock_requests · stock_request_lines | 창고/부서 결재 흐름 |
| 창고 지도 | warehouse_angles · warehouse_boxes · warehouse_box_items | 앵글 위치 시각화 |
| 기타 | notifications · handovers · handover_lines · admin_audit_logs · system_settings | 알림·인수인계·감사·설정 |

---

## 1. 품목/코드 도메인

```mermaid
erDiagram
    Item {
        uuid item_id PK
        string item_name
        string mes_code "STORED 생성열 — model_symbol+process_type_code+serial_no"
        string model_symbol "ProductSymbol.symbol 조합 (예: 346)"
        string process_type_code FK
        int serial_no
        string legacy_part "자재창고·조립출하 등 현역"
        string legacy_item_type "원자재·완성품·반제품류 현역"
        string unit
        int min_stock
        datetime bom_completed_at
        datetime deleted_at "NULL=활성, 값=소프트삭제"
    }

    BOM {
        uuid bom_id PK
        uuid parent_item_id FK
        uuid child_item_id FK
        int quantity
        string unit
        string notes
    }

    ProcessType {
        string code PK "2자리 (TR·TA·TF 등 18종)"
        string prefix
        string suffix
        int stage_order
        string description
    }

    ProductSymbol {
        int slot PK "1~8 자리"
        string symbol "단일 문자 (예: 3=COCOON)"
        string model_name
        bool is_finished_good
        int display_order
    }

    Item }o--|| ProcessType : "process_type_code"
    Item ||--o{ BOM : "parent_item_id"
    Item ||--o{ BOM : "child_item_id"
```

**규칙:**
- `mes_code` 는 DB STORED 생성열. 직접 쓰기 불가 — 분해 필드(model_symbol·process_type_code·serial_no)가 진실 소스.
- `model_symbol` 과 `ProductSymbol.symbol` 은 코드 규약으로 연결 (별도 FK 없음).
- BOM 순환 참조 금지 — 서비스 레이어(`_is_circular`)에서 검증, 위반 시 400.

---

## 2. 직원/조직 도메인

```mermaid
erDiagram
    Employee {
        uuid employee_id PK
        string employee_code
        string name
        enum role "admin | employee"
        string department
        enum level "admin | manager | staff"
        string warehouse_role "primary | deputy | null"
        string department_role "primary | deputy | null"
        bool io_enabled
        int display_order
        string pin_hash
    }

    Department {
        int id PK
        string name
        int display_order
        bool io_enabled
    }

    EmployeeAssignedModel {
        uuid employee_id PK-FK
        int slot PK-FK
        int priority
    }

    EmployeeItemOrder {
        uuid employee_id PK-FK
        uuid item_id PK-FK
        int display_order
    }

    Employee }o--|| Department : "department"
    Employee ||--o{ EmployeeAssignedModel : ""
    Employee ||--o{ EmployeeItemOrder : ""
    ProductSymbol ||--o{ EmployeeAssignedModel : "slot"
    Item ||--o{ EmployeeItemOrder : "item_id"
```

---

## 3. 재고 도메인

```mermaid
erDiagram
    Item ||--o| Inventory : "1:1"
    Item ||--o{ InventoryLocation : "부서×상태별 N개"

    Inventory {
        uuid inventory_id PK
        uuid item_id FK
        int quantity "warehouse_qty + Σ(InventoryLocation)"
        int warehouse_qty "창고 재고"
        int pending_quantity "OUT 예약 중"
        uuid last_reserver_employee_id FK
    }

    InventoryLocation {
        uuid location_id PK
        uuid item_id FK
        enum department
        enum status "PRODUCTION | DEFECTIVE"
        int quantity
        datetime defective_at "불량 격리 시각"
    }
```

**불변식:** `Inventory.quantity == warehouse_qty + Σ(InventoryLocation.quantity for item_id)`
→ `/health/detailed` 의 `inventory_mismatch_count` 가 위반 건수를 실시간 감시.

---

## 4. 거래 이력 도메인

```mermaid
erDiagram
    Item ||--o{ TransactionLog : "품목별 이력"
    Employee ||--o{ TransactionLog : "producer_employee_id"
    TransactionLog ||--o{ TransactionEditLog : "수정 감사"

    TransactionLog {
        uuid log_id PK
        uuid item_id FK
        enum transaction_type
        int quantity_change
        int quantity_before
        int quantity_after
        string department
        string produced_by
        uuid producer_employee_id FK
        string reference_no
        string reason_category
        uuid operation_batch_id FK
        datetime created_at
        datetime archived_at
    }

    TransactionEditLog {
        uuid edit_id PK
        uuid original_log_id FK
        uuid edited_by_employee_id FK
        string reason
        json before_payload
        json after_payload
        uuid correction_log_id FK
        datetime created_at
    }
```

---

## 5. 입출고 배치 도메인

```mermaid
erDiagram
    Employee ||--o{ IoBatch : "requester_employee_id"
    IoBatch ||--o{ IoBundle : ""
    IoBundle ||--o{ IoLine : ""
    Item ||--o{ IoLine : "item_id"
    Item ||--o{ IoBundle : "source_item_id"
    IoBatch }o--o| StockRequest : "stock_request_id"

    IoBatch {
        uuid batch_id PK
        string work_type "warehouse_io | production_io"
        string sub_type "warehouse_to_dept 등"
        string status
        uuid requester_employee_id FK
        string from_department
        string to_department
        bool requires_approval
        uuid stock_request_id FK
        datetime submitted_at
        datetime completed_at
    }

    IoBundle {
        uuid bundle_id PK
        uuid batch_id FK
        string source_kind "direct_item | stock_request_line"
        uuid source_item_id FK
        int quantity
    }

    IoLine {
        uuid line_id PK
        uuid bundle_id FK
        uuid item_id FK
        string direction "in | out"
        string from_bucket
        string to_bucket
        int quantity
        bool included
        string origin
    }
```

---

## 6. 재고 요청/결재 도메인

```mermaid
erDiagram
    Employee ||--o{ StockRequest : "requester"
    Employee ||--o{ StockRequest : "warehouse_approver"
    Employee ||--o{ StockRequest : "dept_approver"
    StockRequest ||--o{ StockRequestLine : ""
    Item ||--o{ StockRequestLine : "item_id"

    StockRequest {
        uuid request_id PK
        string request_code
        uuid requester_employee_id FK
        enum request_type
        enum status "SUBMITTED | RESERVED | APPROVED | REJECTED | COMPLETED | CANCELLED"
        bool requires_warehouse_approval
        bool requires_department_approval
        uuid approved_by_employee_id FK
        uuid department_approved_by_employee_id FK
        uuid operation_batch_id FK
        datetime submitted_at
        datetime approved_at
        datetime completed_at
    }

    StockRequestLine {
        uuid line_id PK
        uuid request_id FK
        uuid item_id FK
        int quantity
        enum from_bucket "WAREHOUSE | PRODUCTION | DEFECTIVE | NONE"
        enum to_bucket
        string from_department
        string to_department
        enum status
    }
```

**결재 흐름:**
- 창고 결재: `warehouse_role = primary | deputy` 인 사원만 가능.
- 부서 결재: `department_role = primary | deputy` 또는 `level = admin`.
- 두 결재 모두 통과 → `COMPLETED`.

---

## 7. 창고 지도 도메인

```mermaid
erDiagram
    WarehouseAngle ||--o{ WarehouseBox : ""
    WarehouseBox ||--o{ WarehouseBoxItem : ""
    Item ||--o{ WarehouseBoxItem : "item_id"

    WarehouseAngle {
        uuid id PK
        string label "앵글 이름 (예: A-1)"
        int rows "열 수"
        int layers "층 수"
        int jaris_per_cell "칸당 자리 수"
        float pos_x
        float pos_y
        float width
        float height
        int display_order
        bool is_active
    }

    WarehouseBox {
        uuid box_id PK
        uuid angle_id FK
        int row_no "열 번호"
        int layer_no "층 번호"
        int jari_index "자리 인덱스"
        string size "small | medium | large"
        int stack_order
    }

    WarehouseBoxItem {
        uuid id PK
        uuid box_id FK
        uuid item_id FK
        int quantity
    }
```

---

## 8. 기타 도메인

```mermaid
erDiagram
    Employee ||--o{ Notification : "recipient_employee_id"
    StockRequest ||--o{ Notification : "related_request_id"
    Employee ||--o{ HandoverDoc : "author_employee_id"
    Employee ||--o{ HandoverDoc : "received_by_employee_id"
    HandoverDoc ||--o{ HandoverLine : ""
    Item ||--o{ HandoverLine : "item_id"

    Notification {
        uuid notification_id PK
        uuid recipient_employee_id FK
        string type
        string title
        uuid related_request_id FK
        bool is_read
        datetime created_at
    }

    HandoverDoc {
        uuid handover_id PK
        string handover_code
        enum status
        uuid author_employee_id FK
        string from_department
        string to_department
        datetime doc_date
        uuid received_by_employee_id FK
        datetime received_at
    }

    HandoverLine {
        uuid line_id PK
        uuid handover_id FK
        uuid item_id FK
        int quantity
    }

    AdminAuditLog {
        uuid audit_id PK
        string actor_pin_role
        string actor_employee_code
        string action
        string target_type
        string target_id
        string payload_summary
        datetime created_at
    }

    SystemSetting {
        string setting_key PK
        string setting_value
        datetime updated_at
    }
```

---

## 불변식 (코드로 강제)

- `Inventory.quantity == warehouse_qty + Σ(InventoryLocation.quantity for item_id)` — `/health/detailed` 실시간 감시.
- BOM 순환 참조 금지 — `_is_circular` 검증, 위반 시 400.
- `mes_code` unique 전역 (소프트삭제 포함) — 삭제된 코드 재등록 불가.

## 변경 이력

| 날짜 | 변경 내용 |
|---|---|
| 2026-06-08 | 전면 재작성 — io_batches·io_bundles·io_lines·stock_requests·stock_request_lines·warehouse_angles·warehouse_boxes·warehouse_box_items·handovers·notifications·employee_item_orders 추가. STALE 표기 제거. |
| 2026-06-01 | mes_code 전환 반영 (item_code→mes_code) |
| 초기 | V1 핵심 5개 테이블 |

## 변경 시 주의

- DB 스키마 변경 시 이 문서도 함께 갱신.
- `mes_code` 는 STORED 생성열 — `model_symbol`, `process_type_code`, `serial_no` 를 바꾸면 자동 재계산.
- `Inventory.quantity` 불변식 위반 시 `/health/detailed` 가 즉시 감지.
