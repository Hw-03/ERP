"use client";

// W5: Models 도메인 Form sub-hook.
// 책임: 단일 모델 인라인 편집 상태 (editForm + dirty + save).

import { useState } from "react";
import type { ProductModel } from "@/lib/api";
import { useUpdateModelMutation } from "@/lib/queries/useModelsQuery";

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
  save: (slot: number) => void;
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
  const [saving, setSaving] = useState(false);

  const updateModelMutation = useUpdateModelMutation();

  const dirty =
    form.model_name !== base.model_name || form.symbol !== base.symbol;

  function initForm(model: ProductModel) {
    const next: ModelEditForm = {
      model_name: model.model_name ?? "",
      symbol: model.symbol ?? "",
    };
    setForm(next);
    setBase(next);
  }

  function save(slot: number) {
    if (!form.model_name.trim()) {
      onError("모델명을 입력하세요.");
      return;
    }
    setSaving(true);
    updateModelMutation.mutate(
      {
        slot,
        payload: {
          model_name: form.model_name.trim(),
          symbol: form.symbol.trim() || undefined,
          pin: adminPin,
        },
      },
      {
        onSuccess: (updated) => {
          setProductModels((prev) => prev.map((m) => (m.slot === slot ? updated : m)));
          setBase({
            model_name: updated.model_name ?? "",
            symbol: updated.symbol ?? "",
          });
          onStatusChange(`'${updated.model_name}' 모델을 저장했습니다.`);
        },
        onError: (err) => onError(err instanceof Error ? err.message : "저장 실패"),
        onSettled: () => setSaving(false),
      },
    );
  }

  return { form, setForm, dirty, saving, initForm, save };
}
