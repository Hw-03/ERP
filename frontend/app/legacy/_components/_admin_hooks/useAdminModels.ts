"use client";

// AdminModelsSection 전용 hook.

import { useState } from "react";
import type { ProductModel } from "@/lib/api";
import { api } from "@/lib/api";

export type UseAdminModelsArgs = {
  productModels: ProductModel[];
  setProductModels: (updater: (prev: ProductModel[]) => ProductModel[]) => void;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
  adminPin: string;
};

export type ModelEditForm = {
  model_name: string;
  symbol: string;
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
  editForm: ModelEditForm;
  setEditForm: (updater: (prev: ModelEditForm) => ModelEditForm) => void;
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
  const [modelAddName, setModelAddName] = useState("");
  const [modelAddSymbol, setModelAddSymbol] = useState("");

  // 인라인 편집 상태
  const [editForm, setEditForm] = useState<ModelEditForm>({ model_name: "", symbol: "" });
  const [editBase, setEditBase] = useState<ModelEditForm>({ model_name: "", symbol: "" });
  const [editSaving, setEditSaving] = useState(false);

  const editDirty =
    editForm.model_name !== editBase.model_name || editForm.symbol !== editBase.symbol;

  function initEditForm(model: ProductModel) {
    const base = { model_name: model.model_name ?? "", symbol: model.symbol ?? "" };
    setEditForm(base);
    setEditBase(base);
  }

  function _saveModel(slot: number) {
    if (!editForm.model_name.trim()) {
      onError("모델명을 입력하세요.");
      return;
    }
    setEditSaving(true);
    void api
      .updateModel(slot, {
        model_name: editForm.model_name.trim(),
        symbol: editForm.symbol.trim() || undefined,
        pin: adminPin,
      })
      .then((updated) => {
        setProductModels((prev) => prev.map((m) => (m.slot === slot ? updated : m)));
        setEditBase({ model_name: updated.model_name ?? "", symbol: updated.symbol ?? "" });
        onStatusChange(`'${updated.model_name}' 모델을 저장했습니다.`);
      })
      .catch((err) => onError(err instanceof Error ? err.message : "저장 실패"))
      .finally(() => setEditSaving(false));
  }

  function _addModel() {
    if (!modelAddName.trim()) return;
    void api
      .createModel({ model_name: modelAddName.trim(), symbol: modelAddSymbol.trim() || undefined })
      .then((created) => {
        setProductModels((prev) => [...prev, created]);
        setModelAddName("");
        setModelAddSymbol("");
        onStatusChange(`'${created.model_name}' 모델을 추가했습니다.`);
      })
      .catch((err) => onError(err instanceof Error ? err.message : "모델 추가 실패"));
  }

  function _deleteModel(slot: number) {
    const model = productModels.find((m) => m.slot === slot);
    if (!model) return;
    if (
      !confirm(
        `'${model.model_name}' 모델을 삭제하시겠습니까?\n이 모델을 사용하는 품목이 있으면 삭제되지 않습니다.`,
      )
    ) {
      return;
    }
    void api
      .deleteModel(slot)
      .then(() => {
        setProductModels((prev) => prev.filter((m) => m.slot !== slot));
        onStatusChange(`'${model.model_name}' 모델을 삭제했습니다.`);
      })
      .catch((err) => onError(err instanceof Error ? err.message : "삭제 실패"));
  }

  function _reorderModels(ordered: ProductModel[]) {
    // 부서 reorder 패턴 복제 — 새 순서를 즉시 로컬에 반영 후 백엔드 저장.
    const items = ordered.map((m, i) => ({ slot: m.slot, display_order: i }));
    const reindexed = ordered.map((m, i) => ({ ...m, display_order: i }));
    setProductModels(() => reindexed);
    void api
      .reorderModels({ items, pin: adminPin })
      .catch((err) =>
        onError(err instanceof Error ? err.message : "모델 순서 저장 실패"),
      );
  }

  return {
    productModels,
    modelAddName,
    setModelAddName,
    modelAddSymbol,
    setModelAddSymbol,
    addModel: _addModel,
    deleteModel: _deleteModel,
    editForm,
    setEditForm,
    editDirty,
    editSaving,
    initEditForm,
    saveModel: _saveModel,
    reorderModels: _reorderModels,
  };
}
