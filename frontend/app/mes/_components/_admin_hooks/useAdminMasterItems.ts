"use client";

// AdminMasterItemsSection 전용 wrapper hook.
// W5: List/Form/Commands 3-hook 으로 분해 후 호환 표면 유지.

import { useEffect, useState } from "react";
import type { Item, ProductModel } from "@/lib/api";
import { useAdminMasterItemsList } from "./useAdminMasterItemsList";
import { useAdminMasterItemsForm } from "./useAdminMasterItemsForm";
import { useAdminMasterItemsCommands } from "./useAdminMasterItemsCommands";
import { useItemCodePreview, type ItemCodePreview } from "./useItemCodePreview";
import type { AddForm } from "../_admin_sections/adminShared";

export type { ItemEditForm } from "./useAdminMasterItemsForm";

export type UseAdminMasterItemsArgs = {
  items: Item[];
  setItems: (updater: (prev: Item[]) => Item[]) => void;
  globalSearch: string;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
  /** 짧은 상태 대상 알림 — DesktopAdminView 의 showSave 와 호환 */
  onShowSave?: (msg: string) => void;
  adminPin: string;
  productModels: ProductModel[];
};

type UpdateItemPayload = {
  item_name?: string;
  spec?: string;
  legacy_item_type?: string;
  supplier?: string | null;
  supplier_item_code?: string | null;
  standard_purchase_price?: string | null;
  purchase_price_effective_date?: string | null;
  min_stock?: number | null;
  reorder_point?: number | null;
  procurement_lead_time_days?: number | null;
  minimum_order_quantity?: number | null;
  purchase_memo?: string | null;
  process_type_code?: string;
  unit?: string;
  model_slots?: number[];
  bom_stock_exempt?: boolean;
  sales_review_required?: boolean;
  mes_code?: string;
};

export type AdminMasterItemsState = {
  addCodePreview: ItemCodePreview;
  editCodePreview: ItemCodePreview;
  selectedItem: Item | null;
  setSelectedItem: (i: Item | null) => void;
  itemSearch: string;
  setItemSearch: (v: string) => void;
  addMode: boolean;
  setAddMode: (v: boolean) => void;
  addForm: AddForm;
  setAddForm: (updater: (f: AddForm) => AddForm) => void;
  visibleItems: Item[];
  canReorderItems: boolean;
  addItem: () => void;
  reorderItems: (ordered: Item[]) => void;
  saveItemField: (
    field: "item_name" | "spec" | "barcode" | "supplier" | "min_stock" | "unit" | "mes_code" | "process_type_code",
    value: string,
  ) => void;
  updateItemFull: (payload: UpdateItemPayload) => void;
  editForm: import("./useAdminMasterItemsForm").ItemEditForm;
  setEditForm: (
    updater: (f: import("./useAdminMasterItemsForm").ItemEditForm) => import("./useAdminMasterItemsForm").ItemEditForm,
  ) => void;
  saveItem: () => Promise<void>;
  dirty: boolean;
  deleteItem: (itemId: string) => Promise<void>;
  restoreItem: (itemId: string) => Promise<void>;
  productModels: ProductModel[];
};

export function useAdminMasterItems({
  items,
  setItems,
  globalSearch,
  onStatusChange,
  onError,
  onShowSave,
  adminPin,
  productModels,
}: UseAdminMasterItemsArgs): AdminMasterItemsState {
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  const list = useAdminMasterItemsList({ items, globalSearch });
  const form = useAdminMasterItemsForm({
    selectedItem,
    setSelectedItem,
    setItems,
    onStatusChange,
    onError,
    onShowSave,
  });
  const commands = useAdminMasterItemsCommands({
    setItems,
    setSelectedItem,
    onStatusChange,
    onError,
    onShowSave,
    adminPin,
  });
  const addCodePreview = useItemCodePreview(commands.addForm.process_type_code, commands.addForm.model_slots, undefined, commands.addMode);
  const editCodePreview = useItemCodePreview(form.form.process_type_code, form.form.model_slots, selectedItem?.item_id, Boolean(selectedItem));

  useEffect(() => {
    if (!selectedItem || form.dirty) return;
    const refreshedItem = items.find((item) => item.item_id === selectedItem.item_id);
    if (refreshedItem && refreshedItem !== selectedItem) setSelectedItem(refreshedItem);
  }, [items, selectedItem, form.dirty]);

  return {
    addCodePreview,
    editCodePreview,
    selectedItem,
    setSelectedItem,
    itemSearch: list.itemSearch,
    setItemSearch: list.setItemSearch,
    addMode: commands.addMode,
    setAddMode: commands.setAddMode,
    addForm: commands.addForm,
    setAddForm: commands.setAddForm,
    visibleItems: list.visibleItems,
    canReorderItems: list.canReorderItems,
    addItem: () => {
      if (addCodePreview.status !== "ready" || !addCodePreview.code) {
        onError("품목 코드 미리보기를 확인한 뒤 추가하세요.");
        return;
      }
      commands.add(addCodePreview.code, addCodePreview.retry);
    },
    reorderItems: commands.reorder,
    saveItemField: form.saveField,
    updateItemFull: form.updateFull,
    editForm: form.form,
    setEditForm: form.setForm,
    saveItem: async () => {
      const changedCode = selectedItem && (selectedItem.process_type_code !== form.form.process_type_code
        || JSON.stringify(selectedItem.model_slots ?? []) !== JSON.stringify(form.form.model_slots));
      if (changedCode && (editCodePreview.status !== "ready" || !editCodePreview.code)) {
        onError("품목 코드 미리보기를 확인한 뒤 저장하세요.");
        return;
      }
      await form.save(editCodePreview.code, editCodePreview.retry);
    },
    dirty: form.dirty,
    deleteItem: commands.deleteItem,
    restoreItem: commands.restoreItem,
    productModels,
  };
}
