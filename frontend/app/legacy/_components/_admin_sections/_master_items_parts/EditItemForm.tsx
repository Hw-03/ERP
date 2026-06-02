"use client";

import type { Item } from "@/lib/api";
import type { ItemEditForm } from "../../_admin_hooks/useAdminMasterItems";
import { useAdminMasterItemsContext } from "../AdminMasterItemsContext";
import { ItemFormFields } from "./ItemFormFields";
import type { ItemFormData } from "./ItemFormFields";

export function EditItemForm({ selectedItem }: { selectedItem: Item }) {
  const { editForm, setEditForm, productModels } = useAdminMasterItemsContext();

  function handleSetForm(updater: (f: ItemFormData) => ItemFormData) {
    setEditForm((f: ItemEditForm) => {
      const next = updater(f as unknown as ItemFormData);
      return next as unknown as ItemEditForm;
    });
  }

  return (
    <div className="space-y-4">
      <div className="text-base font-bold">{selectedItem.item_name}</div>

      <ItemFormFields
        form={editForm as unknown as ItemFormData & { mes_code: string }}
        setForm={handleSetForm}
        showMesCode
        productModels={productModels}
      />
    </div>
  );
}
