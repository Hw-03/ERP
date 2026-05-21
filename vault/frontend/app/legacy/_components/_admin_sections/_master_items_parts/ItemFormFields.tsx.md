---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/_master_items_parts/ItemFormFields.tsx
tags: [vault, code-note, auto-generated, stub]
---

# ItemFormFields.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/_master_items_parts/ItemFormFields.tsx]]

## 원본 첫 줄

```
"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { AppSelect } from "../../common/AppSelect";
import { PROCESS_TYPE_OPTIONS, MODEL_SLOTS, UNIT_OPTIONS } from "../adminShared";

export type ItemFormData = {
  item_name: string;
  spec: string;
  legacy_item_type: string;
  supplier: string;
  min_stock: string;
  process_type_code: string;
  unit: string;
  model_slots: number[];
  option_code: string;
  initial_quantity?: string;
  item_code?: string;
};

interface Props {
  form: ItemFormData;
  setForm: (updater: (f: ItemFormData) => ItemFormData) => void;
  showInitialQuantity?: boolean;
  showItemCode?: boolean;
}

function FieldLabel({ label, badge }: { label: string; badge?: "필수" | "선택" }) {
  return (
    <div
```
