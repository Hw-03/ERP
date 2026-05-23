"use client";

import { useEffect, useMemo, useState } from "react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useAdminMasterItemsContext } from "../AdminMasterItemsContext";
import { ItemFormFields } from "./ItemFormFields";
import type { ItemFormData } from "./ItemFormFields";

function itemToForm(item: Item): ItemFormData & { item_code: string } {
  return {
    item_name: item.item_name,
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
  const { updateItemFull, registerEditState } = useAdminMasterItemsContext();
  const [form, setForm] = useState(() => itemToForm(selectedItem));

  // PR-2 2-3: 원본 vs 현재 form 비교로 dirty 계산
  const dirty = useMemo(() => {
    const orig = itemToForm(selectedItem);
    if (orig.item_name !== form.item_name) return true;
    if (orig.legacy_item_type !== form.legacy_item_type) return true;
    if (orig.supplier !== form.supplier) return true;
    if (orig.min_stock !== form.min_stock) return true;
    if (orig.process_type_code !== form.process_type_code) return true;
    if (orig.unit !== form.unit) return true;
    if (orig.option_code !== form.option_code) return true;
    if (orig.item_code !== form.item_code) return true;
    const a = orig.model_slots ?? [];
    const b = form.model_slots ?? [];
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return true;
    }
    return false;
  }, [selectedItem, form]);

  async function handleSave(): Promise<void> {
    await updateItemFull({
      item_name: form.item_name || undefined,
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

  // 상위 컨텍스트에 dirty/save 등록 → AdminMasterItemsSection 가 항목 변경/탭 가드에서 활용
  useEffect(() => {
    registerEditState(dirty, handleSave);
    return () => registerEditState(false, () => undefined);
    // handleSave 는 form/selectedItem 의존, dirty 도 같음 — 매 변경 시 갱신.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, form, selectedItem]);

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
