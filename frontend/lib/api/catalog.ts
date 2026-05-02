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

import { fetcher, parseError, toApiUrl } from "../api-core";
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

  createModel: async (payload: { model_name: string; symbol?: string }) => {
    const res = await fetch(toApiUrl("/api/models"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<ProductModel>;
  },

  deleteModel: async (slot: number) => {
    const res = await fetch(toApiUrl(`/api/models/${slot}`), { method: "DELETE" });
    if (!res.ok) throw new Error(await parseError(res));
  },

  // Ship packages ----------------------------------------------------------
  getShipPackages: () => fetcher<ShipPackage[]>(toApiUrl("/api/ship-packages")),

  createShipPackage: async (payload: { package_code: string; name: string; notes?: string }) => {
    const res = await fetch(toApiUrl("/api/ship-packages"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<ShipPackage>;
  },

  updateShipPackage: async (packageId: string, payload: { name?: string; notes?: string }) => {
    const res = await fetch(toApiUrl(`/api/ship-packages/${packageId}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<ShipPackage>;
  },

  deleteShipPackage: async (packageId: string) => {
    const res = await fetch(toApiUrl(`/api/ship-packages/${packageId}`), { method: "DELETE" });
    if (!res.ok) throw new Error(await parseError(res));
  },

  addShipPackageItem: async (packageId: string, payload: { item_id: string; quantity: number }) => {
    const res = await fetch(toApiUrl(`/api/ship-packages/${packageId}/items`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<ShipPackage>;
  },

  deleteShipPackageItem: async (packageId: string, packageItemId: string) => {
    const res = await fetch(toApiUrl(`/api/ship-packages/${packageId}/items/${packageItemId}`), {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<ShipPackage>;
  },

  // BOM --------------------------------------------------------------------
  getAllBOM: () => fetcher<BOMDetailEntry[]>(toApiUrl("/api/bom")),
  getBOM: (parentItemId: string) => fetcher<BOMEntry[]>(toApiUrl(`/api/bom/${parentItemId}`)),
  getBOMTree: (parentItemId: string) =>
    fetcher<BOMTreeNode>(toApiUrl(`/api/bom/${parentItemId}/tree`)),
  /** 주어진 품목을 자식으로 사용하는 parent BOM 행. 직접 사용처(1단계). */
  getBOMWhereUsed: (itemId: string) =>
    fetcher<BOMDetailEntry[]>(toApiUrl(`/api/bom/where-used/${itemId}`)),

  createBOM: async (payload: {
    parent_item_id: string;
    child_item_id: string;
    quantity: number;
    unit: string;
    notes?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/bom"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<BOMEntry>;
  },

  deleteBOM: async (bomId: string) => {
    const res = await fetch(toApiUrl(`/api/bom/${bomId}`), { method: "DELETE" });
    if (!res.ok) throw new Error(await parseError(res));
  },

  updateBOM: async (bomId: string, payload: { quantity?: number; unit?: string }) => {
    const res = await fetch(toApiUrl(`/api/bom/${bomId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<BOMEntry>;
  },
};
