---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/api/types/io.ts
tags: [vault, code-note, auto-generated, stub]
---

# io.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/api/types/io.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
import type { Department } from "./shared";

export type IoWorkType = "receive" | "warehouse_io" | "process" | "defect";

export type IoSubType =
  | "receive_supplier"
  | "warehouse_to_dept"
  | "dept_to_warehouse"
  | "produce"
  | "disassemble"
  | "dept_transfer"
  | "adjust_in"
  | "adjust_out"
  | "defect_quarantine"
  | "supplier_return";

export type IoSourceKind = "direct_item" | "bom_parent" | "manual";
export type IoLineOrigin = "direct" | "bom_auto" | "package_auto" | "manual";
export type IoLineDirection = "in" | "out" | "move" | "defective" | "adjust";
export type IoBucket = "warehouse" | "production" | "defective" | "none";

export interface IoLine {
  line_id: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  unit: string;
  direction: IoLineDirection;
  from_bucket: IoBucket;
  from_department: Department | string | null;
```
