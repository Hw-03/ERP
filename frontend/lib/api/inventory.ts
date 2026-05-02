/**
 * Inventory 도메인 API — `@/lib/api/inventory`.
 *
 * Round-6 (R6-D1) 분리. 11개 메소드:
 *   - getInventorySummary
 *   - receiveInventory / shipInventory / shipPackage
 *   - adjustInventory
 *   - transferToProduction / transferToWarehouse / transferBetweenDepts
 *   - markDefective / returnToSupplier
 *   - getItemLocations
 *
 * 외부 호환을 위해 `frontend/lib/api.ts` 가 spread merge 한다.
 */

import { fetcher, parseError, toApiUrl } from "../api-core";
import type {
  Department,
  InventoryLocationRow,
  InventoryMutationResponse,
  InventorySummary,
} from "./types";

export const inventoryApi = {
  getInventorySummary: () => fetcher<InventorySummary>(toApiUrl("/api/inventory/summary")),

  receiveInventory: async (payload: {
    item_id: string;
    quantity: number;
    location?: string;
    reference_no?: string;
    produced_by?: string;
    notes?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/inventory/receive"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<InventoryMutationResponse>;
  },

  shipInventory: async (payload: {
    item_id: string;
    quantity: number;
    location?: string;
    reference_no?: string;
    produced_by?: string;
    notes?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/inventory/ship"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<InventoryMutationResponse>;
  },

  shipPackage: async (payload: {
    package_id: string;
    quantity: number;
    reference_no?: string;
    produced_by?: string;
    notes?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/inventory/ship-package"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<{
      message: string;
      package_name: string;
      quantity: number;
      items: { item_id: string; erp_code: string | null; item_name: string; quantity: number; stock_after: number }[];
    }>;
  },

  adjustInventory: async (payload: {
    item_id: string;
    quantity: number;
    reason: string;
    location?: string;
    reference_no?: string;
    produced_by?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/inventory/adjust"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<InventoryMutationResponse>;
  },

  transferToProduction: async (payload: {
    item_id: string;
    quantity: number;
    department: Department;
    notes?: string;
    reference_no?: string;
    produced_by?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/inventory/transfer-to-production"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<InventoryMutationResponse>;
  },

  transferToWarehouse: async (payload: {
    item_id: string;
    quantity: number;
    department: Department;
    notes?: string;
    reference_no?: string;
    produced_by?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/inventory/transfer-to-warehouse"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<InventoryMutationResponse>;
  },

  transferBetweenDepts: async (payload: {
    item_id: string;
    quantity: number;
    from_department: Department;
    to_department: Department;
    notes?: string;
    reference_no?: string;
    produced_by?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/inventory/transfer-between-depts"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<InventoryMutationResponse>;
  },

  markDefective: async (payload: {
    item_id: string;
    quantity: number;
    source: "warehouse" | "production";
    source_department?: Department;
    target_department: Department;
    reason?: string;
    operator?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/inventory/mark-defective"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<InventoryMutationResponse>;
  },

  returnToSupplier: async (payload: {
    item_id: string;
    quantity: number;
    from_department: Department;
    reference_no?: string;
    notes?: string;
    operator?: string;
  }) => {
    const res = await fetch(toApiUrl("/api/inventory/return-to-supplier"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json() as Promise<InventoryMutationResponse>;
  },

  getItemLocations: (itemId: string) =>
    fetcher<InventoryLocationRow[]>(toApiUrl(`/api/inventory/locations/${itemId}`)),
};
