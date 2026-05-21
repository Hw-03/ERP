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
      item_name: form.item_name || undefined,
      spec: form.spec || undefined,
      legacy_item_type: form.legacy_item_type || undefined,
      supplier: form.supplier || undefined,
      min_stock: form.min_stock ? Number(form.min_stock) : undefined,
      process_type_code: form.process_type_code || undefined,
      unit: form.unit || undefined,
      model_slots: form.model_slots,
      option_code: form.option_code || undefined,
      item_code: form.item_code || undefined,
    });
  }

  return (
    <div className="space-y-4">
      <div className="text-base font-bold">{selectedItem.item_name}</div>

      <ItemFormFields
        form={form}
        setForm={setForm as (u: (f: ItemFormData) => ItemFormData) => void}
        showItemCode
      />

      <button
        onClick={handleSave}
        className="w-full rounded-[18px] py-3 text-base font-bold text-white"
        style={{ background: LEGACY_COLORS.blue }}
      >
        저장
      </button>
    </div>
  );
}
