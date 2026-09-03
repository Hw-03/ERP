"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { useAdminMasterItemsContext } from "../AdminMasterItemsContext";
import { ItemFormFields } from "./ItemFormFields";
import type { ItemFormData } from "./ItemFormFields";
import { ItemStockPurchaseFields } from "./ItemStockPurchaseFields";

export function AddItemForm() {
  const {
    addForm,
    setAddForm,
    addItem: onAddItem,
    productModels,
  } = useAdminMasterItemsContext();

  return (
    <div className="space-y-4">
      <ItemFormFields
        form={addForm as ItemFormData & { initial_quantity: string }}
        setForm={setAddForm as (u: (f: ItemFormData) => ItemFormData) => void}
        showInitialLocations
        enableAfSalesReviewDefault
        productModels={productModels}
      />
      <ItemStockPurchaseFields
        form={addForm}
        setForm={setAddForm}
        unit={addForm.unit}
      />

      <button
        onClick={onAddItem}
        className="w-full rounded-[18px] py-3 text-base font-bold text-white"
        style={{ background: LEGACY_COLORS.greenSolid }}
      >
        추가
      </button>
    </div>
  );
}
