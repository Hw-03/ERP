---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/__tests__/mes-item.test.ts
tags: [vault, code-note, auto-generated, stub]
---

# mes-item.test.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/__tests__/mes-item.test.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
import { describe, it, expect } from "vitest";
import {
  buildItemSearchLabel,
  itemMatchesKpi,
  groupedItems,
} from "../mes/item";
import type { Item } from "../api";

const stubItem = (overrides: Partial<Item> = {}): Item => ({
  item_id: "id-1",
  item_name: "Widget A",
  spec: null,
  unit: "EA",
  quantity: 10,
  warehouse_qty: 10,
  production_total: 0,
  defective_total: 0,
  pending_quantity: 0,
  available_quantity: 10,
  last_reserver_name: null,
  location: null,
  locations: [],
  barcode: null,
  legacy_file_type: null,
  legacy_part: null,
  legacy_item_type: null,
  supplier: null,
  min_stock: null,
  item_code: "ITM-AA-00001",
  model_symbol: null,
```
