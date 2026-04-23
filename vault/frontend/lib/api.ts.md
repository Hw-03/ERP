---
type: code-note
project: ERP
layer: frontend
source_path: frontend/lib/api.ts
status: active
tags:
  - erp
  - frontend
  - api-client
  - typescript
aliases:
  - API 클라이언트
  - 프론트엔드 API
  - api.ts
---

# api.ts

> [!summary] 역할
> 프론트엔드가 백엔드와 통신하는 **모든 API 호출 함수**가 담긴 핵심 파일.
> TypeScript 타입 정의와 실제 fetch 함수를 함께 포함한다.

> [!info] 주요 책임
> - **TypeScript 타입 정의**: `Item`, `Employee`, `QueueBatch`, `BOMEntry`, `TransactionLog` 등 전체 도메인 타입
> - **공정 카테고리 타입**: `Category` = RM/TA/TF/HA/HF/VA/VF/BA/BF/FG/UK
> - **거래 유형 타입**: `TransactionType` = RECEIVE/PRODUCE/SHIP/ADJUST/BACKFLUSH 등
> - **`api` 객체**: 모든 API 호출 메서드를 하나의 객체로 묶어 제공
> - **환경별 URL 처리**: `NEXT_PUBLIC_API_URL` 환경변수 또는 Next.js rewrite 경로 사용

## API 메서드 목록

| 그룹 | 주요 메서드 |
|------|------------|
| 품목 | `getItems`, `getItem`, `createItem`, `updateItem` |
| 재고 | `receiveInventory`, `shipInventory`, `adjustInventory`, `transferToProduction`, `transferToWarehouse`, `markDefective` |
| BOM | `getBOM`, `getBOMTree`, `createBOM`, `updateBOM`, `deleteBOM` |
| 생산 | `productionReceipt`, `checkProduction` |
| 큐 | `createQueueBatch`, `listQueueBatches`, `confirmQueueBatch`, `cancelQueueBatch` |
| 직원 | `getEmployees`, `createEmployee`, `updateEmployee`, `deleteEmployee` |
| 알림 | `scanSafetyAlerts`, `listAlerts`, `acknowledgeAlert` |
| 실사 | `submitPhysicalCount`, `listPhysicalCounts` |
| 스크랩/손실 | `recordScrap`, `recordLoss`, `listScrap`, `listLoss` |
| 설정 | `verifyAdminPin`, `resetDatabase`, `updateAdminPin` |

> [!warning] 주의
> - 이 파일의 타입이 백엔드 `schemas.py`와 일치해야 함
> - `NEXT_PUBLIC_API_URL` 미설정 시 Next.js rewrite로 백엔드에 프록시됨

---

## 쉬운 말로 설명

**프론트엔드가 백엔드에 말 거는 단일 창구**. 화면 코드가 직접 `fetch()` 를 호출하지 않고, 전부 `api.xxx()` 를 통해 나간다.

- **타입 정의** (앞부분 ~357줄): 백엔드 Pydantic 스키마를 미러링한 TypeScript 인터페이스/타입.
- **`fetcher<T>()` 함수** (358줄): 공통 fetch 래퍼. 에러 메시지 파싱 + JSON 변환.
- **`api` 객체** (375~1033줄): 60+ 메서드가 전부 여기 모여 있음.

화면 1개가 필요한 데이터/동작은 여기서 1~2개 메서드 호출로 해결.

---

## 환경 설정

```typescript
const SERVER_API_BASE = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}`
  : "";
