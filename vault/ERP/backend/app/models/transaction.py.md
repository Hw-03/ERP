---
type: file-explanation
source_path: "backend/app/models/transaction.py"
importance: critical
layer: backend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# transaction.py — 재고 거래 로그와 수정 감사 표

## 이 파일은 무엇을 책임지나

재고가 바뀐 모든 사건을 한 줄씩 남기는 거래 로그(TransactionLog), 그리고 그 거래를 나중에 수정했을 때의 감사 이력(TransactionEditLog) 을 정의합니다. "언제, 어떤 품목이, 왜, 몇 개 늘고 줄었는지" 의 영구 기록입니다.

## 업무 흐름에서의 의미

입고·생산·출고·이동·불량·반품 등 재고를 건드린 동작은 전부 여기에 한 줄로 박힙니다. 주간보고와 입출고 내역 화면이 모두 이 표를 읽어 만들어집니다. 즉 회사 재고 흐름의 "장부" 입니다.

## 언제 보면 좋나

- 입출고 내역·주간보고가 어떤 데이터에서 나오는지 확인할 때
- 거래 종류(RECEIVE/PRODUCE/SHIP/ADJUST/이동/불량 등)의 정확한 목록이 필요할 때
- 거래를 수정했을 때 원본이 어떻게 보존되는지 볼 때

## 중요한 내용

- `TransactionTypeEnum` — 거래 종류: 입고(RECEIVE)·생산(PRODUCE)·출고(SHIP)·보정(ADJUST)·역소진(BACKFLUSH)·분해(DISASSEMBLE)·창고↔생산/부서간 이동·불량 표시/해제·불량 폐기(DEFECT_SCRAP)·공급처 반품(SUPPLIER_RETURN).
- `TransactionLog` — 거래 한 건. 주요 칸:
  - `quantity_change` / `quantity_before` / `quantity_after` : 변동량과 전후 수량.
  - `reason_category` / `reason_memo` : 불량 처리 등에서 사유(외관/치수/기능 등)와 자유 메모. 사유 카테고리 목록은 프론트 상수로만 정의되고 백엔드는 자유 문자열로 받습니다.
  - `producer_employee_id` / `produced_by` : 누가 했는지.
  - `operation_batch_id` / `department` : 배치·부서 연결.
  - `archived_at` : 보관 처리 시각.
  - 조회 속도를 위한 인덱스 3종(품목+날짜, 종류+날짜, 배치+날짜)이 걸려 있습니다.
- `TransactionEditLog` — 거래 수정 감사. 누가·왜 고쳤는지, 수정 전/후 JSON 스냅샷, 수량 보정 시 생성된 ADJUST 거래 참조를 남깁니다. 직원 이름은 스냅샷으로 박제해 나중에 직원이 바뀌어도 보존됩니다.

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models/inventory.py]] — 거래가 실제로 바꾸는 재고.
- [[ERP/backend/app/models/item.py]] — 거래는 품목 단위로 기록됩니다.
- [[ERP/backend/app/models/stock_request.py]] — 결재 승인 후 거래가 생성됩니다.

## 조심할 점

이 표는 사실상 재고의 "장부" 라서 함부로 지우거나 고치면 이력 추적이 깨집니다. 새 `TransactionTypeEnum` 값을 추가할 때는, 동결된 주간보고 파일(`weekly_report.py`)의 분류 집합(PRODUCTION_TX_TYPES / NON_PRODUCTION_TX_TYPES)만 업데이트하라는 프로젝트 규칙이 있습니다.

## 핵심 발췌

```python
quantity_change = Column(IntQuantity, nullable=False)
quantity_before = Column(IntQuantity, nullable=True)
quantity_after = Column(IntQuantity, nullable=True)
reason_category = Column(String(32), nullable=True, index=True)  # 불량 사유
operation_batch_id = Column(UUIDString, ForeignKey("io_batches.batch_id", ...))
```
