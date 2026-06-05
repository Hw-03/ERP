/**
 * Items 도메인 API — `@/lib/api/items`.
 *
 * Round-5 (R5-5) 분리. 핵심 CRUD 4개 메소드.
 * 외부 호환을 위해 `frontend/lib/api.ts` 가 spread merge 한다.
 *
 * 새 코드는 다음 중 하나로:
 *   import { itemsApi } from "@/lib/api/items";
 *   import { api } from "@/lib/api";  // ...itemsApi 포함됨 (호환)
 */

import { fetcher, patchJson, postJson, putJson, toApiUrl } from "../api-core";
import type { Item } from "./types";

export const itemsApi = {
  getItems: (
    params?: {
      process_type_code?: string;
      search?: string;
      skip?: number;
      limit?: number;
      legacyPart?: string;
      legacyItemType?: string;
      department?: string;
    },
    opts?: { signal?: AbortSignal },
  ) => {
    const query = new URLSearchParams();
    if (params?.process_type_code) query.set("process_type_code", params.process_type_code);
    if (params?.search) query.set("search", params.search);
    if (params?.skip !== undefined) query.set("skip", String(params.skip));
    if (params?.limit !== undefined) query.set("limit", String(params.limit));
    if (params?.legacyPart) query.set("legacy_part", params.legacyPart);
    if (params?.legacyItemType) query.set("legacy_item_type", params.legacyItemType);
    if (params?.department) query.set("department", params.department);
    return fetcher<Item[]>(toApiUrl(`/api/items?${query}`), opts?.signal);
  },

  getItem: (itemId: string) => fetcher<Item>(toApiUrl(`/api/items/${itemId}`)),

  createItem: async (payload: {
    item_name: string;
    process_type_code?: string;
    unit?: string;
    legacy_item_type?: string;
    supplier?: string;
    min_stock?: number;
    initial_quantity?: number;
    model_slots?: number[];
  }) => postJson<Item>(toApiUrl("/api/items"), payload),

  updateItem: async (
    itemId: string,
    payload: {
      item_name?: string;
      process_type_code?: string;
      unit?: string;
      legacy_part?: string;
      legacy_item_type?: string;
      supplier?: string;
      min_stock?: number;
      mes_code?: string;
      model_slots?: number[];
    },
  ) => putJson<Item>(toApiUrl(`/api/items/${itemId}`), payload),

  /** BOM 완료 상태 토글 — 사용자가 명시적으로 "완료로 표시"/"완료 해제"를 누를 때만 호출. */
  updateBomCompletion: async (itemId: string, completed: boolean) =>
    patchJson<Item>(toApiUrl(`/api/items/${itemId}/bom-completion`), { completed }),

  softDeleteItem: (itemId: string) =>
    patchJson<Item>(toApiUrl(`/api/items/${itemId}/soft-delete`), {}),

  restoreItem: (itemId: string) =>
    patchJson<Item>(toApiUrl(`/api/items/${itemId}/restore`), {}),

  reorderItems: (payload: {
    items: { item_id: string; display_order: number }[];
    pin: string;
  }) => patchJson<{ ok: boolean }>(toApiUrl("/api/items/reorder"), payload),
};
