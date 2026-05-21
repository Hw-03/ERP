---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/api/types/items.ts
tags: [vault, code-note, auto-generated, stub]
---

# items.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/api/types/items.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
/**
 * Items 도메인 타입 — `@/lib/api/types/items`.
 *
 * Round-10A (#2) 본문 이전. ProductModel 은 catalog 보다 items 에 더 자주
 * 사용되어 본 파일에 유지(호환). 향후 catalog 로 옮길 수 있음.
 */

import type { Department, InventoryLocationRow } from "./shared";

export interface Item {
  item_id: string;
  item_name: string;
  spec: string | null;
  unit: string;
  quantity: number;
  warehouse_qty: number;
  production_total: number;
  defective_total: number;
  pending_quantity: number;
  available_quantity: number;
  last_reserver_name: string | null;
  location: string | null;
  locations: InventoryLocationRow[];
  barcode: string | null;
  legacy_file_type: string | null;
  legacy_part: string | null;
  legacy_item_type: string | null;
  supplier: string | null;
  min_stock: number | null;
  item_code: string | null;
```
