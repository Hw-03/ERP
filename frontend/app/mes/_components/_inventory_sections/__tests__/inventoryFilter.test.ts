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
  const assemblyItem = {
    item_id: "assembly-item",
    department: "조립",
    mes_code: "ITM-AF-00001",
    model_slots: [1],
    process_type_code: "R",
    locations: [
      {
        department: "조립",
        status: "PRODUCTION",
        quantity: 1,
        pending_quantity: 0,
        available_quantity: 1,
      },
    ],
  } as Item;

  const noFilters = {
    selectedDepts: [],
    departmentFilterBasis: "location" as const,
    selectedSlots: new Set<number>(),
    showUnclassified: false,
    showDisused: false,
    selectedProcessSteps: [],
  };

  it("기본 논리는 AND다", () => {
    expect(
      (inventoryFilter as { DEFAULT_INVENTORY_FILTER_LOGIC?: string })
        .DEFAULT_INVENTORY_FILTER_LOGIC,
    ).toBe("AND");
  });

  it("재고 위치 기준은 품목 코드가 아닌 실제 위치 수량으로만 판별한다", () => {
    const assemblyCodeStoredInTube = {
      ...assemblyItem,
      department: "not-owner",
      mes_code: "ITM-AF-00001",
      locations: [
        {
          department: "튜브",
          status: "PRODUCTION",
          quantity: 1,
          pending_quantity: 0,
          available_quantity: 1,
        },
      ],
    } as Item;

    expect(
      matchesInventoryCategoryFilters(assemblyCodeStoredInTube, {
        ...noFilters,
        selectedDepts: ["조립"],
        departmentFilterBasis: "location",
        logic: "AND",
      } as Parameters<typeof matchesInventoryCategoryFilters>[1]),
    ).toBe(false);
  });

  it("품목 코드 기준은 위치와 소유 부서를 무시한다", () => {
    const highVoltageCodeStoredInAssembly = {
      ...assemblyItem,
      department: "조립",
      mes_code: "ITM-HF-00001",
      locations: [
        {
          department: "조립",
          status: "PRODUCTION",
          quantity: 1,
          pending_quantity: 0,
          available_quantity: 1,
        },
      ],
    } as Item;

    expect(
      matchesInventoryCategoryFilters(highVoltageCodeStoredInAssembly, {
        ...noFilters,
        selectedDepts: ["조립"],
        departmentFilterBasis: "code",
        logic: "AND",
      } as Parameters<typeof matchesInventoryCategoryFilters>[1]),
    ).toBe(false);
  });

  it("품목 코드 기준에서 창고는 일치하는 품목이 없다", () => {
    expect(
      matchesInventoryCategoryFilters(
        { ...assemblyItem, warehouse_qty: 1 } as Item,
        {
          ...noFilters,
          selectedDepts: ["창고"],
          departmentFilterBasis: "code",
          logic: "AND",
        } as Parameters<typeof matchesInventoryCategoryFilters>[1],
      ),
    ).toBe(false);
  });

  it("불용은 불용 필터를 켜기 전에는 항상 제외한다", () => {
    const disusedItem = { ...assemblyItem, legacy_item_type: "불용" } as Item;

    expect(
      matchesInventoryCategoryFilters(disusedItem, { ...noFilters, showDisused: false, logic: "AND" }),
    ).toBe(false);
  });

  it("불용 필터만 켜면 불용 품목만 포함한다", () => {
    const disusedItem = { ...assemblyItem, legacy_item_type: "불용" } as Item;

    expect(
      matchesInventoryCategoryFilters(disusedItem, { ...noFilters, showDisused: true, logic: "AND" }),
    ).toBe(true);
    expect(
      matchesInventoryCategoryFilters(assemblyItem, { ...noFilters, showDisused: true, logic: "AND" }),
    ).toBe(false);
  });

  it("AND는 부서 칩에만 적용하고 모델 칩은 하나만 일치해도 통과한다", () => {
    const fullyMatchedItem = {
      ...assemblyItem,
      warehouse_qty: 1,
      model_slots: [1, 2],
      locations: [
        {
          department: "조립",
          status: "PRODUCTION",
          quantity: 1,
          pending_quantity: 0,
          available_quantity: 1,
        },
        {
          department: "출하",
          status: "DEFECTIVE",
          quantity: 1,
          pending_quantity: 0,
          available_quantity: 1,
        },
      ],
      legacy_item_type: "불용",
    } as Item;

    expect(
      matchesInventoryCategoryFilters(fullyMatchedItem, {
        ...noFilters,
        selectedDepts: ["창고", "조립", "출하"],
        selectedSlots: new Set([1, 2]),
        selectedProcessSteps: ["R", "DEFECT"],
        showDisused: true,
        logic: "AND",
      }),
    ).toBe(true);
    expect(
      matchesInventoryCategoryFilters(fullyMatchedItem, {
        ...noFilters,
        selectedDepts: ["창고", "조립", "출하"],
        selectedSlots: new Set([1, 3]),
        selectedProcessSteps: ["R", "DEFECT"],
        showDisused: true,
        logic: "AND",
      }),
    ).toBe(true);
  });

  it("공정 칩은 AND여도 하나만 일치하면 통과한다", () => {
    expect(
      matchesInventoryCategoryFilters(
        assemblyItem,
        {
          ...noFilters,
          selectedDepts: [],
          selectedProcessSteps: ["R", "A"],
          logic: "AND",
        },
      ),
    ).toBe(true);
  });

  it("OR는 서로 다른 구분을 모두 만족해야 한다", () => {
    expect(
      matchesInventoryCategoryFilters(assemblyItem, {
        ...noFilters,
        selectedDepts: ["조립"],
        selectedSlots: new Set([2]),
        logic: "OR",
      }),
    ).toBe(false);
    expect(
      matchesInventoryCategoryFilters(assemblyItem, {
        ...noFilters,
        selectedDepts: ["조립"],
        selectedSlots: new Set([1, 2]),
        logic: "OR",
      }),
    ).toBe(true);
  });

  it("OR는 같은 구분에서 하나만 일치해도 포함한다", () => {
    expect(
      matchesInventoryCategoryFilters(assemblyItem, {
        ...noFilters,
        selectedDepts: ["조립", "출하"],
        logic: "OR",
      }),
    ).toBe(true);
  });

  it("OR는 불용과 다른 구분을 함께 만족해야 한다", () => {
    const disusedItem = { ...assemblyItem, legacy_item_type: "불용" } as Item;

    expect(
      matchesInventoryCategoryFilters(disusedItem, {
        ...noFilters,
        selectedDepts: ["출하"],
        showDisused: true,
        logic: "OR",
      }),
    ).toBe(false);
    expect(
      matchesInventoryCategoryFilters(disusedItem, {
        ...noFilters,
        selectedDepts: ["조립"],
        showDisused: true,
        logic: "OR",
      }),
    ).toBe(true);
  });

  it("재고 위치 기준은 실제 부서 위치와 창고만 판별한다", () => {
    const matchDepartment = (item: Item, selectedDept: string) =>
      matchesInventoryCategoryFilters(item, {
        ...noFilters,
        selectedDepts: [selectedDept],
        logic: "AND",
      });

    expect(
      matchDepartment({ ...assemblyItem, department: "owner-dept", locations: [] }, "owner-dept"),
    ).toBe(false);
    expect(
      matchDepartment(
        {
          ...assemblyItem,
          mes_code: "",
          locations: [
            {
              department: "조립",
              status: "PRODUCTION",
              quantity: 1,
              pending_quantity: 0,
              available_quantity: 1,
            },
          ],
        } as Item,
        "조립",
      ),
    ).toBe(true);
    expect(
      matchDepartment(
        { ...assemblyItem, warehouse_qty: 1 },
        "\uCC3D\uACE0",
      ),
    ).toBe(true);
  });
});
