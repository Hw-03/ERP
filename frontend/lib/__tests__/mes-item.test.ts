import { describe, it, expect } from "vitest";
import {
  buildItemSearchLabel,
  normalizeModel,
  itemMatchesKpi,
  groupedItems,
} from "../mes/item";
import type { Item } from "../api";

const stubItem = (overrides: Partial<Item> = {}): Item => ({
  item_id: "id-1",
  item_name: "Widget A",
  spec: null,
  unit: "EA",
  quantity: 10,
  warehouse_qty: 10,
  production_total: 0,
  defective_total: 0,
  pending_quantity: 0,
  available_quantity: 10,
  last_reserver_name: null,
  location: null,
  locations: [],
  barcode: null,
  legacy_file_type: null,
  legacy_part: null,
  legacy_item_type: null,
  legacy_model: null,
  supplier: null,
  min_stock: null,
  erp_code: "ITM-AA-00001",
  model_symbol: null,
  model_slots: [],
  symbol_slot: null,
  process_type_code: null,
  option_code: null,
  serial_no: null,
  created_at: "2026-01-01T00:00:00",
  updated_at: "2026-01-01T00:00:00",
  department: null,
  ...overrides,
});

describe("buildItemSearchLabel", () => {
  it("formats as 'erp / name'", () => {
    expect(buildItemSearchLabel(stubItem())).toBe("ITM-AA-00001 / Widget A");
  });
});

describe("normalizeModel", () => {
  it("returns trimmed model when present", () => {
    expect(normalizeModel("DX3000")).toBe("DX3000");
  });
  it("returns '공용' for empty / null / whitespace", () => {
    expect(normalizeModel(undefined)).toBe("공용");
    expect(normalizeModel(null)).toBe("공용");
    expect(normalizeModel("")).toBe("공용");
    expect(normalizeModel("   ")).toBe("공용");
  });
});

describe("itemMatchesKpi", () => {
  it("정상: qty > 0 and (no min or qty >= min)", () => {
    expect(itemMatchesKpi(stubItem({ quantity: 10 }), "정상")).toBe(true);
    expect(itemMatchesKpi(stubItem({ quantity: 10, min_stock: 5 }), "정상")).toBe(true);
    expect(itemMatchesKpi(stubItem({ quantity: 10, min_stock: 10 }), "정상")).toBe(true);
    expect(itemMatchesKpi(stubItem({ quantity: 5, min_stock: 10 }), "정상")).toBe(false);
    expect(itemMatchesKpi(stubItem({ quantity: 0 }), "정상")).toBe(false);
  });

  it("부족: 0 < qty < min", () => {
    expect(itemMatchesKpi(stubItem({ quantity: 5, min_stock: 10 }), "부족")).toBe(true);
    expect(itemMatchesKpi(stubItem({ quantity: 10 }), "부족")).toBe(false);
    expect(itemMatchesKpi(stubItem({ quantity: 0, min_stock: 10 }), "부족")).toBe(false);
  });

  it("품절: qty <= 0", () => {
    expect(itemMatchesKpi(stubItem({ quantity: 0 }), "품절")).toBe(true);
    expect(itemMatchesKpi(stubItem({ quantity: -1 }), "품절")).toBe(true);
    expect(itemMatchesKpi(stubItem({ quantity: 1 }), "품절")).toBe(false);
  });

  it("returns true for unknown KPI label (전체 등)", () => {
    expect(itemMatchesKpi(stubItem(), "전체")).toBe(true);
    expect(itemMatchesKpi(stubItem(), "")).toBe(true);
  });
});

describe("groupedItems", () => {
  it("groups by lower-cased trimmed item_name and sums quantities", () => {
    const items = [
      stubItem({ item_id: "1", item_name: "Widget A", quantity: 5 }),
      stubItem({ item_id: "2", item_name: "  widget a ", quantity: 3 }),
      stubItem({ item_id: "3", item_name: "Other", quantity: 7 }),
    ];
    const groups = groupedItems(items);
    expect(groups.length).toBe(2);
    const widget = groups.find((g) => g.key === "widget a");
    expect(widget).toBeDefined();
    expect(widget!.quantity).toBe(8);
    expect(widget!.count).toBe(2);
    expect(widget!.representative.item_id).toBe("1");
  });

  it("returns empty array for empty input", () => {
    expect(groupedItems([])).toEqual([]);
  });
});
