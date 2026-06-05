---
type: file-explanation
source_path: "backend/app/schemas/warehouse.py"
importance: important
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# warehouse.py — 창고 지도 API 형식

## 이 파일은 뭐예요?

창고 지도(Warehouse Map) 화면이 서버와 주고받는 데이터 모양을 정의합니다. 앵글(선반 구역), 그 위에 놓인 박스, 박스 안 품목·수량의 요청·응답 형식이 여기 있습니다.

## 언제 보나요?

- 창고 지도 화면이 앵글·박스 배치(위치·크기·자리)를 어떻게 받아오는지 확인할 때
- 박스에 품목·수량을 넣고 빼는 요청 형식을 볼 때

## 중요한 내용 (주요 클래스)

- `WarehouseAngleResponse`/`Create`/`Update`/`ReorderPayload` — 앵글(선반 구역). 행·층·칸당 자리 수와 화면 위치(`pos_x`/`pos_y`·`width`/`height`).
- `WarehouseBoxCreate`/`Update`/`Response` — 박스. 앵글 안 자리(`row_no`/`layer_no`/`jari_index`), 크기(`BoxSizeLiteral`: LARGE/MEDIUM/SMALL), 쌓임 순서(`stack_order`).
- `WarehouseBoxItemPayload`/`Response` — 박스 안 품목·수량(응답엔 부서 색 `color_hex` 포함).
- `WarehouseMapResponse` — 지도 전체(앵글 목록 + 박스 목록).

## 연결되는 파일

- [[ERP/backend/app/models/warehouse.py]] — 이 형식이 비추는 실제 앵글·박스 표.
- [[ERP/backend/app/schemas/inventory.py]] — 박스 수량은 `warehouse_qty` 와 재고대조(Reconcile)로 맞춰 봅니다.

## 핵심 발췌

```python
BoxSizeLiteral = Literal["LARGE", "MEDIUM", "SMALL"]


class WarehouseMapResponse(BaseModel):
    angles: List[WarehouseAngleResponse]
    boxes: List[WarehouseBoxResponse]
```
