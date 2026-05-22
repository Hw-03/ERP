---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/api/types/catalog.ts
tags: [vault, code-note, auto-generated, stub]
---

# catalog.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/api/types/catalog.ts]]

## 원본 첫 줄

```
/**
 * Catalog 도메인 타입 — `@/lib/api/types/catalog`.
 * (BOM)
 * Round-10A (#2) 본문 이전.
 */

export interface BOMEntry {
  bom_id: string;
  parent_item_id: string;
  child_item_id: string;
  quantity: number;
  unit: string;
  notes: string | null;
}

export interface BOMDetailEntry {
  bom_id: string;
  parent_item_id: string;
  parent_item_name: string;
  parent_item_code: string | null;
  child_item_id: string;
  child_item_name: string;
  child_item_code: string | null;
  quantity: number;
  unit: string;
}

export interface BOMTreeNode {
  item_id: string;
  item_code: string;
```
