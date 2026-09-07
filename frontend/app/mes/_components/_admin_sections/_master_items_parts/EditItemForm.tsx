"use client";

import type { Item } from "@/lib/api";
import type { ItemEditForm } from "../../_admin_hooks/useAdminMasterItems";
import { useAdminMasterItemsContext } from "../AdminMasterItemsContext";
import { ItemFormFields } from "./ItemFormFields";
import type { ItemFormData } from "./ItemFormFields";
import { ItemStockPurchaseFields } from "./ItemStockPurchaseFields";

export function EditItemForm({
  selectedItem,
  stockPurchaseOnly = false,
}: {
  selectedItem: Item;
  stockPurchaseOnly?: boolean;
}) {
  const { editForm, setEditForm, productModels } = useAdminMasterItemsContext();

  function handleSetForm(updater: (f: ItemFormData) => ItemFormData) {
    setEditForm((f: ItemEditForm) => {
      const next = updater(f as unknown as ItemFormData);
      return next as unknown as ItemEditForm;
    });
  }

  return (
    <div className={stockPurchaseOnly ? "h-full" : "space-y-4"}>
      {stockPurchaseOnly ? (
        <ItemStockPurchaseFields
          form={editForm}
          setForm={setEditForm}
          unit={editForm.unit}
          fillAvailableHeight
        />
      ) : (
        <ItemFormFields
          form={editForm as unknown as ItemFormData & { mes_code: string }}
          setForm={handleSetForm}
          showMesCode
          productModels={productModels}
        />
      )}
    </div>
  );
}
