"use client";

// W5: Models 도메인 Commands sub-hook.
// 책임: list-level mutation — add / delete / reorder + 추가 form state.

import { useRef, useState } from "react";
import type { ProductModel } from "@/lib/api";
import {
  useCreateModelMutation,
  useDeleteModelMutation,
  useReorderModelsMutation,
} from "@/lib/queries/useModelsQuery";

export type UseAdminModelsCommandsArgs = {
  productModels: ProductModel[];
  setProductModels: (updater: (prev: ProductModel[]) => ProductModel[]) => void;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
  adminPin: string;
};

export type UseAdminModelsCommandsState = {
  modelAddName: string;
  setModelAddName: (v: string) => void;
  modelAddSymbol: string;
  setModelAddSymbol: (v: string) => void;
  add: () => void;
  delete: (slot: number, onSuccess?: () => void) => void;
  deletingSlot: number | null;
  reorder: (ordered: ProductModel[]) => void;
};

export function useAdminModelsCommands({
  productModels,
  setProductModels,
  onStatusChange,
  onError,
  adminPin,
}: UseAdminModelsCommandsArgs): UseAdminModelsCommandsState {
  const [modelAddName, setModelAddName] = useState("");
  const [modelAddSymbol, setModelAddSymbol] = useState("");
  const [deletingSlot, setDeletingSlot] = useState<number | null>(null);
  const deletingSlotRef = useRef<number | null>(null);

  const createModelMutation = useCreateModelMutation();
  const deleteModelMutation = useDeleteModelMutation();
  const reorderModelsMutation = useReorderModelsMutation();

  function add() {
    if (!modelAddName.trim()) return;
    createModelMutation.mutate(
      { model_name: modelAddName.trim(), symbol: modelAddSymbol.trim() || undefined },
      {
        onSuccess: (created) => {
          setProductModels((prev) => [...prev, created]);
          setModelAddName("");
          setModelAddSymbol("");
          onStatusChange(`'${created.model_name}' 모델을 추가했습니다.`);
        },
        onError: (err) => onError(err instanceof Error ? err.message : "모델 추가 실패"),
      },
    );
  }

  function deleteCmd(slot: number, afterSuccess?: () => void) {
    if (deletingSlotRef.current !== null) return;
    const model = productModels.find((m) => m.slot === slot);
    if (!model) return;
    deletingSlotRef.current = slot;
    setDeletingSlot(slot);
    const finishDelete = () => {
      deletingSlotRef.current = null;
      setDeletingSlot(null);
    };
    deleteModelMutation.mutate(
      { slot, pin: adminPin },
      {
        onSuccess: () => {
          setProductModels((prev) => prev.filter((m) => m.slot !== slot));
          onStatusChange(`'${model.model_name}' 모델을 삭제했습니다.`);
          finishDelete();
          afterSuccess?.();
        },
        onError: (err) => {
          finishDelete();
          onError(err instanceof Error ? err.message : "삭제 실패");
        },
      },
    );
  }

  function reorder(ordered: ProductModel[]) {
    const items = ordered.map((m, i) => ({ slot: m.slot, display_order: i }));
    const reindexed = ordered.map((m, i) => ({ ...m, display_order: i }));
    setProductModels(() => reindexed);
    reorderModelsMutation.mutate(
      { items, pin: adminPin },
      {
        onError: (err) =>
          onError(err instanceof Error ? err.message : "모델 순서 저장 실패"),
      },
    );
  }

  return {
    modelAddName,
    setModelAddName,
    modelAddSymbol,
    setModelAddSymbol,
    add,
    delete: deleteCmd,
    deletingSlot,
    reorder,
  };
}