const FALLBACK_SERVER_API_BASE = "http://127.0.0.1:8000";
```

- **브라우저**에서 실행: `NEXT_PUBLIC_API_URL` 있으면 직접 호출, 없으면 Next.js `/api/...` 리라이트를 타고 백엔드로.
- **SSR**에서 실행: 절대 URL 필요 → `FALLBACK_SERVER_API_BASE` 사용.
- `toApiUrl(path)` 헬퍼가 환경에 맞게 정리.

---

## 주요 타입

| 타입 | 의미 |
|------|------|
| `Category` | 11단계 카테고리 Union (RM/TA/TF/HA/HF/VA/VF/BA/BF/FG/UK) |
| `TransactionType` | 14개 트랜잭션 Union (RECEIVE, PRODUCE, SHIP, ADJUST, BACKFLUSH, SCRAP, LOSS, DISASSEMBLE, RETURN, TRANSFER_*, MARK_DEFECTIVE, SUPPLIER_RETURN) |
| `Department` | 10개 부서 Union (조립/고압/진공/튜닝/튜브/AS/연구/영업/출하/기타) |
| `EmployeeLevel` | admin / manager / staff |
| `LocationStatus` | PRODUCTION / DEFECTIVE |
| `QueueBatchType` | PRODUCE / DISASSEMBLE / RETURN |
| `QueueBatchStatus` | OPEN / CONFIRMED / CANCELLED |
| `QueueLineDirection` | IN / OUT / SCRAP / LOSS |
| `AlertKind` | SAFETY / COUNT_VARIANCE |

### 주요 인터페이스

- `Item` — 35+ 필드 (기본정보 + 3버킷 수량 + ERP코드 + 레거시)
- `InventoryLocationRow` — 부서별 수량 상세 `{ department, status, quantity }`
- `QueueBatch` / `QueueLine` — 배치 + 라인 구조
- `BOMEntry` / `BOMTreeNode` — 평탄 / 트리 2가지 형식
- `TransactionLog` — 거래 이력 개별 행
- `StockAlert` / `PhysicalCount` / `ScrapLogRow` / `LossLogRow` / `VarianceLogRow`
- `Employee` / `ShipPackage` / `ShipPackageItemDetail`
- `ProductionCheckResponse` / `ProductionReceiptResponse` / `BackflushDetail`

---

## `api` 객체 전체 목록 (60+ 메서드)

### 📦 재고 요약·조회
- `getInventorySummary()` → `/api/inventory/summary`
- `getItemLocations(itemId)` → `/api/inventory/{id}/locations`
- `getTransactions({ item_id?, type?, from?, to? })`
- `updateTransactionNotes(logId, notes)`

### 📋 품목
- `getItems({ category, search, legacy*, barcode, department })`
- `getItem(itemId)`
- `createItem(payload)` — item_name/category/slots/option
- `updateItem(itemId, payload)`
- `getItemsExportUrl({ category?, search? })` — CSV URL 생성 (fetch 아님)

### 🚚 재고 변동
- `receiveInventory({ item_id, quantity, supplier?, operator, memo? })`
- `shipInventory({ item_id, quantity, destination, operator, memo? })`
- `shipPackage({ package_id, multiplier, destination, operator, memo? })`
- `adjustInventory({ item_id, new_quantity, reason, operator })`
- `transferToProduction({ item_id, to_dept, quantity, operator })`
- `transferToWarehouse({ item_id, from_dept, quantity, operator })`
- `transferBetweenDepts({ item_id, from_dept, to_dept, quantity, operator })`
- `markDefective({ item_id, quantity, reason, operator, source_dept? })`
- `returnToSupplier({ item_id, quantity, operator, memo? })`

### 🔧 BOM·생산
- `getBOM(parentItemId)` — 평탄
- `getBOMTree(parentItemId)` — 재귀 트리
- `createBOM(payload)` / `updateBOM(id, patch)` / `deleteBOM(id)`
- `productionReceipt(payload)` — 완제품 +입고 + BOM 백플러시
- `checkProduction(itemId, quantity)` — 사전 자재 검사

### 🏷️ 배치(Queue)
- `createQueueBatch({ batch_type, item_id, quantity, operator })`
- `listQueueBatches({ status?, ownerEmployeeId? })`
- `getQueueBatch(batchId)`
- `overrideQueueLine(batchId, lineId, quantity)` — OUT 라인 수량 덮어쓰기
- `toggleQueueLine(batchId, lineId, ...)` — direction 전환
- `addQueueLine(batchId, payload)` / `deleteQueueLine(batchId, lineId)`
- `confirmQueueBatch(batchId)` — 배치 확정
- `cancelQueueBatch(batchId)`

### 👥 직원
- `getEmployees({ department?, activeOnly? })`
- `createEmployee({ employee_code, name, role, department, level })`
- `updateEmployee(id, patch)` / `deleteEmployee(id)`

### 📦 출하 패키지
- `getShipPackages()`
- `createShipPackage({ package_code, name, notes? })`
- `updateShipPackage(id, patch)` / `deleteShipPackage(id)`
- `addShipPackageItem(packageId, { item_id, quantity })`
- `deleteShipPackageItem(packageId, packageItemId)`

### ⚠️ 스크랩·손실·차이
- `recordScrap({ item_id, quantity, process_stage?, reason, operator })`
- `recordLoss({ item_id, quantity, reason, operator }, deduct?)` — deduct 쿼리 파라미터
- `listScrap({ itemId?, batchId? })` / `listLoss(...)` / `listVariance(...)`

### 🔔 알림·실사
- `scanSafetyAlerts()` — 재스캔 트리거
- `listAlerts({ kind?, acknowledged?, itemId? })`
- `acknowledgeAlert(alertId, acknowledgedBy?)`
- `submitPhysicalCount({ item_id, counted_quantity, operator, reason? })`
- `listPhysicalCounts(itemId?)`

### ⚙️ 설정
- `verifyAdminPin(pin)`
- `updateAdminPin({ current_pin, new_pin })`
- `resetDatabase(pin)` — 파괴적

---

## `fetcher<T>()` 공통 래퍼

```typescript
export async function fetcher<T>(url: string): Promise<T> {
  let res: Response;
  try { res = await fetch(url); }
  catch { throw new Error(`API 연결 실패: ${url}`); }
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}
```

- 네트워크 오류 시 한글 메시지로 변환
- HTTP 오류(4xx/5xx) 시 `parseError()` 로 detail 문자열 추출
- GET 전용. POST/PUT/DELETE 는 각 메서드가 개별로 `fetch` 호출

---

## 호출 예시

### SWR 훅과 조합
```typescript
import useSWR from "swr";
import { api } from "@/lib/api";

