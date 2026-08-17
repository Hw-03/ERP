import { describe, expect, it } from "vitest";
import type { Item } from "@/lib/api";
import * as inventoryFilter from "../inventoryFilter";

const { matchesInventoryCategoryFilters, matchesSearch } = inventoryFilter;

describe("inventoryFilter matchesSearch", () => {
  it("inherits normalized item search for the dashboard inventory path", () => {
    const item = { item_name: "Dashboard Item", mes_code: "6-AF/01.2" } as Item;

    expect(matchesSearch(item, "6AF012")).toBe(true);
  });
});

describe("matchesInventoryCategoryFilters", () => {
  const LOGICS = ["AND", "OR"] as const;
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

  it("기본 논리는 AND다", () => {
    expect(
      (inventoryFilter as { DEFAULT_INVENTORY_FILTER_LOGIC?: string })
        .DEFAULT_INVENTORY_FILTER_LOGIC,
    ).toBe("AND");
  });

  it("OR에서는 선택한 분류 중 하나만 일치해도 포함한다", () => {
    expect(matchesInventoryCategoryFilters(assemblyItem, { ...filters, logic: "OR" })).toBe(true);
  });

  it("AND에서는 선택한 모든 분류가 일치해야 포함한다", () => {
    expect(matchesInventoryCategoryFilters(assemblyItem, { ...filters, logic: "AND" })).toBe(false);
  });

  it.each(LOGICS)("소속 부서만 일치해도 %s에서 포함한다", (logic) => {
    expect(
      matchesInventoryCategoryFilters(assemblyItem, {
        ...filters,
        selectedDepts: ["조립"],
        selectedSlots: new Set(),
        logic,
      }),
    ).toBe(true);
  });

  it.each(LOGICS)("같은 부서 분류의 여러 선택은 %s에서도 하나만 일치하면 포함한다", (logic) => {
    expect(
      matchesInventoryCategoryFilters(assemblyItem, {
        ...filters,
        selectedDepts: ["조립", "출하"],
        selectedSlots: new Set(),
        logic,
      }),
    ).toBe(true);
  });

  it.each(LOGICS)("같은 모델 분류의 여러 선택은 %s에서도 하나만 일치하면 포함한다", (logic) => {
    expect(
      matchesInventoryCategoryFilters(
        assemblyItem,
        {
          ...filters,
          selectedDepts: [],
          selectedSlots: new Set([1, 2]),
          logic,
        },
      ),
    ).toBe(true);
  });

  it.each(LOGICS)("multiple selected processes stay OR within the process group for %s", (logic) => {
    expect(
      matchesInventoryCategoryFilters(assemblyItem, {
        ...filters,
        selectedDepts: [],
        selectedSlots: new Set(),
        selectedProcessSteps: ["R", "S"],
        logic,
      }),
    ).toBe(true);
  });

  it.each(LOGICS)("department match sources do not change with %s", (logic) => {
    const matchDepartment = (item: Item, selectedDept: string) =>
      matchesInventoryCategoryFilters(item, {
        ...filters,
        selectedDepts: [selectedDept],
        selectedSlots: new Set(),
        logic,
      });

    expect(
      matchDepartment({ ...assemblyItem, department: "owner-dept", locations: [] }, "owner-dept"),
    ).toBe(true);
    expect(
      matchDepartment(
        { ...assemblyItem, department: "not-owner", mes_code: "ITM-AA-00001", locations: [] },
        "\uC870\uB9BD",
      ),
    ).toBe(true);
    expect(
      matchDepartment(
        {
          ...assemblyItem,
          department: "not-owner",
          mes_code: "",
          locations: [{ department: "location-dept" }],
        } as Item,
        "location-dept",
      ),
    ).toBe(true);
    expect(
      matchDepartment(
        { ...assemblyItem, department: "not-owner", warehouse_qty: 1 },
        "\uCC3D\uACE0",
      ),
    ).toBe(true);
  });
});
