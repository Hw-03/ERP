# production.ts

## 이 파일은 뭐예요?
생산·입출고 내역·엑셀 내보내기 통합 API 모듈입니다. 생산 입고, BOM 체크, 생산 가능 수량(capacity), 거래 내역 조회·수정·수량 보정·취소, 엑셀 다운로드 URL 생성까지 15개 메소드를 제공합니다.

## 언제 보나요?
- 생산 입고 화면이나 BOM 재고 체크 로직을 개발할 때
- 입출고 내역 화면(필터·KPI·페이지네이션)을 개발하거나 디버깅할 때
- 거래 메타데이터 수정·수량 보정·취소 흐름을 추적할 때
- PF 핀 설정(capacity 화면)을 볼 때

## 중요한 내용
- `productionApi.productionReceipt(payload)` — 생산 입고
- `productionApi.checkProduction(itemId, quantity)` — BOM 재고 부족 여부 확인
- `productionApi.getProductionCapacity()` — 생산 가능 수량(AF 기준)
- `productionApi.getPfPins / setPfPin / clearPfPin` — PF 핀 조회·설정·해제
- `productionApi.getTransactions(params?, opts?)` — 다중 필터 + AbortSignal
- `productionApi.getTransactionsSummary(params?, opts?)` — KPI 카운트 4개, `TransactionSummary`
- `productionApi.metaEditTransaction(logId, payload)` — 메타 수정 (reason + PIN 필수)
- `productionApi.getTransactionEdits(logId)` — 수정 이력
- `productionApi.quantityCorrectTransaction(logId, payload)` — 수량 보정 (PIN 필수)
- `productionApi.cancelTransaction(logId, payload)` — 취소 (PIN 필수)
- `productionApi.getMonthlyCounts(year)` — 월별 거래 건수
- `productionApi.getItemsExportUrl / getTransactionsExportUrl` — 엑셀 다운로드 URL 반환(fetch 없음)
- `TransactionSummary` interface — `{ total, warehouseCount, deptCount, adjustCount, departmentCounts }`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/types/production.ts]] — 생산 관련 타입
- [[ERP/backend/app/routers/production.py]] — 생산 라우터
- [[ERP/backend/app/routers/inventory/transactions.py]] — 거래 내역 라우터
