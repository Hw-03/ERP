# server.ts

## 이 파일은 뭐예요?
테스트 환경에서 사용하는 MSW(Mock Service Worker) 서버를 초기화하는 파일입니다. models, departments, employees, items, transactions, bom, inventory, settings, stock-requests, production, admin 등 11개 도메인의 핸들러를 모두 합쳐 `server` 인스턴스 하나로 내보냅니다.

## 언제 보나요?
- 프론트엔드 테스트(Jest/Vitest)에서 API 모킹이 왜 동작하는지 확인할 때
- 새 도메인 핸들러를 MSW 서버에 추가해야 할 때

## 중요한 내용
- `export const server` — `msw/node`의 `setupServer()`로 생성된 단일 MSW 서버 인스턴스. 테스트 setup 파일에서 `server.listen()` / `server.close()`로 생명주기를 관리함
- 핸들러 목록: `modelsHandlers`, `departmentsHandlers`, `employeesHandlers`, `itemsHandlers`, `transactionsHandlers`, `bomHandlers`, `inventoryHandlers`, `settingsHandlers`, `stockRequestsHandlers`, `productionHandlers`, `adminHandlers`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/__tests__/msw/handlers/models.ts]] — 모델 API 모킹 핸들러
- [[ERP/frontend/lib/__tests__/msw/handlers/inventory.ts]] — 재고 API 모킹 핸들러
- [[ERP/frontend/lib/__tests__/msw/handlers/stock-requests.ts]] — 재고 요청 API 모킹 핸들러
