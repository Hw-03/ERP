---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/api/catalog.ts
tags: [vault, code-note, auto-generated, stub]
---

# catalog.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/api/catalog.ts]]

## 원본 첫 줄

```
/**
 * Catalog 도메인 API — `@/lib/api/catalog`.
 *
 * Round-6 (R6-D6) 분리. 마스터 데이터 관련:
 *   - Models (3 메소드)
 *   - BOM (7 메소드)
 *
 * 총 10 메소드.
 */

import { deleteJson, fetcher, patchJson, postJson, toApiUrl } from "../api-core";
import type {
  BOMDetailEntry,
  BOMEntry,
  BOMTreeNode,
  ProductModel,
} from "./types";

export const catalogApi = {
  // Models -----------------------------------------------------------------
  getModels: () => fetcher<ProductModel[]>(toApiUrl("/api/models")),

  createModel: (payload: { model_name: string; symbol?: string }) =>
    postJson<ProductModel>(toApiUrl("/api/models"), payload),

  deleteModel: (slot: number) => deleteJson<void>(toApiUrl(`/api/models/${slot}`)),

  // BOM --------------------------------------------------------------------
  getAllBOM: () => fetcher<BOMDetailEntry[]>(toApiUrl("/api/bom")),
  getBOM: (parentItemId: string) => fetcher<BOMEntry[]>(toApiUrl(`/api/bom/${parentItemId}`)),
```
