---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/docs/ERD.md
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# ERD.md

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/docs/ERD.md]]

## 원본 첫 줄 (또는 메타)

```
# 엔티티 관계도 (ERD)

핵심 엔티티 간 관계를 한 장에 정리. 자세한 컬럼 목록은 `backend/app/models.py` 가 단일 소스.

```mermaid
erDiagram
    Item ||--o| Inventory : "1:1"
    Item ||--o{ InventoryLocation : "부서×상태별"
    Item ||--o{ TransactionLog : "이력"
    Item ||--o{ ItemModel : "모델 슬롯"
    Item ||--o{ BOM : "parent"
    Item ||--o{ BOM : "child"

    Employee ||--o{ TransactionLog : "produced_by"
    ProductModel ||--o{ ItemModel : "slot"

    QueueBatch ||--o{ QueueBatchItem : "구성"
    QueueBatchItem }o--|| Item : "참조"

    Item {
        uuid item_id PK
        string item_name
        string erp_code
        string process_type_code "2자리 코드 (TR/TA/TF 등 18종) — category 필드는 2026-04-29 제거됨"
        string legacy_model
```
