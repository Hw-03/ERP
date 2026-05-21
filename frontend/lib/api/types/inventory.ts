/**
 * Inventory 도메인 타입 — `@/lib/api/types/inventory`.
 * Round-10A (#2) 본문 이전.
 */

import type { ProcessTypeSummary } from "./shared";

export interface InventorySummary {
  process_types: ProcessTypeSummary[];
  total_items: number;
  total_quantity: number;
}

export interface InventoryMutationResponse {
  inventory_id: string;
  item_id: string;
  quantity: string;
  location: string | null;
  updated_at: string;
}
