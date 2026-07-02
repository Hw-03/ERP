"use client";

// W5: MasterItems 도메인 Form sub-hook.
// 책임: 단일 품목 편집 폼 (editForm + dirty + save).
// + 필드 단위 즉시 저장 (saveItemField / updateItemFull) 도 form 책임 — 선택된 품목의 변경 작업.

import { useEffect, useState } from "react";
import type { Item } from "@/lib/api";
import { api } from "@/lib/api";

function notifyItemsChanged() {
  window.dispatchEvent(new Event("items"));
}

export type ItemEditForm = {
  item_name: string;
  legacy_item_type: string;
  supplier: string;
  min_stock: string;
  process_type_code: string;
  unit: string;
  model_slots: number[];
  mes_code: string;
};

export const EMPTY_ITEM_EDIT_FORM: ItemEditForm = {
  item_name: "",
  legacy_item_type: "",
  supplier: "",
  min_stock: "",
  process_type_code: "TR",
  unit: "EA",
  model_slots: [],
  mes_code: "",
};

const SYMBOL_TO_SLOT: Record<string, number> = { "3": 1, "7": 2, "8": 3, "4": 4, "6": 5, "9": 6 };

function inferModelSlots(code: string): number[] {
  const seg = code.split("-")[0] ?? "";
  return seg
    .split("")
    .map((ch) => SYMBOL_TO_SLOT[ch])
    .filter((s): s is number => s !== undefined)
    .sort((a, b) => a - b);
}

export function itemToEditForm(item: Item): ItemEditForm {
  const savedSlots = item.model_slots ?? [];
  const mesCode = item.mes_code ?? "";
  return {
    item_name: item.item_name,
    legacy_item_type: item.legacy_item_type ?? "",
    supplier: item.supplier ?? "",
    min_stock: item.min_stock != null ? String(Math.round(Number(item.min_stock))) : "",
    process_type_code: item.process_type_code ?? "TR",
    unit: item.unit ?? "EA",
    model_slots: savedSlots.length > 0 ? savedSlots : inferModelSlots(mesCode),
    mes_code: mesCode,
  };
}

type UpdateItemPayload = {
  item_name?: string;
  spec?: string;
  legacy_item_type?: string;
  supplier?: string;
  min_stock?: number;
  process_type_code?: string;
  unit?: string;
  model_slots?: number[];
  mes_code?: string;
};

export type UseAdminMasterItemsFormArgs = {
  selectedItem: Item | null;
  setSelectedItem: (i: Item | null) => void;
  setItems: (updater: (prev: Item[]) => Item[]) => void;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
  onShowSave?: (msg: string) => void;
};

export type UseAdminMasterItemsFormState = {
  form: ItemEditForm;
  setForm: (updater: (prev: ItemEditForm) => ItemEditForm) => void;
  dirty: boolean;
  save: () => Promise<void>;
  saveField: (
    field: "item_name" | "spec" | "barcode" | "supplier" | "min_stock" | "unit" | "mes_code" | "process_type_code",
    value: string,
  ) => void;
  updateFull: (payload: UpdateItemPayload) => void;
};

export function useAdminMasterItemsForm({
  selectedItem,
  setSelectedItem,
  setItems,
  onStatusChange,
  onError,
  onShowSave,
}: UseAdminMasterItemsFormArgs): UseAdminMasterItemsFormState {
  const [form, setFormState] = useState<ItemEditForm>(EMPTY_ITEM_EDIT_FORM);
  const [dirty, setDirty] = useState(false);

  // 품목 선택 시 form 채우기
  useEffect(() => {
    if (selectedItem) {
      setFormState(itemToEditForm(selectedItem));
      setDirty(false);
    } else {
      setFormState(EMPTY_ITEM_EDIT_FORM);
      setDirty(false);
    }
  }, [selectedItem?.item_id]); // eslint-disable-line react-hooks/exhaustive-deps

  function setForm(updater: (prev: ItemEditForm) => ItemEditForm) {
    setFormState(updater);
    setDirty(true);
  }

  async function save(): Promise<void> {
    if (!selectedItem) return;
    try {
      // mes_code 는 백엔드가 (model_symbol, process_type_code, serial_no) 에서 자동 부여.
      // 프론트에서 보내지 않음 — 사용자가 손으로 입력 못 함.
      const payload: UpdateItemPayload = {
        item_name: form.item_name || undefined,
        legacy_item_type: form.legacy_item_type || undefined,
        supplier: form.supplier || undefined,
        min_stock: form.min_stock ? Number(form.min_stock) : undefined,
        process_type_code: form.process_type_code || undefined,
        unit: form.unit || undefined,
        model_slots: form.model_slots,
      };
      const updated = await api.updateItem(selectedItem.item_id, payload);
      setItems((current) => current.map((it) => (it.item_id === updated.item_id ? updated : it)));
      setSelectedItem(updated);
      // 백엔드 응답으로 form 갱신 — 새 mes_code 가 폼에 반영되도록.
      // useEffect deps 가 selectedItem.item_id 라 같은 부품 갱신은 발화 안 함 → 명시 호출 필요.
      setFormState(itemToEditForm(updated));
      setDirty(false);
      notifyItemsChanged();
      onStatusChange(`${updated.item_name} 정보를 저장했습니다.`);
      onShowSave?.("저장됐습니다.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "저장에 실패했습니다.");
    }
  }

  async function _saveField(
    field: "item_name" | "spec" | "barcode" | "supplier" | "min_stock" | "unit" | "mes_code" | "process_type_code",
    value: string,
  ): Promise<void> {
    if (!selectedItem) return;
    try {
      const payload = field === "min_stock"
        ? { min_stock: value ? Number(value) : undefined }
        : { [field]: value || undefined };
      const updated = await api.updateItem(selectedItem.item_id, payload);
      setItems((current) => current.map((it) => (it.item_id === updated.item_id ? updated : it)));
      setSelectedItem(updated);
      onStatusChange(`${updated.item_name} 정보를 저장했습니다.`);
      notifyItemsChanged();
      onShowSave?.("저장됐습니다.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "저장에 실패했습니다.");
    }
  }

  async function _updateFull(payload: UpdateItemPayload): Promise<void> {
    if (!selectedItem) return;
    try {
      const updated = await api.updateItem(selectedItem.item_id, payload);
      setItems((current) => current.map((it) => (it.item_id === updated.item_id ? updated : it)));
      setSelectedItem(updated);
      onStatusChange(`${updated.item_name} 정보를 저장했습니다.`);
      notifyItemsChanged();
      onShowSave?.("저장됐습니다.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "저장에 실패했습니다.");
    }
  }

  return {
    form,
    setForm,
    dirty,
    save,
    saveField: (f, v) => void _saveField(f, v),
    updateFull: (p) => void _updateFull(p),
  };
}
