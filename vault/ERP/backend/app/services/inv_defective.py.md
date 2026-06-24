# inv_defective.py

## 이 파일은 뭐예요?

불량 등록·복귀·폐기·공급업체 반품 함수입니다.  
의존 순서: `inv_base → inv_calc → inv_transfer → inv_defective`. 역방향 import 없습니다.

## 언제 보나요?

- 불량 처리 후 재고가 이상하게 변할 때
- 불량 격리·복귀·폐기 흐름을 파악할 때

## 중요한 내용

- `mark_defective(db, item_id, dept, qty, ...)` — 정상 PRODUCTION → DEFECTIVE 이동 (불량 격리)
- `unmark_defective(db, item_id, dept, qty, ...)` — DEFECTIVE → PRODUCTION 복귀 (정상화)
- `scrap_defective(db, item_id, dept, qty, ...)` — DEFECTIVE 수량 소각(폐기)
- `receive_defective(db, item_id, dept, qty, ...)` — 외부에서 DEFECTIVE 위치로 바로 적재
- `return_to_supplier(db, item_id, dept, qty, ...)` — DEFECTIVE → 공급업체 반품
- `scrap_normal(db, item_id, qty, ...)` — 정상(창고) 재고 직접 폐기
- `return_to_supplier_from_normal(db, item_id, qty, ...)` — 정상(창고) 재고 → 공급업체 반품

## 위험도

🔴 높음

실재고를 직접 변경합니다. 수정 전 불량 흐름 E2E 테스트(`tests/e2e/io-defect.spec.ts`) 실행 필수.

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/backend/app/services/inv_transfer.py]] — 이 서비스의 내부 의존
- [[ERP/backend/app/routers/inventory/defective.py]] — 불량 API 진입점

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/routers/defects.py]] — 불량 유형 관리
> - [[ERP/frontend/app/mes/_components/_defect_hub/📁__defect_hub]]
