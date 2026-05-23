"use client";

// W5: MasterItems 도메인 Commands sub-hook.
// 책임: list-level 명령 — add + addMode/addForm 상태.
// (delete 는 현재 도메인 미지원 — 비활성/비활성화는 saveField/updateFull 로 처리.)

import { useState } from "react";
import type { Item } from "@/lib/api";
import { useCreateItemMutation } from "@/lib/queries/useItemsQuery";
import { EMPTY_ADD_FORM, type AddForm } from "../_admin_sections/adminShared";

export type UseAdminMasterItemsCommandsArgs = {
  setItems: (updater: (prev: Item[]) => Item[]) => void;
  setSelectedItem: (i: Item | null) => void;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
  onShowSave?: (msg: string) => void;
};

export type UseAdminMasterItemsCommandsState = {
  addMode: boolean;
  setAddMode: (v: boolean) => void;
  addForm: AddForm;
  setAddForm: (updater: (f: AddForm) => AddForm) => void;
  add: () => void;
};

export function useAdminMasterItemsCommands({
  setItems,
  setSelectedItem,
  onStatusChange,
  onError,
  onShowSave,
}: UseAdminMasterItemsCommandsArgs): UseAdminMasterItemsCommandsState {
  const [addMode, setAddMode] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(EMPTY_ADD_FORM);
  const createMutation = useCreateItemMutation();

  async function _add(): Promise<void> {
    if (!addForm.item_name.trim()) {
      onError("품목명을 입력하세요.");
      return;
    }
    try {
      const created = await createMutation.mutateAsync({
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

  return {
    addMode,
    setAddMode,
    addForm,
    setAddForm,
    add: () => void _add(),
  };
}
