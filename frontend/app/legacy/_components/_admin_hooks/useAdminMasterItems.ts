"use client";

// AdminMasterItemsSection 전용 wrapper hook.
// W5: List/Form/Commands 3-hook 으로 분해 후 호환 표면 유지.

import { useState } from "react";
import type { Item } from "@/lib/api";
import { useAdminMasterItemsList } from "./useAdminMasterItemsList";
import { useAdminMasterItemsForm } from "./useAdminMasterItemsForm";
import { useAdminMasterItemsCommands } from "./useAdminMasterItemsCommands";
import type { AddForm } from "../_admin_sections/adminShared";

export type { ItemEditForm } from "./useAdminMasterItemsForm";

export type UseAdminMasterItemsArgs = {
  items: Item[];
  setItems: (updater: (prev: Item[]) => Item[]) => void;
  globalSearch: string;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
  /** 짧은 토스트(상단 우측 비공식 메시지) — DesktopAdminView 의 showSave 와 호환 */
  onShowSave?: (msg: string) => void;
  adminPin: string;
};

type UpdateItemPayload = {
  item_name?: string;
  spec?: string;
  legacy_item_type?: string;
  supplier?: string;
  min_stock?: number;
  process_type_code?: string;
  unit?: string;
  model_slots?: number[];
  option_code?: string;
  item_code?: string;
};

export type AdminMasterItemsState = {
  selectedItem: Item | null;
  setSelectedItem: (i: Item | null) => void;
  itemSearch: string;
  setItemSearch: (v: string) => void;
  addMode: boolean;
  setAddMode: (v: boolean) => void;
  addForm: AddForm;
  setAddForm: (updater: (f: AddForm) => AddForm) => void;
  visibleItems: Item[];
  addItem: () => void;
  reorderItems: (ordered: Item[]) => void;
  saveItemField: (
    field: "item_name" | "spec" | "barcode" | "supplier" | "min_stock" | "unit" | "item_code" | "process_type_code",
    value: string,
  ) => void;
  updateItemFull: (payload: UpdateItemPayload) => void;
  editForm: import("./useAdminMasterItemsForm").ItemEditForm;
  setEditForm: (
    updater: (f: import("./useAdminMasterItemsForm").ItemEditForm) => import("./useAdminMasterItemsForm").ItemEditForm,
  ) => void;
  saveItem: () => Promise<void>;
  dirty: boolean;
};

export function useAdminMasterItems({
  items,
  setItems,
  globalSearch,
  onStatusChange,
  onError,
  onShowSave,
  adminPin,
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

  return {
    selectedItem,
    setSelectedItem,
    itemSearch: list.itemSearch,
    setItemSearch: list.setItemSearch,
    addMode: commands.addMode,
    setAddMode: commands.setAddMode,
    addForm: commands.addForm,
    setAddForm: commands.setAddForm,
    visibleItems: list.visibleItems,
    addItem: commands.add,
    reorderItems: commands.reorder,
    saveItemField: form.saveField,
    updateItemFull: form.updateFull,
    editForm: form.form,
    setEditForm: form.setForm,
    saveItem: form.save,
    dirty: form.dirty,
  };
}
