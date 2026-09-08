/**
 * Catalog 도메인 API — `@/lib/api/catalog`.
 *
 * Round-6 (R6-D6) 분리. 마스터 데이터 관련:
 *   - Models (3 메소드)
 *   - BOM (7 메소드)
 *
 * 총 10 메소드.
 */

import { deleteJson, fetcher, patchJson, postJson, putJson, toApiUrl } from "../api-core";
import type { components } from "./generated/openapi";
import type {
  BOMDetailEntry,
  BOMEntry,
  BOMTreeNode,
  ProductModel,
} from "./types";

type OpenApiBOMTreeNode = components["schemas"]["BOMTreeNode"];

function requireFiniteNumber(value: number | null | undefined, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`BOM tree 응답의 ${field} 값이 없습니다.`);
  }
  return value;
}

/** OpenAPI의 nullable/기본값 표현을 기존 BOM 업무 타입으로 정규화한다. */
function fromOpenApiBOMTreeNode(raw: OpenApiBOMTreeNode): BOMTreeNode {
  return {
    item_id: raw.item_id,
    mes_code: raw.mes_code ?? null,
    item_name: raw.item_name,
    process_type_code: raw.process_type_code ?? null,
    unit: raw.unit,
    required_quantity: raw.required_quantity,
    current_stock: requireFiniteNumber(raw.current_stock, "current_stock"),
    additional_producible_quantity: raw.additional_producible_quantity ?? null,
    production_capacity_ignored: raw.production_capacity_ignored ?? false,
    children: (raw.children ?? []).map(fromOpenApiBOMTreeNode),
  };
}

export const catalogApi = {
  // Models -----------------------------------------------------------------
  getModels: () => fetcher<ProductModel[]>(toApiUrl("/api/models")),

  createModel: (payload: { model_name: string; symbol?: string }) =>
    postJson<ProductModel>(toApiUrl("/api/models"), payload),

  updateModel: (
    slot: number,
    payload: { model_name?: string; symbol?: string; pin: string },
  ) => putJson<ProductModel>(toApiUrl(`/api/models/${slot}`), payload),

  deleteModel: (slot: number, pin: string) =>
    deleteJson<void>(toApiUrl(`/api/models/${slot}`), { pin }),

  reorderModels: (payload: {
    items: { slot: number; display_order: number }[];
    pin: string;
  }) => patchJson<{ ok: boolean }>(toApiUrl("/api/models/reorder"), payload),

  // BOM --------------------------------------------------------------------
  getAllBOM: () => fetcher<BOMDetailEntry[]>(toApiUrl("/api/bom")),
  getBOM: (parentItemId: string) => fetcher<BOMEntry[]>(toApiUrl(`/api/bom/${parentItemId}`)),
  getBOMTree: (parentItemId: string, options?: { departmentOrder?: "desc" }) => {
    const query = options?.departmentOrder ? `?department_order=${options.departmentOrder}` : "";
    return fetcher<OpenApiBOMTreeNode>(
      toApiUrl(`/api/bom/${parentItemId}/tree${query}`),
    ).then(fromOpenApiBOMTreeNode);
  },
  /** 주어진 품목을 자식으로 사용하는 parent BOM 행. 직접 사용처(1단계). */
  getBOMWhereUsed: (itemId: string) =>
    fetcher<BOMDetailEntry[]>(toApiUrl(`/api/bom/where-used/${itemId}`)),

  createBOM: (payload: {
    parent_item_id: string;
    child_item_id: string;
    quantity: number;
    unit: string;
    notes?: string;
  }) => postJson<BOMEntry>(toApiUrl("/api/bom"), payload),

  deleteBOM: (bomId: string) => deleteJson<void>(toApiUrl(`/api/bom/${bomId}`)),

  updateBOM: (bomId: string, payload: { quantity?: number; unit?: string }) =>
    patchJson<BOMEntry>(toApiUrl(`/api/bom/${bomId}`), payload),
};
