import { describe, expect, it } from "vitest";
import { KPI_STATUS, stocktakeItemStatus } from "./stocktakeTargetFilter";
import type { StocktakeTarget } from "@/lib/api/types/stocktake";

describe("KPI status groups", () => {
  it("maps KPIs to server groups while keeping applied an exact status", () => {
    expect(KPI_STATUS).toEqual({ total: "", unconfirmed: "UNCONFIRMED", confirmed: "CONFIRMED_WAITING", applied: "APPLIED" });
  });
  it.each([
    [["UNCOUNTED", "UNCOUNTED"], "UNCOUNTED"],
    [["ABANDONED", "ABANDONED"], "UNCOUNTED"],
    [["ABANDONED", "UNCOUNTED"], "UNCOUNTED"],
    [["ABANDONED", "DRAFT"], "DRAFT"],
    [["ABANDONED", "CONFIRMED"], "DRAFT"],
    [["CONFIRMED", "UNCOUNTED"], "DRAFT"],
    [["APPLIED", "CONFIRMED"], "CONFIRMED"],
    [["APPLIED", "UNCOUNTED"], "DRAFT"],
    [["APPLIED", "APPLIED"], "APPLIED"],
    [["APPLIED", "DRAFT"], "DRAFT"],
  ])("aggregates all locations: %j -> %s", (states, expected) => {
    expect(stocktakeItemStatus((states as StocktakeTarget["status"][]).map(status => ({ status })))).toBe(expected);
  });
});
