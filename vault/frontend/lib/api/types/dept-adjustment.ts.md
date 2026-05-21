---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/api/types/dept-adjustment.ts
tags: [vault, code-note, auto-generated, stub]
---

# dept-adjustment.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/api/types/dept-adjustment.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
import type { Department } from "./shared";

export type DeptAdjSubType = "production" | "disassembly" | "correction";
export type AdjDirection = "in" | "out" | "defective" | "scrap";

export interface AdjLineTemplate {
  item_id: string;
  item_name: string;
  item_code: string | null;
  process_type_code: string | null;
  unit: string;
  direction: AdjDirection;
  quantity: number;
  bom_expected: number | null;
  has_children: boolean;
  department: Department;
  reason: string | null;
}

export interface BomTemplateResponse {
  sub_type: DeptAdjSubType;
  lines: AdjLineTemplate[];
}

export interface AdjLineInput {
  item_id: string;
  direction: AdjDirection;
  quantity: number;
  department: Department;
  reason?: string | null;
```
