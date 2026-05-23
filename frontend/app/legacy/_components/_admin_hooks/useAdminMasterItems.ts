"use client";

// AdminMasterItemsSection 전용 hook.
// 품목 마스터 검색/선택/추가/필드 저장 상태와 액션을 한 곳에 모은다.

import { useCallback, useMemo, useRef, useState } from "react";
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
  saveItemField: (
    field: "item_name" | "spec" | "barcode" | "supplier" | "min_stock" | "unit" | "item_code" | "process_type_code",
    value: string,
  ) => void;
  updateItemFull: (payload: UpdateItemPayload) => Promise<void>;
  /** PR-2 2-3: 활성 EditItemForm 의 dirty/save 등록.
   *  EditItemForm 마운트 시 register, 언마운트 시 register(false, noop).
   */
  registerEditState: (dirty: boolean, save: () => Promise<void> | void) => void;
  /** 활성 EditItemForm 의 dirty 여부 */
  editDirty: boolean;
  /** 활성 EditItemForm 의 save 실행 (없으면 no-op) */
  saveActiveEdit: () => Promise<void>;
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
  const [editDirty, setEditDirty] = useState(false);
  const editSaveRef = useRef<(() => Promise<void> | void) | null>(null);

  const registerEditState = useCallback(
    (dirty: boolean, save: () => Promise<void> | void) => {
      editSaveRef.current = save;
      setEditDirty(dirty);
    },
    [],
  );

  const saveActiveEdit = useCallback(async () => {
    const fn = editSaveRef.current;
    if (fn) await Promise.resolve(fn());
  }, []);

  const visibleItems = useMemo(() => {
    const keyword = `${globalSearch} ${itemSearch}`.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) => `${item.item_name} ${item.item_code}`.toLowerCase().includes(keyword));
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
      onStatusChange(`'${created.item_name}' 품목이 추가됐습니다. (${created.item_code})`);
      onShowSave?.(`'${created.item_name}' 품목이 추가됐습니다.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "품목 추가에 실패했습니다.");
    }
  }

  async function _saveItemField(
    field: "item_name" | "spec" | "barcode" | "supplier" | "min_stock" | "unit" | "item_code" | "process_type_code",
    value: string,
  ) {
    if (!selectedItem) return;
    try {
      const payload = field === "min_stock"
        ? { min_stock: value ? Number(value) : undefined }
        : { [field]: value || undefined };
      const updated = await api.updateItem(selectedItem.item_id, payload);
      setItems((current) => current.map((item) => (item.item_id === updated.item_id ? updated : item)));
      setSelectedItem(updated);
      onStatusChange(`${updated.item_name} 정보를 저장했습니다.`);
      onShowSave?.("저장됐습니다.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "저장에 실패했습니다.");
    }
  }

  async function _updateItemFull(payload: UpdateItemPayload) {
    if (!selectedItem) return;
    try {
      const updated = await api.updateItem(selectedItem.item_id, payload);
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
    updateItemFull: _updateItemFull,
    registerEditState,
    editDirty,
    saveActiveEdit,
  };
}
