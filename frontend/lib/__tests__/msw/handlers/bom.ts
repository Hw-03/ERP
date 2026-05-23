import { http, HttpResponse } from "msw";
import type { BOMDetailEntry, BOMEntry, BOMTreeNode } from "@/lib/api/types/catalog";

const sampleBomList: BOMDetailEntry[] = [
  {
    bom_id: "bom-1",
    parent_item_id: "parent-1",
    parent_item_name: "완제품A",
    parent_item_code: "FA-001",
    child_item_id: "child-1",
    child_item_name: "부품X",
    child_item_code: "PX-001",
    quantity: 2,
    unit: "EA",
  },
  {
    bom_id: "bom-2",
    parent_item_id: "parent-1",
    parent_item_name: "완제품A",
    parent_item_code: "FA-001",
    child_item_id: "child-2",
    child_item_name: "부품Y",
    child_item_code: "PY-002",
    quantity: 1,
    unit: "EA",
  },
];

const sampleBomEntry: BOMEntry = {
  bom_id: "bom-1",
  parent_item_id: "parent-1",
  child_item_id: "child-1",
  quantity: 2,
  unit: "EA",
  notes: null,
};

const sampleBomTree: BOMTreeNode = {
  item_id: "parent-1",
  item_code: "FA-001",
  item_name: "완제품A",
  process_type_code: "AF",
  unit: "EA",
  required_quantity: 1,
  current_stock: 5,
  children: [
    {
      item_id: "child-1",
      item_code: "PX-001",
      item_name: "부품X",
      process_type_code: "TR",
      unit: "EA",
      required_quantity: 2,
      current_stock: 10,
      children: [],
    },
  ],
};

export const bomHandlers = [
  http.get("*/api/bom", () => HttpResponse.json(sampleBomList)),

  http.get("*/api/bom/:parentId/tree", ({ params }) => {
    if (params.parentId === "parent-1") return HttpResponse.json(sampleBomTree);
    return HttpResponse.json({ detail: "Not found" }, { status: 404 });
  }),

  http.get("*/api/bom/where-used/:itemId", () =>
    HttpResponse.json(sampleBomList),
  ),

  http.get("*/api/bom/:parentId", ({ params }) => {
    if (params.parentId === "parent-1")
      return HttpResponse.json([sampleBomEntry]);
    return HttpResponse.json([]);
  }),

  http.post("*/api/bom", async ({ request }) => {
    const body = (await request.json()) as {
      parent_item_id: string;
      child_item_id: string;
      quantity: number;
      unit: string;
    };
    return HttpResponse.json(
      {
        bom_id: "bom-new",
        parent_item_id: body.parent_item_id,
        child_item_id: body.child_item_id,
        quantity: body.quantity,
        unit: body.unit,
        notes: null,
      },
      { status: 201 },
    );
  }),

  http.patch("*/api/bom/:bomId", async ({ params, request }) => {
    const body = (await request.json()) as { quantity?: number; unit?: string };
    return HttpResponse.json({
      ...sampleBomEntry,
      bom_id: String(params.bomId),
      ...body,
    });
  }),

  http.delete("*/api/bom/:bomId", () => new HttpResponse(null, { status: 204 })),
];
