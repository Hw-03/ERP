/**
 * Catalog 도메인 API — `@/lib/api/catalog`.
 *
 * Round-6 (R6-D6) 분리. 마스터 데이터 관련:
 *   - Models (3 메소드)
 *   - ShipPackages (6 메소드)
 *   - BOM (7 메소드)
 *
 * 총 16 메소드.
 */

import { deleteJson, fetcher, patchJson, postJson, putJson, toApiUrl } from "../api-core";
import type {
  BOMDetailEntry,
  BOMEntry,
  BOMTreeNode,
  ProductModel,
  ShipPackage,
} from "./types";

export const catalogApi = {
  // Models -----------------------------------------------------------------
  getModels: () => fetcher<ProductModel[]>(toApiUrl("/api/models")),

  createModel: (payload: { model_name: string; symbol?: string }) =>
    postJson<ProductModel>(toApiUrl("/api/models"), payload),

  deleteModel: (slot: number) => deleteJson<void>(toApiUrl(`/api/models/${slot}`)),

  // Ship packages ----------------------------------------------------------
  getShipPackages: () => fetcher<ShipPackage[]>(toApiUrl("/api/ship-packages")),

  createShipPackage: (payload: { package_code: string; name: string; notes?: string }) =>
    postJson<ShipPackage>(toApiUrl("/api/ship-packages"), payload),

  updateShipPackage: (packageId: string, payload: { name?: string; notes?: string }) =>
    putJson<ShipPackage>(toApiUrl(`/api/ship-packages/${packageId}`), payload),

  deleteShipPackage: (packageId: string) =>
    deleteJson<void>(toApiUrl(`/api/ship-packages/${packageId}`)),

  addShipPackageItem: (packageId: string, payload: { item_id: string; quantity: number }) =>
    postJson<ShipPackage>(toApiUrl(`/api/ship-packages/${packageId}/items`), payload),

  deleteShipPackageItem: (packageId: string, packageItemId: string) =>
    deleteJson<ShipPackage>(
      toApiUrl(`/api/ship-packages/${packageId}/items/${packageItemId}`),
    ),

  // BOM --------------------------------------------------------------------
  getAllBOM: () => fetcher<BOMDetailEntry[]>(toApiUrl("/api/bom")),
  getBOM: (parentItemId: string) => fetcher<BOMEntry[]>(toApiUrl(`/api/bom/${parentItemId}`)),
  getBOMTree: (parentItemId: string) =>
    fetcher<BOMTreeNode>(toApiUrl(`/api/bom/${parentItemId}/tree`)),
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
