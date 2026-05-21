---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/_master_items_parts/AddItemForm.tsx
tags: [vault, code-note, auto-generated, stub]
---

# AddItemForm.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/_master_items_parts/AddItemForm.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { EMPTY_ADD_FORM } from "../adminShared";
import { useAdminMasterItemsContext } from "../AdminMasterItemsContext";
import { ItemFormFields } from "./ItemFormFields";
import type { ItemFormData } from "./ItemFormFields";

export function AddItemForm() {
  const {
    setAddMode,
    addForm,
    setAddForm,
    addItem: onAddItem,
  } = useAdminMasterItemsContext();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-base font-bold">새 품목 추가</div>
        <button
          onClick={() => {
            setAddMode(false);
            setAddForm(() => EMPTY_ADD_FORM);
          }}
          className="flex items-center justify-center rounded-full p-1 hover:bg-red-500/10"
          style={{ color: LEGACY_COLORS.red }}
        >
          <X className="h-4 w-4" />
```
