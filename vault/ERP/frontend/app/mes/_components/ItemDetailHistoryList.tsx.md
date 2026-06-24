# ItemDetailHistoryList.tsx

## 이 파일은 뭐예요?
품목 상세 시트의 "최근 입출고" 이력 목록을 렌더링합니다. `TransactionLog` 배열을 받아 거래 유형·시각·작업자·비고·수량 변화를 줄 단위로 표시합니다.

## 언제 보나요?
- 재고 화면에서 특정 품목의 최근 입출고 내역을 확인할 때

## 중요한 내용
- `ItemDetailHistoryList({ logs: TransactionLog[] })` — props 하나
- `getTransactionLabel`, `transactionColor` — `@/lib/mes-status`에서 가져와 유형별 레이블·색상 결정
- `formatQty` — 수량 표시 포맷 함수
- 이력이 없으면 "최근 이력이 없습니다." 빈 상태 표시

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes-status.ts]] — `getTransactionLabel`, `transactionColor`
- [[ERP/frontend/lib/api.ts]] — `TransactionLog` 타입
