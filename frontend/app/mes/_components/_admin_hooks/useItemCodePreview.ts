"use client";

import { useCallback, useEffect, useState } from "react";
import { itemsApi } from "@/lib/api/items";

export type ItemCodePreview = {
  code?: string;
  status: "idle" | "loading" | "ready" | "error";
  retry: () => void;
};

/** Keep the reviewed code tied to this exact selection; ignore older reads after selection changes. */
export function useItemCodePreview(processType: string, modelSlots: number[], itemId?: string, enabled = true): ItemCodePreview {
  const key = enabled && processType && modelSlots.length
    ? JSON.stringify({ process_type_code: processType, model_slots: modelSlots, item_id: itemId }) : "";
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; status: ItemCodePreview["status"]; code?: string }>({ key: "", status: "idle" });
  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    setState({ key, status: "loading" });
    void itemsApi.getItemCodePreview(JSON.parse(key), controller.signal).then((result) => {
      if (!controller.signal.aborted) setState({ key, status: "ready", code: result.mes_code });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ key, status: "error" });
    });
    return () => controller.abort();
  }, [key, attempt]);

  if (!key) return { status: "idle", retry };
  return state.key === key ? { code: state.code, status: state.status, retry } : { status: "loading", retry };
}
