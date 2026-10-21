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
    addCodePreview,
    adding,
  } = useAdminMasterItemsContext();

  return (
    <fieldset className="space-y-4" disabled={adding} aria-busy={adding}>
      <ItemFormFields
        form={addForm as ItemFormData & { initial_quantity: string }}
        setForm={setAddForm as (u: (f: ItemFormData) => ItemFormData) => void}
        showInitialLocations
        showMesCode
        codePreview={addCodePreview}
        enableAfSalesReviewDefault
        productModels={productModels}
      />
      <ItemStockPurchaseFields
        form={addForm}
        setForm={setAddForm}
        unit={addForm.unit}
      />

      <button
        onClick={() => void onAddItem().catch(() => {})}
        disabled={adding || !addForm.item_name.trim() || addCodePreview?.status !== "ready"}
        aria-busy={adding}
        className="w-full rounded-[18px] py-3 text-base font-bold text-white"
        style={{ background: LEGACY_COLORS.greenSolid }}
      >
        추가
      </button>
    </fieldset>
  );
}
