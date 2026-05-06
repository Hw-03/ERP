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
        </button>
      </div>

      <ItemFormFields
        form={addForm as ItemFormData & { initial_quantity: string }}
        setForm={setAddForm as (u: (f: ItemFormData) => ItemFormData) => void}
        showInitialQuantity
      />

      <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
        품번은 카테고리 기반으로 자동 부여됩니다. (예: RM-00972)
      </div>
      <button
        onClick={onAddItem}
        className="w-full rounded-[18px] py-3 text-base font-bold text-white"
        style={{ background: LEGACY_COLORS.green }}
      >
        추가
      </button>
    </div>
  );
}
