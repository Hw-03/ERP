import { describe, expect, it } from "vitest";
import type { Item } from "@/lib/api";
import { matchesSearch } from "../inventoryFilter";

describe("inventoryFilter matchesSearch", () => {
  it("inherits normalized item search for the dashboard inventory path", () => {
    const item = { item_name: "Dashboard Item", mes_code: "6-AF/01.2" } as Item;

    expect(matchesSearch(item, "6AF012")).toBe(true);
  });
});
