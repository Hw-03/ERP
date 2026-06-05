---
type: file-explanation
source_path: "backend/app/models/item.py"
importance: critical
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# item.py — 품목과 부품 구성(BOM) 표

## 이 파일은 무엇을 책임지나

회사가 다루는 모든 "품목(Item)" 한 건 한 건의 표 구조, 그리고 "이 품목은 어떤 하위 부품 몇 개로 이루어지는가"를 정의하는 부품 구성표(BOM) 를 책임집니다. 재고, 입출고, 거래 로그 등 거의 모든 다른 표가 결국 이 품목을 가리킵니다.

## 업무 흐름에서의 의미

현장에서 입고/출고/이동을 찍을 때 고르는 그 "품목" 이 바로 여기 Item 행입니다. 완제품 하나를 생산하면 BOM 에 적힌 하위 부품들이 함께 줄어드는데(백플러시), 그 "무엇이 무엇으로 구성되는가" 의 출처가 BOM 표입니다.

## 언제 보면 좋나

- 품목 코드(mes_code)가 어떻게 만들어지는지 확인할 때
- 완제품-부품 관계(BOM)가 DB 에 어떻게 저장되는지 볼 때
- 품목을 삭제했는데 왜 코드가 재사용되지 않는지 따질 때(소프트 삭제)

## 중요한 내용

- `Item` — 품목 마스터. 핵심 칸:
  - `mes_code` : 품목 코드. 직접 입력하는 칸이 아니라 `model_symbol`(제품기호) · `process_type_code`(공정코드) · `serial_no`(일련번호) 세 칸으로 DB 가 자동 계산(STORED 생성열)합니다. 형식은 `기호-공정-0001`. 즉 진짜 기준은 분해된 3개 칸이고 mes_code 는 그 결과물이라 직접 쓸 수 없습니다.
  - `mes_code` 는 전역 유일(unique) 이고, 소프트 삭제된 품목의 코드도 영구히 점유합니다. 이력 추적 때문에 같은 코드를 다시 쓰지 못하게 막는 의도입니다.
  - `deleted_at` : 소프트 삭제 표시. 값이 비어 있으면 활성, 날짜가 차 있으면 삭제됨. 실제로 행을 지우지 않습니다.
  - `legacy_part`, `legacy_item_type` : 기존 엑셀/CSV 에서 온 분류용 칸(현역, 제거 금지).
  - `min_stock` : 최소 재고. 정수 전용(IntQuantity).
  - `bom_completed_at` : 사용자가 "BOM 완료로 표시" 를 눌렀을 때만 채워지는 칸.
- `BOM` — 부모 품목(parent) ↔ 자식 품목(child) 과 필요 수량(quantity). 같은 부모-자식 짝은 한 번만(uq_bom_parent_child).

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models/inventory.py]] — 품목마다 재고 1행이 1:1 로 붙습니다.
- [[ERP/backend/app/models/transaction.py]] — 품목 단위로 모든 재고 변동이 기록됩니다.
- [[ERP/backend/app/models/code.py]] — `model_symbol`·`process_type_code` 의 의미를 정의하는 코드 마스터.
- [[ERP/backend/app/models/base.py]] — 수량 정수 타입·UUID 저장 규칙.

## 조심할 점

`mes_code` 는 직접 수정 불가입니다. 코드를 바꾸려면 분해 칸(model_symbol/process_type_code/serial_no)을 고쳐야 하고, 그러면 자동으로 다시 계산됩니다. `printf('%04d', ...)` 표현식은 SQLite 전용이라, 나중에 PostgreSQL 로 옮기면 이 부분을 분기해야 합니다.

## 핵심 발췌

```python
mes_code = Column(
    String(40),
    Computed(
        "model_symbol || '-' || process_type_code || '-' || printf('%04d', serial_no)",
        persisted=True,  # STORED
    ),
    unique=True,
    index=True,
)
```
