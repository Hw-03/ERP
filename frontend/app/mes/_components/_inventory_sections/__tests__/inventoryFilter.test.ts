import { describe, expect, it } from "vitest";
import type { Item } from "@/lib/api";
import { matchesInventoryCategoryFilters, matchesSearch } from "../inventoryFilter";

describe("inventoryFilter matchesSearch", () => {
  it("inherits normalized item search for the dashboard inventory path", () => {
    const item = { item_name: "Dashboard Item", mes_code: "6-AF/01.2" } as Item;

    expect(matchesSearch(item, "6AF012")).toBe(true);
  });
});

describe("matchesInventoryCategoryFilters", () => {
  const assemblyItem = {
    item_id: "assembly-item",
    department: "조립",
    mes_code: "6-AF/01.2",
    model_slots: [1],
    process_type_code: "R",
    locations: [],
  } as Item;

  const filters = {
    selectedDepts: ["조립"],
    selectedSlots: new Set([2]),
    showUnclassified: false,
    selectedProcessSteps: [],
  };

  it("OR에서는 선택한 분류 중 하나만 일치해도 포함한다", () => {
    expect(matchesInventoryCategoryFilters(assemblyItem, { ...filters, logic: "OR" })).toBe(true);
  });

  it("AND에서는 선택한 모든 분류가 일치해야 포함한다", () => {
    expect(matchesInventoryCategoryFilters(assemblyItem, { ...filters, logic: "AND" })).toBe(false);
  });

  it("AND에서는 선택한 모든 부서 재고를 함께 가져야 한다", () => {
    expect(
      matchesInventoryCategoryFilters(assemblyItem, {
        ...filters,
        selectedDepts: ["조립", "출하"],
        selectedSlots: new Set(),
        logic: "AND",
      }),
    ).toBe(false);
  });

  it("AND에서 창고와 진공을 선택하면 두 곳에 모두 재고가 있는 품목만 포함한다", () => {
    const warehouseAndVacuumItem = {
      ...assemblyItem,
      warehouse_qty: 6,
      locations: [{ department: "진공", quantity: 4 }],
    } as Item;

    expect(
      matchesInventoryCategoryFilters(warehouseAndVacuumItem, {
        ...filters,
        selectedDepts: ["창고", "진공"],
        selectedSlots: new Set(),
        logic: "AND",
      }),
    ).toBe(true);

    expect(
      matchesInventoryCategoryFilters(
        { ...warehouseAndVacuumItem, locations: [{ department: "진공", quantity: 0 }] } as Item,
        {
          ...filters,
          selectedDepts: ["창고", "진공"],
          selectedSlots: new Set(),
          logic: "AND",
        },
      ),
    ).toBe(false);

    expect(
      matchesInventoryCategoryFilters(
        { ...warehouseAndVacuumItem, department: "진공", locations: [] } as Item,
        {
          ...filters,
          selectedDepts: ["창고", "진공"],
          selectedSlots: new Set(),
          logic: "AND",
        },
      ),
    ).toBe(false);
  });
});
