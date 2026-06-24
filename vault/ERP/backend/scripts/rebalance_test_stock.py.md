# rebalance_test_stock.py

## 이 파일은 뭐예요?
reset_test_stock.py로 1차 채운 재고를 바탕으로, 품절/정상/부족 분포 목표에 맞게 재고를 재분배하는 2단계 보정 스크립트다. R 시리즈 창고 재고는 그대로 보존하고 부서 InventoryLocation만 추가하거나 교체한다.

## 언제 보나요?
- "부족 알림 100건, 정상 400건" 같이 분포를 조절해서 UI를 시연하거나 테스트할 때
- reset_test_stock 직후 기본 분포가 너무 고르게 나올 때 보정할 때

## 위험도
🔴 높음 — 모든 inventory_locations를 삭제 후 재생성하고 inventory.quantity를 전면 갱신한다. 미결 stock_request도 실행 전 자동 CANCELLED 처리된다.

## 중요한 내용
- `--out N` (기본 100): 품절 목표 (A/F에서만 가능)
- `--normal N` (기본 400): 정상 목표 (총재고 ≥ min_stock=200)
- `--seed`: 랜덤 재현용 시드값
- `R_PREFIX_TO_DEPT`: R 시리즈의 부서 매핑 (PROCESS_TYPE_TO_DEPT에는 R이 없어서 별도 정의)
- `SAFETY_STOCK = 200`: 모든 min_stock의 사실상 공통값
- R 시리즈 창고 재고가 이미 200 이상이면 부족 목표여도 정상 강제됨(창고 수정 불가 제약)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/scripts/reset_test_stock.py]] — 반드시 먼저 실행해야 하는 1단계 리셋 스크립트
- [[ERP/backend/app/services/inventory.py]] — PROCESS_TYPE_TO_DEPT 매핑
