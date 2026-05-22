---
type: file-explanation
source_path: "frontend/lib/api/inventory.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# inventory.ts — inventory.ts 설명

## 이 파일은 무엇을 책임지나

`inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `inventoryApi`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/lib/api-core.ts]] — 프론트 화면이 백엔드에 요청을 보낼 때 공통으로 쓰는 fetch 보조 파일입니다.
- [[ERP/frontend/lib/api/types/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
/**
 * Inventory 도메인 API — `@/lib/api/inventory`.
 *
 * Round-6 (R6-D1) 분리. 9개 메소드:
 *   - getInventorySummary
 *   - receiveInventory
 *   - adjustInventory
 *   - transferToProduction / transferToWarehouse / transferBetweenDepts
 *   - markDefective / returnToSupplier
 *   - getItemLocations
 *
 * 외부 호환을 위해 `frontend/lib/api.ts` 가 spread merge 한다.
 */

import { fetcher, postJson, toApiUrl } from "../api-core";
import type {
  Department,
  InventoryLocationRow,
  InventoryMutationResponse,
  InventorySummary,
} from "./types";

export const inventoryApi = {
  getInventorySummary: () => fetcher<InventorySummary>(toApiUrl("/api/inventory/summary")),

  receiveInventory: (payload: {
    item_id: string;
    quantity: number;
    location?: string;
    reference_no?: string;
    produced_by?: string;
    notes?: string;
  }) => postJson<InventoryMutationResponse>(toApiUrl("/api/inventory/receive"), payload),

  adjustInventory: (payload: {
    item_id: string;
    quantity: number;
    reason: string;
    location?: string;
    reference_no?: string;
    produced_by?: string;
  }) => postJson<InventoryMutationResponse>(toApiUrl("/api/inventory/adjust"), payload),

  transferToProduction: (payload: {
    item_id: string;
    quantity: number;
    department: Department;
    notes?: string;
    reference_no?: string;
    produced_by?: string;
  }) =>
    postJson<InventoryMutationResponse>(
      toApiUrl("/api/inventory/transfer-to-production"),
      payload,
    ),
```
