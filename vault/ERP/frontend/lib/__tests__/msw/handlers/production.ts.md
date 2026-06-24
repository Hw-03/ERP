# production.ts

## 이 파일은 뭐예요?
MSW 테스트용 생산 관련 API 핸들러로, 생산 가능 수량 조회·BOM 체크·생산 입고와 재고 트랜잭션 목록·메타편집·수량 보정 엔드포인트를 가짜 응답으로 제공합니다.

## 언제 보나요?
- 생산 입고(`/api/production/receipt`) 플로우를 테스트할 때
- 생산 가능 수량(`/api/production/capacity`) 및 BOM 재고 체크 로직을 테스트할 때
- 트랜잭션 메타 편집·수량 보정 기능을 테스트할 때

## 중요한 내용
- `productionHandlers` — export되는 핸들러 배열
- `GET /production/bom-check/:itemId` — `quantity > 0`이면 `can_produce: true`, `max_producible: 100` 반환
- `POST /inventory/transactions/:id/meta-edit` — `edited_by_pin` 없으면 400
- `GET /inventory/transactions/summary` — warehouse_count=1, dept_count=0, adjust_count=0
- 트랜잭션·생산·재고 3가지 도메인 API를 한 파일에 혼합

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/__tests__/msw/handlers/transactions.ts]] — 트랜잭션 관련 핸들러를 더 상세히 분리한 파일(monthly-counts, 상세 edit log 포함)
- [[ERP/frontend/lib/__tests__/msw/handlers/inventory.ts]] — 재고 수량 변경 핸들러 분리 파일
