import { describe, expect, it } from "vitest";
import type { Item, ProductModel } from "../../_warehouse_v2/types";
import type { DefectLocation } from "@/lib/api/types/defects";
import { filterDefectLocations } from "../defectCategoryFilter";

function location(overrides: Partial<DefectLocation>): DefectLocation {
  return {
    record_id: "record-1",
    item_id: "item-1",
    item_name: "품목",
    mes_code: "3-AR-0001",
    department: "조립",
    quantity: 1,
    original_quantity: 1,
    pending_quantity: 0,
    available_quantity: 1,
    defective_at: "2026-09-04T00:00:00+09:00",
    is_legacy: false,
    legacy_origin: null,
    has_bom: false,
    ...overrides,
  };
}

function item(overrides: Partial<Item>): Item {
  return {
    item_id: "item-1",
    model_slots: [1],
    process_type_code: "AR",
    ...overrides,
  } as Item;
}

const models: ProductModel[] = [
  { slot: 1, model_name: "DX3000", symbol: "3", is_reserved: false },
  { slot: 2, model_name: "SOLO", symbol: "8", is_reserved: false },
];

describe("filterDefectLocations", () => {
  it("narrows to disused items and intersects their selected process stage", () => {
    const locations = [location({ item_id: "normal" }), location({ item_id: "disused" })];
    const items = [item({ item_id: "normal" }), item({ item_id: "disused", legacy_item_type: "불용" })];
    expect(filterDefectLocations(locations, items, models, { departments: [], models: [], processSteps: ["DISUSED"] })).toEqual([locations[1]]);
    expect(filterDefectLocations(locations, items, models, { departments: [], models: [], processSteps: ["DISUSED", "F"] })).toEqual([]);
    expect(filterDefectLocations(locations, items, models, { departments: [], models: [], processSteps: [] })).toEqual(locations);
  });
  it("uses OR inside a category and AND between department, model, and process categories", () => {
    const locations = [
      location({ record_id: "dx-assembly", item_id: "dx", department: "조립" }),
      location({ record_id: "solo-vacuum", item_id: "solo", department: "진공" }),
      location({ record_id: "dx-vacuum", item_id: "dx", department: "진공" }),
    ];
    const items = [
      item({ item_id: "dx", model_slots: [1], process_type_code: "AA" }),
      item({ item_id: "solo", model_slots: [2], process_type_code: "VA" }),
    ];

    expect(filterDefectLocations(locations, items, models, {
      departments: ["조립", "진공"],
      models: ["DX3000"],
      processSteps: ["A", "F"],
    }).map((entry) => entry.record_id)).toEqual(["dx-assembly", "dx-vacuum"]);
  });

  it("matches missing item classification with both model and process unclassified filters", () => {
    const unclassified = location({ record_id: "legacy", item_id: "missing" });

    expect(filterDefectLocations([unclassified], [], models, {
      departments: [],
      models: ["미분류"],
      processSteps: ["UNCLASSIFIED"],
    })).toEqual([unclassified]);
  });
});
