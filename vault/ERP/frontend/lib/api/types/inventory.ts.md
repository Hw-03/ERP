---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/api/types/inventory.ts
tags: [vault, code-note, auto-generated, stub]
---

# inventory.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/api/types/inventory.ts]]

## 원본 첫 줄

```
/**
 * Inventory 도메인 타입 — `@/lib/api/types/inventory`.
 * Round-10A (#2) 본문 이전.
 */

import type { ProcessTypeSummary } from "./shared";

export interface InventorySummary {
  process_types: ProcessTypeSummary[];
  total_items: number;
  total_quantity: number;
}

export interface InventoryMutationResponse {
  inventory_id: string;
  item_id: string;
  quantity: string;
  location: string | null;
  updated_at: string;
}
```
