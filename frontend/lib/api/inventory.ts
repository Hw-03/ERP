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

import { fetcher, postJson, toApiUrl } from "../api-core";
import type {
  Department,
  InventoryLocationRow,
  InventoryMutationResponse,
  InventorySummary,
} from "./types";

type ShipPackageMutationResponse = {
  message: string;
  package_name: string;
  quantity: number;
  items: {
    item_id: string;
    erp_code: string | null;
    item_name: string;
    quantity: number;
    stock_after: number;
  }[];
};

export const inventoryApi = {
  getInventorySummary: () => fetcher<InventorySummary>(toApiUrl("/api/inventory/summary")),

  receiveInventory: (payload: {
    item_id: string;
    quantity: number;
    location?: string;
    reference_no?: string;
    produced_by?: string;
    notes?: string;
  }) => postJson<InventoryMutationResponse>(toApiUrl("/api/inventory/receive"), payload),

  shipInventory: (payload: {
    item_id: string;
    quantity: number;
    location?: string;
    reference_no?: string;
    produced_by?: string;
    notes?: string;
  }) => postJson<InventoryMutationResponse>(toApiUrl("/api/inventory/ship"), payload),

  shipPackage: (payload: {
    package_id: string;
    quantity: number;
    reference_no?: string;
    produced_by?: string;
    notes?: string;
  }) => postJson<ShipPackageMutationResponse>(toApiUrl("/api/inventory/ship-package"), payload),

  adjustInventory: (payload: {
    item_id: string;
    quantity: number;
    reason: string;
    location?: string;
    reference_no?: string;
    produced_by?: string;
  }) => postJson<InventoryMutationResponse>(toApiUrl("/api/inventory/adjust"), payload),

  transferToProduction: (payload: {
    item_id: string;
    quantity: number;
    department: Department;
    notes?: string;
    reference_no?: string;
    produced_by?: string;
  }) =>
    postJson<InventoryMutationResponse>(
      toApiUrl("/api/inventory/transfer-to-production"),
      payload,
    ),

  transferToWarehouse: (payload: {
    item_id: string;
    quantity: number;
    department: Department;
    notes?: string;
    reference_no?: string;
    produced_by?: string;
  }) =>
    postJson<InventoryMutationResponse>(
      toApiUrl("/api/inventory/transfer-to-warehouse"),
      payload,
    ),

  transferBetweenDepts: (payload: {
    item_id: string;
    quantity: number;
    from_department: Department;
    to_department: Department;
    notes?: string;
    reference_no?: string;
    produced_by?: string;
  }) =>
    postJson<InventoryMutationResponse>(
      toApiUrl("/api/inventory/transfer-between-depts"),
      payload,
    ),

  markDefective: (payload: {
    item_id: string;
    quantity: number;
    source: "warehouse" | "production";
    source_department?: Department;
    target_department: Department;
    reason?: string;
    operator?: string;
  }) =>
    postJson<InventoryMutationResponse>(toApiUrl("/api/inventory/mark-defective"), payload),

  returnToSupplier: (payload: {
    item_id: string;
    quantity: number;
    from_department: Department;
    reference_no?: string;
    notes?: string;
    operator?: string;
  }) =>
    postJson<InventoryMutationResponse>(
      toApiUrl("/api/inventory/return-to-supplier"),
      payload,
    ),

  getItemLocations: (itemId: string) =>
    fetcher<InventoryLocationRow[]>(toApiUrl(`/api/inventory/locations/${itemId}`)),
};
