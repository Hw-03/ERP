---
type: file-explanation
source_path: "_attic/docs/ERD.md"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# ERD.md — ERD.md 설명

## 이 파일은 무엇을 책임지나

`ERD.md`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `엔티티 관계도 (ERD)`
- `핵심 흐름`
- `자재 → 재고 → 생산 → 출하`
- `불량 / 반품`
- `BOM Where-Used`
- `불변식 (코드로 강제)`
- `변경 시 주의`

## 연결되는 파일

- [[ERP/_attic/docs/📁_docs]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```md
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
        decimal min_stock
    }

    Inventory {
        uuid inventory_id PK
        uuid item_id FK
        decimal quantity "warehouse + production + defective"
        decimal warehouse_qty
        decimal pending_quantity "OUT 큐 예약"
    }

    InventoryLocation {
        uuid id PK
        uuid item_id FK
        enum department
        enum status "PRODUCTION | DEFECTIVE"
        decimal quantity
    }

    BOM {
        uuid bom_id PK
        uuid parent_item_id FK
        uuid child_item_id FK
        decimal quantity
        string unit
    }

    TransactionLog {
        uuid log_id PK
        uuid item_id FK
```
