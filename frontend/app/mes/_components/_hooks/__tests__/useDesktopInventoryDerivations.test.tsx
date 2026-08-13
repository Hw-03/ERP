import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";
import { matchesKpi } from "../../_inventory_sections/inventoryFilter";
import { useDesktopInventoryDerivations } from "../useDesktopInventoryDerivations";

function item(overrides: Partial<Item>): Item {
  return {
    item_id: "item",
    item_name: "품목",
    unit: "EA",
    quantity: 0,
    warehouse_qty: 0,
    production_total: 0,
    defective_total: 0,
    pending_quantity: 0,
    available_quantity: 0,
    last_reserver_name: null,
    location: null,
    locations: [],
    legacy_part: null,
    legacy_item_type: null,
    supplier: null,
    min_stock: 10,
    mes_code: null,
    model_symbol: null,
    model_slots: [],
    process_type_code: null,
    serial_no: null,
    bom_completed_at: null,
    deleted_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    department: null,
    ...overrides,
  };
}

describe("useDesktopInventoryDerivations", () => {
  it("PA/PF 품목은 KPI 숫자에서만 빼고 기존 요약 콜백과 KPI 선택 판별은 유지한다", async () => {
    const normal = item({ item_id: "normal", quantity: 12 });
    const low = item({ item_id: "low", quantity: 5 });
    const zero = item({ item_id: "zero", quantity: 0 });
    const paNormal = item({ item_id: "pa", quantity: 12, mes_code: "3-PA-0001" });
    const pfLow = item({ item_id: "pf", quantity: 5, mes_code: "3-PF-0001" });
    const deleted = item({ item_id: "deleted", quantity: 12, deleted_at: "2026-01-02T00:00:00Z" });
    const activeItems = [normal, low, zero, paNormal, pfLow];
    const onSummaryChange = vi.fn();

    const { result, rerender } = renderHook(
      ({ scopedItems, selectedModels }: { scopedItems: Item[]; selectedModels: string[] }) =>
        useDesktopInventoryDerivations({
          items: [...activeItems, deleted],
          scopedItems,
          filteredItems: scopedItems,
          selectedDepts: [],
          selectedModels,
          selectedProcessSteps: [],
          deferredLocalSearch: "",
          displayItem: null,
          onSummaryChange,
        }),
      { initialProps: { scopedItems: activeItems, selectedModels: [] } },
    );

    expect(result.current.kpiCards.map(({ key, value }) => [key, value])).toEqual([
      ["ALL", 3],
      ["NORMAL", 1],
      ["LOW", 1],
      ["ZERO", 1],
    ]);
    await waitFor(() => expect(onSummaryChange).toHaveBeenLastCalledWith({ low: 2, zero: 1 }));
    expect(matchesKpi(paNormal, "NORMAL")).toBe(true);
    expect(matchesKpi(pfLow, "LOW")).toBe(true);

    rerender({ scopedItems: [normal, paNormal, pfLow], selectedModels: ["DX3000"] });

    expect(result.current.kpiCards.map(({ key, value }) => [key, value])).toEqual([
      ["ALL", 1],
      ["NORMAL", 1],
      ["LOW", 0],
      ["ZERO", 0],
    ]);
    await waitFor(() => expect(onSummaryChange).toHaveBeenLastCalledWith({ low: 1, zero: 0 }));
  });
});
