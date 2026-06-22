"use client";

// W5: MasterItems 도메인 Commands sub-hook.
// 책임: list-level 명령 — add + addMode/addForm 상태 + reorder.
// (delete 는 현재 도메인 미지원 — 비활성/비활성화는 saveField/updateFull 로 처리.)

import { useState } from "react";
import type { Item } from "@/lib/api";
import {
  useCreateItemMutation,
  useReorderItemsMutation,
} from "@/lib/queries/useItemsQuery";
import { itemsApi } from "@/lib/api/items";
import { EMPTY_ADD_FORM, type AddForm } from "../_admin_sections/adminShared";

export type UseAdminMasterItemsCommandsArgs = {
  setItems: (updater: (prev: Item[]) => Item[]) => void;
  setSelectedItem: (i: Item | null) => void;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
  onShowSave?: (msg: string) => void;
  adminPin: string;
};

export type UseAdminMasterItemsCommandsState = {
  addMode: boolean;
  setAddMode: (v: boolean) => void;
  addForm: AddForm;
  setAddForm: (updater: (f: AddForm) => AddForm) => void;
  add: () => void;
  reorder: (ordered: Item[]) => void;
  deleteItem: (itemId: string) => Promise<void>;
  restoreItem: (itemId: string) => Promise<void>;
};

export function useAdminMasterItemsCommands({
  setItems,
  setSelectedItem,
  onStatusChange,
  onError,
  onShowSave,
  adminPin,
}: UseAdminMasterItemsCommandsArgs): UseAdminMasterItemsCommandsState {
  const [addMode, setAddMode] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(EMPTY_ADD_FORM);
  const createMutation = useCreateItemMutation();
  const reorderMutation = useReorderItemsMutation();

  async function _add(): Promise<void> {
    if (!addForm.item_name.trim()) {
      onError("품목명을 입력하세요.");
      return;
    }
    try {
      const allLocs = addForm.initial_locations ?? [];
      const builtLocs = allLocs
        .filter((r) => r.department && Number(r.quantity) > 0 && r.department !== "창고")
        .map((r) => ({ department: r.department, quantity: Number(r.quantity) }));
      const totalQty = allLocs.reduce((s, r) => s + Number(r.quantity || 0), 0);
      const created = await createMutation.mutateAsync({
        item_name: addForm.item_name.trim(),
        process_type_code: addForm.process_type_code || undefined,
        unit: addForm.unit || "EA",
        model_slots: addForm.model_slots.length > 0 ? addForm.model_slots : undefined,
        legacy_item_type: addForm.legacy_item_type || undefined,
        supplier: addForm.supplier || undefined,
        min_stock: addForm.min_stock ? Number(addForm.min_stock) : undefined,
        initial_quantity: totalQty > 0 ? totalQty : undefined,
        initial_locations: builtLocs.length > 0 ? builtLocs : undefined,
      });
      setItems((current) => [created, ...current]);
      setSelectedItem(created);
      setAddMode(false);
      setAddForm(() => EMPTY_ADD_FORM);
      onStatusChange(`'${created.item_name}' 품목이 추가됐습니다. (${created.mes_code})`);
      onShowSave?.(`'${created.item_name}' 품목이 추가됐습니다.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "품목 추가에 실패했습니다.");
    }
  }

  function reorder(ordered: Item[]) {
    const items = ordered.map((it, i) => ({ item_id: it.item_id, display_order: i }));
    // 낙관적 업데이트 — 즉시 새 순서로 보이게.
    // sort_order 는 백엔드 전용 컬럼이라 프론트 Item 타입에 없음 → 순서만 갈아끼움.
    setItems(() => ordered);
    reorderMutation.mutate(
      { items, pin: adminPin },
      {
        onError: (err) =>
          onError(err instanceof Error ? err.message : "품목 순서 저장 실패"),
      },
    );
  }

  async function deleteItem(itemId: string): Promise<void> {
    try {
      const updated = await itemsApi.softDeleteItem(itemId);
      setItems((prev) => prev.map((it) => (it.item_id === itemId ? updated : it)));
      setSelectedItem(updated);
      onStatusChange("품목이 삭제됐습니다. 목록에서 복구할 수 있습니다.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "품목 삭제에 실패했습니다.");
    }
  }

  async function restoreItem(itemId: string): Promise<void> {
    try {
      const updated = await itemsApi.restoreItem(itemId);
      setItems((prev) => prev.map((it) => (it.item_id === itemId ? updated : it)));
      setSelectedItem(updated);
      onStatusChange("품목이 복구됐습니다.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "품목 복구에 실패했습니다.");
    }
  }

  return {
    addMode,
    setAddMode,
    addForm,
    setAddForm,
    add: () => void _add(),
    reorder,
    deleteItem,
    restoreItem,
  };
}
