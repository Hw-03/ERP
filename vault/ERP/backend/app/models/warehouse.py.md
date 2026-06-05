---
type: file-explanation
source_path: "backend/app/models/warehouse.py"
importance: important
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# warehouse.py — 창고 지도 표 (앵글·박스·박스 내용물)

## 이 파일은 무엇을 책임지나

창고를 평면도로 보여 주는 "창고 지도" 기능의 표를 정의합니다. 보관 구조(앵글/랙)와 그 위에 놓인 박스, 박스 안에 담긴 품목·수량을 각각 따로 저장합니다.

## 업무 흐름에서의 의미

권동환 사원 담당 영역인 창고 화면에서, 어느 랙 어느 자리에 어떤 박스가 있고 그 박스에 무슨 품목이 몇 개 들었는지 눈으로 보게 해 주는 데이터입니다. 품목 검색 시 "그 품목이 창고 어디 박스에 있는지" 찾는 근거가 됩니다.

## 언제 보면 좋나

- 창고 지도 화면의 데이터가 어떻게 구성되는지 확인할 때
- 박스 좌표(랙·줄·층·자리)가 어떻게 표현되는지 볼 때
- 박스 안 수량과 창고 재고를 대조할 때

## 중요한 내용

구조(structure)와 배치(placement)를 분리합니다.

- `WarehouseAngle` — 앵글(랙) 한 블록. 평면도 좌표(pos_x/pos_y/width/height)와 줄 수(rows)·층 수(layers)·칸당 자리 수(jaris_per_cell)를 가집니다. 관리 화면에서 CRUD 합니다.
- `WarehouseBox` — 자리에 놓인 박스 1개. 자리는 별도 표 없이 `(angle_id, row_no, layer_no, jari_index)` 좌표로만 식별합니다. 빈 자리는 행을 만들지 않고, 박스가 놓이는 순간에만 좌표로 생깁니다. `size`(대/중/소)는 자리 높이를 얼마나 차지하는지, `stack_order` 는 같은 자리 내 쌓임 순서입니다.
- `WarehouseBoxItem` — 박스 안 품목+수량. 실제 Item 마스터를 FK 로 가리킵니다. 품목으로 박스를 역추적하는 인덱스(검색·재고대조 핵심)가 걸려 있습니다.
- `BoxSizeEnum` — LARGE(대=3) / MEDIUM(중=2) / SMALL(소=1).

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models/item.py]] — 박스 내용물이 가리키는 품목 마스터.
- [[ERP/backend/app/models/inventory.py]] — 박스 수량 대조 기준은 재고의 `warehouse_qty`.
- [[ERP/backend/app/models/employee.py]] — 부서색은 Department.color_hex 에서 유도(여기엔 색 칸이 없음).

## 조심할 점

부서색은 이 표에 저장하지 않습니다. 품목의 공정코드 prefix(T/H/V/N/A/P) → 부서 → `Department.color_hex` 로 유도하므로, 색을 여기 박으면 이중 출처가 되어 어긋날 수 있습니다.

## 핵심 발췌

```python
# 자리 = (angle_id, row_no, layer_no, jari_index) 좌표로만 식별
row_no = Column(Integer, nullable=False)      # 1-based 줄
layer_no = Column(Integer, nullable=False)    # 1-based 층
jari_index = Column(Integer, nullable=False)  # 0-based 자리 (0/1/2)
```
