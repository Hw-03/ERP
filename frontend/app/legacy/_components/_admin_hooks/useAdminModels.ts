"use client";

// AdminModelsSection 전용 wrapper hook.
// W5: List/Form/Commands 3-hook 으로 분해 후 호환 표면 유지.

import type { ProductModel } from "@/lib/api";
import { useAdminModelsList } from "./useAdminModelsList";
import { useAdminModelsForm } from "./useAdminModelsForm";
import { useAdminModelsCommands } from "./useAdminModelsCommands";

export type { ModelEditForm } from "./useAdminModelsForm";

export type UseAdminModelsArgs = {
  productModels: ProductModel[];
  setProductModels: (updater: (prev: ProductModel[]) => ProductModel[]) => void;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
  adminPin: string;
};

export type AdminModelsState = {
  productModels: ProductModel[];
  modelAddName: string;
  setModelAddName: (v: string) => void;
  modelAddSymbol: string;
  setModelAddSymbol: (v: string) => void;
  addModel: () => void;
  deleteModel: (slot: number) => void;
  // 인라인 편집
  editForm: import("./useAdminModelsForm").ModelEditForm;
  setEditForm: (
    updater: (prev: import("./useAdminModelsForm").ModelEditForm) => import("./useAdminModelsForm").ModelEditForm,
  ) => void;
  editDirty: boolean;
  editSaving: boolean;
  initEditForm: (model: ProductModel) => void;
  saveModel: (slot: number) => void;
  reorderModels: (ordered: ProductModel[]) => void;
};

export function useAdminModels({
  productModels,
  setProductModels,
  onStatusChange,
  onError,
  adminPin,
}: UseAdminModelsArgs): AdminModelsState {
  const list = useAdminModelsList({ productModels });
  const form = useAdminModelsForm({ setProductModels, onStatusChange, onError, adminPin });
  const commands = useAdminModelsCommands({
    productModels,
    setProductModels,
    onStatusChange,
    onError,
    adminPin,
  });

  return {
    productModels: list.items,
    modelAddName: commands.modelAddName,
    setModelAddName: commands.setModelAddName,
    modelAddSymbol: commands.modelAddSymbol,
    setModelAddSymbol: commands.setModelAddSymbol,
    addModel: commands.add,
    deleteModel: commands.delete,
    editForm: form.form,
    setEditForm: form.setForm,
    editDirty: form.dirty,
    editSaving: form.saving,
    initEditForm: form.initForm,
    saveModel: form.save,
    reorderModels: commands.reorder,
  };
}
