"use client";

// AdminMasterItemsSection 전용 hook.
// 품목 마스터 검색/선택/추가/필드 저장 상태와 액션을 한 곳에 모은다.

import { useMemo, useState } from "react";
import type { Item } from "@/lib/api";
import { api } from "@/lib/api";
import { EMPTY_ADD_FORM, type AddForm } from "../_admin_sections/adminShared";

export type UseAdminMasterItemsArgs = {
  items: Item[];
  setItems: (updater: (prev: Item[]) => Item[]) => void;
  globalSearch: string;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
  /** 짧은 토스트(상단 우측 비공식 메시지) — DesktopAdminView 의 showSave 와 호환 */
  onShowSave?: (msg: string) => void;
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
  saveItemField: (
    field: "item_name" | "spec" | "barcode" | "legacy_model" | "supplier",
    value: string,
  ) => void;
};

export function useAdminMasterItems({
  items,
  setItems,
  globalSearch,
  onStatusChange,
  onError,
  onShowSave,
}: UseAdminMasterItemsArgs): AdminMasterItemsState {
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [itemSearch, setItemSearch] = useState("");
  const [addMode, setAddMode] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(EMPTY_ADD_FORM);

  const visibleItems = useMemo(() => {
    const keyword = `${globalSearch} ${itemSearch}`.trim().toLowerCase();
    if (!keyword) return items.slice(0, 200);
    return items
      .filter((item) => `${item.item_name} ${item.erp_code}`.toLowerCase().includes(keyword))
      .slice(0, 200);
  }, [globalSearch, itemSearch, items]);

  async function _addItem() {
    if (!addForm.item_name.trim()) {
      onError("품목명을 입력하세요.");
      return;
    }
    try {
      const created = await api.createItem({
        item_name: addForm.item_name.trim(),
        process_type_code: addForm.process_type_code || undefined,
        spec: addForm.spec || undefined,
        unit: addForm.unit || "EA",
        model_slots: addForm.model_slots.length > 0 ? addForm.model_slots : undefined,
        option_code: addForm.option_code || undefined,
        legacy_item_type: addForm.legacy_item_type || undefined,
        supplier: addForm.supplier || undefined,
        min_stock: addForm.min_stock ? Number(addForm.min_stock) : undefined,
        initial_quantity: addForm.initial_quantity ? Number(addForm.initial_quantity) : undefined,
      });
      setItems((current) => [created, ...current]);
      setSelectedItem(created);
      setAddMode(false);
      setAddForm(() => EMPTY_ADD_FORM);
      onStatusChange(`'${created.item_name}' 품목이 추가됐습니다. (${created.erp_code})`);
      onShowSave?.(`'${created.item_name}' 품목이 추가됐습니다.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "품목 추가에 실패했습니다.");
    }
  }

  async function _saveItemField(
    field: "item_name" | "spec" | "barcode" | "legacy_model" | "supplier",
    value: string,
  ) {
    if (!selectedItem) return;
    try {
      const updated = await api.updateItem(selectedItem.item_id, { [field]: value || undefined });
      setItems((current) => current.map((item) => (item.item_id === updated.item_id ? updated : item)));
      setSelectedItem(updated);
      onStatusChange(`${updated.item_name} 정보를 저장했습니다.`);
      onShowSave?.("저장됐습니다.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "저장에 실패했습니다.");
    }
  }

  return {
    selectedItem,
    setSelectedItem,
    itemSearch,
    setItemSearch,
    addMode,
    setAddMode,
    addForm,
    setAddForm,
    visibleItems,
    addItem: () => void _addItem(),
    saveItemField: (f, v) => void _saveItemField(f, v),
  };
}