const { data, error } = useSWR("inventory", () => api.getInventorySummary());
```

### 뮤테이션 (배치 확정)
```typescript
try {
  await api.confirmQueueBatch(batch.batch_id);
  toast.success("배치 확정 완료");
  mutate("queue"); // SWR 재조회
} catch (e) {
  toast.error(e.message);
}
```

---

## FAQ

**Q. 백엔드 스키마가 바뀌었는데 여기 수정 안 하면?**
TypeScript 컴파일은 통과하지만 런타임에 필드 누락으로 `undefined` 오류. 백엔드 변경 시 `schemas.py` ↔ `api.ts` 동시 수정 필수.

**Q. `NEXT_PUBLIC_API_URL` 언제 설정?**
프로덕션 배포 시(예: `https://api.example.com`). 로컬 개발은 비워둠 → Next.js 리라이트가 `/api/*` → `http://127.0.0.1:8000/api/*` 프록시.

**Q. `fetcher` 가 아닌 경로는?**
`createItem`, `receiveInventory` 등 POST류는 자체 `fetch` 블록에서 처리. `res.ok` 체크 + `parseError` 호출은 동일.

**Q. 에러 메시지는 어디서 오나?**
백엔드 `HTTPException(detail="...")` → `parseError()` 가 JSON 의 `detail` 필드 추출. 없으면 `res.statusText`.

**Q. 타입이 너무 많아 파일이 비대한데 쪼갤까?**
`types/item.ts`, `types/queue.ts` 등으로 분리 가능. 현재는 1파일 편의 우선.

**Q. 1033줄이면 어디에 뭐 있는지 찾기 힘듦.**
에디터 symbol search (VSCode: `Ctrl+Shift+O`) 로 `api.` 뒤 메서드 목록 바로 뜸.

---

## 관련 문서

- [[backend/app/schemas.py.md]] — Pydantic 원본
- [[backend/app/routers/routers]] — HTTP 엔드포인트 대응표
- [[frontend/app/legacy/_components/DesktopWarehouseView.tsx.md]]
- [[frontend/app/legacy/_components/DesktopAdminView.tsx.md]] — 배치 큐 처리 포함

Up: [[frontend/lib/lib]]
