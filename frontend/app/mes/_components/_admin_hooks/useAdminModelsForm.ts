"use client";

// W5: Models 도메인 Form sub-hook.
// 책임: 단일 모델 인라인 편집 상태 (editForm + dirty + save).

import { useRef, useState } from "react";
import type { ProductModel } from "@/lib/api";
import { useUpdateModelMutation } from "@/lib/queries/useModelsQuery";
import { useAdminSave } from "./useAdminSave";

export type ModelEditForm = {
  model_name: string;
  symbol: string;
};

export type UseAdminModelsFormArgs = {
  setProductModels: (updater: (prev: ProductModel[]) => ProductModel[]) => void;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
  adminPin: string;
};

export type UseAdminModelsFormState = {
  form: ModelEditForm;
  setForm: (updater: (prev: ModelEditForm) => ModelEditForm) => void;
  dirty: boolean;
  saving: boolean;
  initForm: (model: ProductModel) => void;
  save: (slot: number) => Promise<void>;
};

const EMPTY: ModelEditForm = { model_name: "", symbol: "" };

export function useAdminModelsForm({
  setProductModels,
  onStatusChange,
  onError,
  adminPin,
}: UseAdminModelsFormArgs): UseAdminModelsFormState {
  const [form, setForm] = useState<ModelEditForm>(EMPTY);
  const [base, setBase] = useState<ModelEditForm>(EMPTY);
  const saveTask = useAdminSave();
  const selectedSlot = useRef<number | null>(null);

  const updateModelMutation = useUpdateModelMutation();

  const dirty =
    form.model_name !== base.model_name || form.symbol !== base.symbol;

  function initForm(model: ProductModel) {
    selectedSlot.current = model.slot;
    const next: ModelEditForm = {
      model_name: model.model_name ?? "",
      symbol: model.symbol ?? "",
    };
    setForm(next);
    setBase(next);
  }

  async function save(slot: number): Promise<void> {
    if (!form.model_name.trim()) {
      onError("모델명을 입력하세요.");
      throw new Error("모델명을 입력하세요.");
    }
    try {
      const updated = await updateModelMutation.mutateAsync({
        slot,
        payload: {
          model_name: form.model_name.trim(),
          symbol: form.symbol.trim() || undefined,
          pin: adminPin,
        },
      });
      setProductModels((prev) => prev.map((m) => (m.slot === slot ? updated : m)));
      const saved = { model_name: updated.model_name ?? "", symbol: updated.symbol ?? "" };
      if (selectedSlot.current === slot) {
        setForm(saved);
        setBase(saved);
      }
      onStatusChange(`'${updated.model_name}' 모델을 저장했습니다.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "저장 실패");
      throw error;
    }
  }

  return { form, setForm, dirty, saving: saveTask.saving, initForm, save: (slot) => saveTask.run(() => save(slot)) };
}
