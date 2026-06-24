# reset_test_stock.py

## 이 파일은 뭐예요?
품목 마스터·직원·공정·BOM은 보존하고 입출고 내역, 배치, 재고 수치를 초기화한 뒤 공정 코드 기반으로 랜덤 재고를 다시 채우는 테스트용 리셋 스크립트다. R 시리즈는 창고에 100~200, A/F 시리즈는 매핑된 부서 PRODUCTION 위치에 0~300을 배분한다.

## 언제 보나요?
- 개발 중 쌓인 테스트 데이터를 깨끗이 비우고 다시 시작할 때
- 재고 관련 기능을 처음부터 다시 시연하거나 검증할 때

## 위험도
🔴 높음 — transaction_logs, io_batches, inventory_locations를 전량 삭제하고 inventory 수치를 0으로 리셋한다. 실 운영 DB에 실행하면 전체 입출고 이력이 소멸된다.

## 중요한 내용
- `--dry-run`: 롤백하여 실제 변경 없음
- `--yes`: 확인 프롬프트 스킵
- `--seed`: 랜덤 재현용 시드값
- `R_CODES = {"TR", "HR", "VR", "NR", "AR", "PR"}` — 창고 재고 대상 공정 코드
- 미결 stock_request를 먼저 CANCELLED 처리(고아 예약 방지) 후 RESERVED 잔존 시 중단 가드 동작
- 삭제 순서: `TransactionEditLog → TransactionLog → IoLine → IoBundle → IoBatch → InventoryLocation`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/scripts/rebalance_test_stock.py]] — 1차 리셋 후 분포 보정용 2단계 스크립트
- [[ERP/backend/app/services/inventory.py]] — PROCESS_TYPE_TO_DEPT 매핑
- [[ERP/backend/app/services/sr_approval.py]] — cancel_open_stock_requests
