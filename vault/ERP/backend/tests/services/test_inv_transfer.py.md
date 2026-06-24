# test_inv_transfer.py

## 이 파일은 뭐예요?
`services/inv_transfer.py`의 재고 이동 함수 5종(창고↔부서, 부서↔부서, 창고 차감, 입고)이 "총량 불변" 불변식을 지키는지, 부족·제로 수량 등 비정상 입력에 ValueError를 내는지 검증하는 회귀 테스트입니다.

## 언제 보나요?
- 창고→부서, 부서→창고, 부서간 이동 로직을 수정할 때
- pending 수량이 가용 계산에 영향을 주는 방식을 바꿀 때
- `receive_confirmed`의 bucket/dept 폴백 동작을 확인할 때

## 중요한 내용
- `_assert_invariant` — warehouse + production + defective == Inventory.quantity 불변식 헬퍼
- `test_transfer_to_production_pending_reduces_available` — pending 고려 가용 계산
- `test_receive_confirmed_production_without_dept_falls_back_to_warehouse` — dept None이면 창고 폴백
- `test_roundtrip_preserves_total` — 창고→부서→타부서→창고 왕복 후 총량 불변

## 위험도
🔴 높음 — 재고 이동 서비스는 TransactionLog 생성의 상위 계층. 여기 회귀가 터지면 실재고와 장부가 벌어진다.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/services/inv_transfer.py]] — 테스트 대상 서비스
- [[ERP/backend/app/services/inv_calc.py]] — `_sync_total` 공유 사용
