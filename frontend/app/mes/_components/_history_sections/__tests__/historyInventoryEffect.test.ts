import { describe, expect, it } from "vitest";
import { toInventoryEffectRows } from "../historyInventoryEffect";

describe("toInventoryEffectRows", () => {
  it("keeps item, unit, and location identity on canonical non-zero effects", () => {
    const rows = toInventoryEffectRows(
      [
        { scope: "warehouse", delta: -3 },
        {
          scope: "location",
          location_id: "location-assembly-production",
          department: "조립",
          status: "PRODUCTION",
          delta: 3,
        },
      ],
      { itemId: "item-a", itemName: "완제품 A", unit: "EA" },
    );

    expect(rows).toEqual([
      {
        key: "item-a:EA:warehouse::::",
        scope: "warehouse",
        itemId: "item-a",
        itemName: "완제품 A",
        unit: "EA",
        locationId: null,
        rowId: null,
        boxId: null,
        zoneId: null,
        department: null,
        status: null,
        label: "창고 재고",
        delta: -3,
        deltaLabel: "-3",
      },
      {
        key: "item-a:EA:location:location-assembly-production:조립:PRODUCTION:",
        scope: "location",
        itemId: "item-a",
        itemName: "완제품 A",
        unit: "EA",
        locationId: "location-assembly-production",
        rowId: null,
        boxId: null,
        zoneId: null,
        department: "조립",
        status: "PRODUCTION",
        label: "조립 재고",
        delta: 3,
        deltaLabel: "+3",
      },
    ]);
  });

  it("keeps warehouse box ids distinct", () => {
    const rows = toInventoryEffectRows(
      [
        { scope: "warehouse_box", box_id: "box-1", delta: -2 },
        { scope: "warehouse_box", box_id: "box-2", delta: -1 },
      ],
      { itemId: "item-a", itemName: "부품 A", unit: "EA" },
    );

    expect(rows.map((row) => ({ key: row.key, boxId: row.boxId, label: row.label }))).toEqual([
      {
        key: "item-a:EA:warehouse_box::::box-1",
        boxId: "box-1",
        label: "박스 재고",
      },
      {
        key: "item-a:EA:warehouse_box::::box-2",
        boxId: "box-2",
        label: "박스 재고",
      },
    ]);
  });

  it("keeps exact special-zone and unplaced rows visible", () => {
    const rows = toInventoryEffectRows(
      [
        {
          scope: "warehouse_zone",
          row_id: "zone-row-1",
          zone_id: 7,
          delta: -2,
        },
        {
          scope: "warehouse_unplaced",
          row_id: "unplaced-row-1",
          delta: -1,
        },
      ],
      { itemId: "item-a", itemName: "부품 A", unit: "EA" },
    );

    expect(rows).toMatchObject([
      {
        scope: "warehouse_zone",
        rowId: "zone-row-1",
        zoneId: "7",
        label: "특수구역 재고",
        deltaLabel: "-2",
      },
      {
        scope: "warehouse_unplaced",
        rowId: "unplaced-row-1",
        zoneId: null,
        label: "미배치 재고",
        deltaLabel: "-1",
      },
    ]);
  });

  it("accepts only non-zero warehouse, location, and warehouse_box effects", () => {
    const rows = toInventoryEffectRows(
      [
        { scope: "warehouse", delta: 0 },
        { scope: "box", box_id: "legacy-box", delta: 4 },
        { scope: "unknown", delta: 5 },
      ],
      { itemId: "item-a", itemName: "부품 A", unit: "EA" },
    );

    expect(rows).toEqual([]);
    expect(toInventoryEffectRows(null, { itemId: "item-a", itemName: "부품 A", unit: "EA" })).toEqual([]);
  });
});
