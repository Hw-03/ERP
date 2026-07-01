import { describe, expect, it } from "vitest";
import { toInventoryEffectRows } from "../historyInventoryEffect";

describe("toInventoryEffectRows", () => {
  it("formats warehouse, production, and defective cell deltas", () => {
    const rows = toInventoryEffectRows([
      { scope: "warehouse", delta: -3 },
      { scope: "location", department: "조립", status: "PRODUCTION", delta: 3 },
      { scope: "location", department: "조립", status: "DEFECTIVE", delta: 1 },
    ]);

    expect(rows).toEqual([
      { key: "warehouse::", label: "창고", delta: -3, deltaLabel: "-3" },
      { key: "location:조립:PRODUCTION", label: "조립 생산", delta: 3, deltaLabel: "+3" },
      { key: "location:조립:DEFECTIVE", label: "조립 불량", delta: 1, deltaLabel: "+1" },
    ]);
  });

  it("formats box-tracking inventory effects with an operator-facing label", () => {
    const rows = toInventoryEffectRows([
      { scope: "warehouse_box", box_id: "box-1", delta: -2 },
    ]);

    expect(rows).toEqual([
      { key: "warehouse_box::", label: "박스 재고", delta: -2, deltaLabel: "-2" },
    ]);
  });

  it("returns an empty list for null, empty, or zero-delta effects", () => {
    expect(toInventoryEffectRows(null)).toEqual([]);
    expect(toInventoryEffectRows([])).toEqual([]);
    expect(toInventoryEffectRows([{ scope: "warehouse", delta: 0 }])).toEqual([]);
  });
});
