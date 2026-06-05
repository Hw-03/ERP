import { http, HttpResponse } from "msw";
import type { InventoryMutationResponse, InventorySummary } from "@/lib/api/types/inventory";
import type { InventoryLocationRow } from "@/lib/api/types/shared";

const sampleSummary: InventorySummary = {
  process_types: [
    {
      process_type_code: "TR",
      label: "튜브 원자재",
      item_count: 3,
      total_quantity: 150,
      warehouse_qty_sum: 120,
      production_qty_sum: 30,
      defective_qty_sum: 0,
    },
    {
      process_type_code: "AF",
      label: "조립 완제품",
      item_count: 2,
      total_quantity: 50,
      warehouse_qty_sum: 45,
      production_qty_sum: 5,
      defective_qty_sum: 0,
    },
  ],
  total_items: 5,
  total_quantity: 200,
};

const sampleMutationResponse: InventoryMutationResponse = {
  inventory_id: "inv-1",
  item_id: "item-1",
  quantity: 10,
  location: null,
  updated_at: "2026-05-01T09:00:00Z",
};

const sampleLocations: InventoryLocationRow[] = [
  { department: "조립", status: "PRODUCTION", quantity: 10 },
  { department: "고압", status: "PRODUCTION", quantity: 5 },
];

export const inventoryHandlers = [
  http.get("*/api/inventory/summary", () => HttpResponse.json(sampleSummary)),

  http.get("*/api/inventory/locations/:itemId", () =>
    HttpResponse.json(sampleLocations),
  ),

  http.post("*/api/inventory/receive", async ({ request }) => {
    const body = (await request.json()) as { item_id: string };
    return HttpResponse.json({ ...sampleMutationResponse, item_id: body.item_id });
  }),

  http.post("*/api/inventory/adjust", async ({ request }) => {
    const body = (await request.json()) as { item_id: string };
    return HttpResponse.json({ ...sampleMutationResponse, item_id: body.item_id });
  }),

  http.post("*/api/inventory/transfer-to-production", async ({ request }) => {
    const body = (await request.json()) as { item_id: string };
    return HttpResponse.json({ ...sampleMutationResponse, item_id: body.item_id });
  }),

  http.post("*/api/inventory/transfer-to-warehouse", async ({ request }) => {
    const body = (await request.json()) as { item_id: string };
    return HttpResponse.json({ ...sampleMutationResponse, item_id: body.item_id });
  }),

  http.post("*/api/inventory/mark-defective", async ({ request }) => {
    const body = (await request.json()) as { item_id: string };
    return HttpResponse.json({ ...sampleMutationResponse, item_id: body.item_id });
  }),
];
