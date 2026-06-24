# inventory.ts

## 이 파일은 뭐예요?
MSW 테스트용 재고 현황 API 핸들러로, 재고 요약·위치별 재고 조회와 입고·조정·생산 이동·창고 이동·불량 처리 엔드포인트를 가짜 응답으로 제공합니다.

## 이 파일은 위험해요?
## 위험도
🔴 높음 — 재고 수량 변경(receive, adjust, transfer, mark-defective)을 모두 포함하며, 실수로 잘못된 핸들러를 사용하면 재고 수식 테스트 결과가 왜곡될 수 있습니다.

## 언제 보나요?
- 재고 요약 대시보드나 공정별 재고 현황 화면을 테스트할 때
- 입고·조정·이동·불량 처리 등 재고 변경 API를 테스트할 때

## 중요한 내용
- `inventoryHandlers` — export되는 핸들러 배열
- `InventorySummary`, `InventoryMutationResponse`, `InventoryLocationRow` 타입 사용
- 샘플 요약: TR(3품목, 150개), AF(2품목, 50개), 합계 5품목 200개
- `POST /receive`, `/adjust`, `/transfer-to-production`, `/transfer-to-warehouse`, `/mark-defective` — 모두 동일한 `sampleMutationResponse` 구조 반환
- `GET /inventory/locations/:itemId` — 부서별 위치 행(status: "PRODUCTION") 반환

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/types/inventory.ts]] — `InventorySummary`, `InventoryMutationResponse` 타입 정의
- [[ERP/frontend/lib/api/types/shared.ts]] — `InventoryLocationRow` 타입 정의
