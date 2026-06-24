# stock-requests.ts

## 이 파일은 뭐예요?
창고 출고 요청(결재 흐름) 및 draft 장바구니 API 모듈입니다. 요청 생성부터 부서·창고 결재, 취소, draft CRUD, 예약 조회까지 16개 메소드를 제공합니다.

## 언제 보나요?
- 창고 출고 요청 화면(내 요청 목록, 창고 대기열, 부서 결재 대기열)을 개발할 때
- 결재 흐름(부서 승인→창고 승인)이나 취소·draft 복귀 로직을 추적할 때
- 품목별 예약 수량 조회(getItemReservations)가 필요할 때

## 중요한 내용
- `stockRequestsApi.createStockRequest(payload)` — 요청 생성
- `stockRequestsApi.listMyStockRequests(employeeId)` — 내 요청 목록
- `stockRequestsApi.listWarehouseQueue / listDepartmentQueue` — 결재 대기열
- `stockRequestsApi.countWarehouseQueue / countDepartmentQueue` — 대기열 카운트
- `stockRequestsApi.approveStockRequest / rejectStockRequest` — 창고 승인·거절
- `stockRequestsApi.approveStockRequestDepartment / rejectStockRequestDepartment` — 부서 결재
- `stockRequestsApi.cancelStockRequest` — 요청 취소
- `stockRequestsApi.revertToDraft(requestId, payload)` — 제출 → draft 복귀
- `stockRequestsApi.getItemReservations(itemId)` — `StockRequestReservationLine[]`
- `stockRequestsApi.upsertStockRequestDraft / getStockRequestDraft / listStockRequestDrafts / deleteStockRequestDraft / submitStockRequestDraft` — draft 장바구니 CRUD + 제출
- 타입: `StockRequest`, `StockRequestActionPayload`, `StockRequestCreatePayload`, `StockRequestDraftUpsertPayload`, `StockRequestReservationLine`, `StockRequestType` → `./types`

## 위험도
🔴 높음 — `approveStockRequest`는 창고 재고를 RESERVED 예약 → 실제 차감으로 전환. 재고 리셋 직후 pending 고아 상태에서 호출하면 "Pending 0" 오류 발생 (known bug, `project_warehouse_approval_pending_orphan.md` 참조).

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/types/stock-requests.ts]] — StockRequest 타입
- [[ERP/backend/app/routers/stock_requests.py]] — 백엔드 결재 라우터
