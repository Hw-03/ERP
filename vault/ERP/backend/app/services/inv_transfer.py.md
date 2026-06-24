# inv_transfer.py

## 이 파일은 뭐예요?

재고 이동·입고·창고 출고 함수 모음입니다.  
의존 순서: `inv_base → inv_calc → inv_transfer`. 역방향 import 없습니다.

## 언제 보나요?

- 입고·출고·부서 이동 후 수량이 틀렸을 때
- 창고 박스 추적(box depletion) 로직을 파악할 때

## 중요한 내용

- `receive_confirmed(db, item_id, qty, ...)` — 창고 입고 확정 (warehouse_qty 증가)
- `consume_warehouse(db, item_id, qty, ...)` — 창고 출고 (warehouse_qty 차감) + 박스 추적
- `transfer_to_production(db, item_id, dept, qty, ...)` — 창고 → 부서 PRODUCTION 이동
- `transfer_to_warehouse(db, item_id, dept, qty, ...)` — 부서 → 창고 반환
- `transfer_between_departments(db, item_id, src_dept, dst_dept, qty, ...)` — 부서 간 재고 이동
- `consume_from_department(db, item_id, dept, qty, ...)` — 부서 PRODUCTION 수량 차감
- `_deplete_boxes_if_tracking(db, item_id, qty)` — 박스 추적 활성 시 박스별 차감 (내부 함수)

## 위험도

🔴 높음

실재고를 직접 변경합니다. 변경 전 재고 이동 E2E 테스트 실행 필수.

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/services/inv_calc.py]] — _sync_total 제공자
- [[ERP/backend/app/services/stock_math.py]] — 사용 가능 수량 계산
- [[ERP/backend/app/routers/inventory/transfer.py]] — 이동 API

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/services/inv_base.py]]
> - [[ERP/backend/app/services/inv_defective.py]]
