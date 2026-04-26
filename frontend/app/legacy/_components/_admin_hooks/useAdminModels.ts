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
};

export type AdminModelsState = {
  productModels: ProductModel[];
  modelAddName: string;
  setModelAddName: (v: string) => void;
  modelAddSymbol: string;
  setModelAddSymbol: (v: string) => void;
  addModel: () => void;
  deleteModel: (slot: number) => void;
};

export function useAdminModels({
  productModels,
  setProductModels,
  onStatusChange,
  onError,
}: UseAdminModelsArgs): AdminModelsState {
  const [modelAddName, setModelAddName] = useState("");
  const [modelAddSymbol, setModelAddSymbol] = useState("");

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

  return {
    productModels,
    modelAddName,
    setModelAddName,
    modelAddSymbol,
    setModelAddSymbol,
    addModel: _addModel,
    deleteModel: _deleteModel,
  };
}
