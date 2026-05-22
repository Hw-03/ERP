---
type: file-explanation
source_path: "frontend/lib/api/items.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# items.ts — items.ts 설명

## 이 파일은 무엇을 책임지나

`items.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `itemsApi`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/lib/api-core.ts]] — 프론트 화면이 백엔드에 요청을 보낼 때 공통으로 쓰는 fetch 보조 파일입니다.
- [[ERP/backend/app/routers/items.py]] — `items.py`는 `items` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/frontend/lib/api/types/items.ts]] — `items.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
/**
 * Items 도메인 API — `@/lib/api/items`.
 *
 * Round-5 (R5-5) 분리. 핵심 CRUD 4개 메소드.
 * 외부 호환을 위해 `frontend/lib/api.ts` 가 spread merge 한다.
 *
 * 새 코드는 다음 중 하나로:
 *   import { itemsApi } from "@/lib/api/items";
 *   import { api } from "@/lib/api";  // ...itemsApi 포함됨 (호환)
 */

import { fetcher, patchJson, postJson, putJson, toApiUrl } from "../api-core";
import type { Item } from "./types";

export const itemsApi = {
  getItems: (
    params?: {
      process_type_code?: string;
      search?: string;
      skip?: number;
      limit?: number;
      legacyPart?: string;
      legacyItemType?: string;
      department?: string;
    },
    opts?: { signal?: AbortSignal },
  ) => {
    const query = new URLSearchParams();
    if (params?.process_type_code) query.set("process_type_code", params.process_type_code);
    if (params?.search) query.set("search", params.search);
    if (params?.skip !== undefined) query.set("skip", String(params.skip));
    if (params?.limit !== undefined) query.set("limit", String(params.limit));
    if (params?.legacyPart) query.set("legacy_part", params.legacyPart);
    if (params?.legacyItemType) query.set("legacy_item_type", params.legacyItemType);
    if (params?.department) query.set("department", params.department);
    return fetcher<Item[]>(toApiUrl(`/api/items?${query}`), opts?.signal);
  },

  getItem: (itemId: string) => fetcher<Item>(toApiUrl(`/api/items/${itemId}`)),

  createItem: async (payload: {
    item_name: string;
    process_type_code?: string;
    unit?: string;
    legacy_item_type?: string;
    supplier?: string;
    min_stock?: number;
    initial_quantity?: number;
    model_slots?: number[];
    option_code?: string;
  }) => postJson<Item>(toApiUrl("/api/items"), payload),

  updateItem: async (
    itemId: string,
    payload: {
```
