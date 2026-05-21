---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/_master_items_parts/EditItemForm.tsx
tags: [vault, code-note, auto-generated, stub]
---

# EditItemForm.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/_master_items_parts/EditItemForm.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { useState } from "react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useAdminMasterItemsContext } from "../AdminMasterItemsContext";
import { ItemFormFields } from "./ItemFormFields";
import type { ItemFormData } from "./ItemFormFields";

function itemToForm(item: Item): ItemFormData & { item_code: string } {
  return {
    item_name: item.item_name,
    spec: item.spec ?? "",
    legacy_item_type: item.legacy_item_type ?? "",
    supplier: item.supplier ?? "",
    min_stock: item.min_stock != null ? String(item.min_stock) : "",
    process_type_code: item.process_type_code ?? "TR",
    unit: item.unit ?? "EA",
    model_slots: item.model_slots ?? [],
    option_code: item.option_code ?? "",
    item_code: item.item_code ?? "",
  };
}

export function EditItemForm({ selectedItem }: { selectedItem: Item }) {
  const { updateItemFull } = useAdminMasterItemsContext();
  const [form, setForm] = useState(() => itemToForm(selectedItem));

  function handleSave() {
    updateItemFull({
```
