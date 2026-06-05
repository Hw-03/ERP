---
type: file-explanation
source_path: "backend/app/schemas/item.py"
importance: critical
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# item.py — 품목·BOM·제품기호·생산입고 API 형식

## 이 파일은 뭐예요?

품목(자재·제품)과 그 부품 구성(BOM), 제품기호(모델 심볼), 생산입고 화면이 서버와 주고받는 데이터 모양을 정의합니다. 품목 관리 화면, BOM 트리, 생산 등록이 모두 이 형식을 씁니다.

## 언제 보나요?

- 품목 등록/수정 화면이 보내는 항목(품목명·공정코드·단위·모델 슬롯 등)을 확인할 때
- 품목 응답에 재고 수량까지 붙은 형식(`ItemWithInventory`)이 어떻게 생겼는지 볼 때
- BOM 트리(상위→하위 펼침)나 생산입고(자동 차감) 응답 구조를 볼 때

## 중요한 내용 (주요 클래스)

- `ItemCreate` / `ItemUpdate` — 품목 등록·수정. `model_slots` 로 사용 제품(1=DX3000 … 5=ADX6000)을 지정. `legacy_part`/`legacy_item_type` 은 현역 필드.
- `ItemResponse` — 품목 기본 형식. 품목 코드는 `mes_code`(현재 표준), `model_symbol`, `process_type_code`, `serial_no` 로 구성.
- `ItemWithInventory` — `ItemResponse` 에 재고 수량(창고/생산/불량/예약/가용)과 위치 목록을 더한 화면용 형식.
- `BOMCreate`/`BOMUpdate`/`BOMResponse`/`BOMDetailResponse` — 부품 구성 한 줄(상위·하위·필요 수량).
- `BOMTreeNode` — 자기 자신을 자식으로 갖는 재귀 트리(하위의 하위까지 펼침).
- `ProductionReceiptRequest`/`ProductionReceiptResponse` — 생산입고. 응답에 자동 차감된 부품 목록(`backflushed_components`)을 담습니다.
- `ProductSymbolResponse`/`ProductSymbolUpdate` — 제품 모델 슬롯의 기호·이름·완제품 여부.

## 연결되는 파일

- [[ERP/backend/app/models/item.py]] — 이 형식이 비추는 실제 품목·BOM 표.
- [[ERP/backend/app/schemas/inventory.py]] — `InventoryLocationResponse` 를 가져와 `ItemWithInventory` 에 끼웁니다.
- [[ERP/backend/app/schemas/weekly.py]] — `BackflushDetail` 을 가져와 생산입고 응답에 씁니다.
- [[ERP/backend/app/routers/items.py]] — 이 형식을 입출력으로 쓰는 품목 API.

## 조심할 점

품목 코드 필드는 `mes_code` 가 현재 표준입니다(예전 `item_code`/`option_code` 는 죽은 필드). 코드 규칙은 `_attic/docs/ITEM_CODE_RULES` 참조. 변동 수치(슬롯 개수·공정 종류 수)는 박지 말고 `facts.py` 로 확인하세요.

## 핵심 발췌

```python
class ItemWithInventory(ItemResponse):
    quantity: Optional[int] = 0
    warehouse_qty: int = 0
    production_total: int = 0
    defective_total: int = 0
    available_quantity: int = 0
    locations: List[InventoryLocationResponse] = []
```
