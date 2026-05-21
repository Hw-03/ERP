---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/api/items.ts
tags: [vault, code-note, auto-generated, stub]
---

# items.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/api/items.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
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
      legacyFileType?: string;
      legacyPart?: string;
      legacyItemType?: string;
      barcode?: string;
      department?: string;
    },
    opts?: { signal?: AbortSignal },
  ) => {
    const query = new URLSearchParams();
```
