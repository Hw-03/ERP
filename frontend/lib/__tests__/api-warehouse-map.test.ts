import { afterEach, describe, expect, it, vi } from "vitest";
import {
  warehouseMapApi,
  type BoxTrackingUiPreference,
  type ReconcileResult,
  type WarehouseMap,
} from "../api/warehouse-map";

function makeResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("warehouseMapApi", () => {
  it("types the additive unplaced map and complete ledger reconciliation fields", () => {
    const map: WarehouseMap = {
      angles: [],
      boxes: [],
      special_zones: [],
      unplaced_items: [{
        row_id: "unplaced-row-1",
        item_id: "item-1",
        mes_code: "1-AA-0001",
        item_name: "부품 A",
        quantity: 4,
      }],
    };
    const reconcile: ReconcileResult = {
      rows: [{
        item_id: "item-1",
        mes_code: "1-AA-0001",
        item_name: "부품 A",
        placed_total: 6,
        warehouse_qty: 10,
        diff: -4,
        status: "under",
        box_total: 4,
        zone_total: 2,
        inactive_zone_total: 0,
        unplaced_total: 4,
        ledger_total: 10,
        ledger_diff: 0,
        ledger_status: "ok",
        inventory_present: true,
        unplaced_present: true,
        ledger_issues: [],
      }],
      mismatch_count: 1,
      ledger_mismatch_count: 0,
    };

    expect(map.unplaced_items[0].row_id).toBe("unplaced-row-1");
    expect(reconcile.rows[0]).toMatchObject({
      box_total: 4,
      zone_total: 2,
      unplaced_total: 4,
      ledger_total: 10,
      ledger_status: "ok",
    });
  });

  it("keeps box tracking as an enabled-only UI display preference contract", async () => {
    const response: BoxTrackingUiPreference = { enabled: false };
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse(response)));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    expect(await warehouseMapApi.getBoxTracking()).toEqual({ enabled: false });
    const getCall = fetchSpy.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit?];
    expect(String(getCall[0])).toContain(
      "/api/warehouse-map/box-tracking",
    );

    fetchSpy.mockClear();
    expect(await warehouseMapApi.setBoxTracking({ enabled: true })).toEqual({
      enabled: false,
    });
    const putCall = fetchSpy.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    expect(putCall[1].method).toBe("PUT");
    expect(JSON.parse(String(putCall[1].body))).toEqual({
      enabled: true,
    });
  });
});
