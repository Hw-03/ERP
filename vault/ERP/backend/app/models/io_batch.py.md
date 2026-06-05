---
type: file-explanation
source_path: "backend/app/models/io_batch.py"
importance: important
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# io_batch.py — 입출고 2.0 배치·번들·라인 표

## 이 파일은 무엇을 책임지나

새 입출고 흐름(입출고 2.0)에서 한 번에 제출한 작업을 3단계로 담는 표를 정의합니다. 작업 묶음(IoBatch) → 품목/패키지 단위 묶음(IoBundle) → 실제 재고 반영 줄(IoLine) 입니다.

## 업무 흐름에서의 의미

현장에서 입출고를 한 번 제출하면, 그게 배치 하나로 묶입니다. 완제품/패키지를 고르면 BOM 에 따라 하위 부품 줄로 펼쳐지는데, 그 펼쳐진 결과가 번들과 라인입니다. 제외(excluded)한 줄도 감사용으로 남깁니다.

## 언제 보면 좋나

- 입출고 한 번 제출이 DB 에 어떻게 3단계로 쪼개지는지 확인할 때
- 결재가 필요한 배치와 결재 요청(StockRequest)의 연결을 볼 때
- BOM 펼침에서 부족분(shortage)·제외 사유가 어디 남는지 확인할 때

## 중요한 내용

- `IoBatch` — 작업 묶음(감사 단위). 작업 종류(work_type/sub_type)·상태·요청자·부서·결재 필요 여부(requires_approval)·연결된 `stock_request_id`. 중복 제출 방지용 `client_request_id`(유일).
- `IoBundle` — 작업 기준 품목/패키지 하나에서 펼쳐진 줄 묶음. `source_kind`·`source_item_id`·`quantity`·`expanded_level`(펼침 깊이).
- `IoLine` — 실제 반영 후보 줄. 방향(direction)·출발/도착 통(from_bucket/to_bucket)·부서·수량·`bom_expected`(BOM 기대 수량)·`included`(포함 여부)·`shortage`(부족분)·`exclusion_note`(제외 사유). 포함 안 한 줄도 감사로 남깁니다.

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models/stock_request.py]] — 결재가 필요한 배치는 요청과 연결됩니다.
- [[ERP/backend/app/models/transaction.py]] — 반영된 줄은 거래 로그(operation_batch_id)로 남습니다.
- [[ERP/backend/app/models/item.py]] — 줄이 가리키는 품목과 BOM 펼침의 근거.

## 핵심 발췌

```python
class IoLine(Base):
    direction = Column(String(20), nullable=False)
    bom_expected = Column(IntQuantity, nullable=True)   # BOM 기대 수량
    included = Column(Boolean, nullable=False, default=True)
    shortage = Column(IntQuantity, nullable=False, default=0)
```
