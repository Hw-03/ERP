"use client";

// W5: MasterItems 도메인 Form sub-hook.
// 책임: 단일 품목 편집 폼 (editForm + dirty + save).
// + 필드 단위 즉시 저장 (saveItemField / updateItemFull) 도 form 책임 — 선택된 품목의 변경 작업.

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Item } from "@/lib/api";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queries/keys";
import {
  normalizeStandardPurchasePrice,
  validateStockPurchaseValues,
} from "./itemStockPurchaseValidation";

export type ItemEditForm = {
  item_name: string;
  legacy_item_type: string;
  supplier: string;
  supplier_item_code: string;
  standard_purchase_price: string;
  purchase_price_effective_date: string;
  min_stock: string;
  reorder_point: string;
  procurement_lead_time_days: string;
  minimum_order_quantity: string;
  purchase_memo: string;
  process_type_code: string;
  unit: string;
  model_slots: number[];
  bom_stock_exempt: boolean;
  sales_review_required: boolean;
  mes_code: string;
};

export const EMPTY_ITEM_EDIT_FORM: ItemEditForm = {
  item_name: "",
  legacy_item_type: "",
  supplier: "",
  supplier_item_code: "",
  standard_purchase_price: "",
  purchase_price_effective_date: "",
  min_stock: "",
  reorder_point: "",
  procurement_lead_time_days: "",
  minimum_order_quantity: "",
  purchase_memo: "",
  process_type_code: "TR",
  unit: "EA",
  model_slots: [],
  bom_stock_exempt: false,
  sales_review_required: false,
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
    supplier_item_code: item.supplier_item_code ?? "",
    standard_purchase_price: item.standard_purchase_price ?? "",
    purchase_price_effective_date: item.purchase_price_effective_date ?? "",
    min_stock: item.min_stock != null ? String(Math.round(Number(item.min_stock))) : "",
    reorder_point: item.reorder_point != null ? String(Math.round(Number(item.reorder_point))) : "",
    procurement_lead_time_days: item.procurement_lead_time_days != null ? String(Math.round(Number(item.procurement_lead_time_days))) : "",
    minimum_order_quantity: item.minimum_order_quantity != null ? String(Math.round(Number(item.minimum_order_quantity))) : "",
    purchase_memo: item.purchase_memo ?? "",
    process_type_code: item.process_type_code ?? "TR",
    unit: item.unit ?? "EA",
    model_slots: savedSlots.length > 0 ? savedSlots : inferModelSlots(mesCode),
    bom_stock_exempt: item.bom_stock_exempt ?? false,
    sales_review_required: item.sales_review_required ?? false,
    mes_code: mesCode,
  };
}

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
  const queryClient = useQueryClient();
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

  useEffect(() => {
    if (!selectedItem || dirty) return;
    setFormState(itemToEditForm(selectedItem));
  }, [selectedItem, dirty]);

  function setForm(updater: (prev: ItemEditForm) => ItemEditForm) {
    setFormState(updater);
    setDirty(true);
  }

  async function save(): Promise<void> {
    if (!selectedItem) return;
    const stockPurchaseError = validateStockPurchaseValues(form);
    if (stockPurchaseError) {
      onError(stockPurchaseError);
      return;
    }
    const standardPurchasePrice = normalizeStandardPurchasePrice(form.standard_purchase_price);
    try {
      // mes_code 는 백엔드가 (model_symbol, process_type_code, serial_no) 에서 자동 부여.
      // 프론트에서 보내지 않음 — 사용자가 손으로 입력 못 함.
      const payload: UpdateItemPayload = {
        item_name: form.item_name || undefined,
        legacy_item_type: form.legacy_item_type || undefined,
        supplier: form.supplier.trim() || null,
        supplier_item_code: form.supplier_item_code.trim() || null,
        standard_purchase_price: standardPurchasePrice || null,
        purchase_price_effective_date: form.purchase_price_effective_date || null,
        min_stock: form.min_stock === "" ? null : Number(form.min_stock),
        reorder_point: form.reorder_point === "" ? null : Number(form.reorder_point),
        procurement_lead_time_days: form.procurement_lead_time_days === "" ? null : Number(form.procurement_lead_time_days),
        minimum_order_quantity: form.minimum_order_quantity === "" ? null : Number(form.minimum_order_quantity),
        purchase_memo: form.purchase_memo.trim() || null,
        process_type_code: form.process_type_code || undefined,
        unit: form.unit || undefined,
        model_slots: form.model_slots,
        bom_stock_exempt: form.bom_stock_exempt,
        sales_review_required: form.sales_review_required,
      };
      const updated = await api.updateItem(selectedItem.item_id, payload);
      setItems((current) => current.map((it) => (it.item_id === updated.item_id ? updated : it)));
      setSelectedItem(updated);
      // 백엔드 응답으로 form 갱신 — 새 mes_code 가 폼에 반영되도록.
      // useEffect deps 가 selectedItem.item_id 라 같은 부품 갱신은 발화 안 함 → 명시 호출 필요.
      setFormState(itemToEditForm(updated));
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.items.all });
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.items.all });
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.items.all });
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
