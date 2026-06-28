import { describe, expect, it } from "vitest";
import {
  firstVisibleSidebarTab,
  filterVisibleSidebarTabs,
  mobileMoreHasVisibleEntries,
  normalizeHiddenSidebarTabs,
} from "../tabAccess";

const op = (hidden_sidebar_tabs?: string[] | null) => ({ hidden_sidebar_tabs });

describe("tabAccess", () => {
  it("filters hidden desktop sidebar tabs", () => {
    expect(
      filterVisibleSidebarTabs(["dashboard", "weekly", "admin"], op(["weekly", "admin"])),
    ).toEqual(["dashboard"]);
  });

  it("uses the first allowed tab when dashboard is hidden", () => {
    expect(firstVisibleSidebarTab(op(["dashboard", "warehouse"]))).toBe("shipping");
  });

  it("ignores unknown persisted tab ids on the client", () => {
    expect(normalizeHiddenSidebarTabs(["weekly", "unknown", "weekly"])).toEqual(["weekly"]);
  });

  it("hides the mobile More slot when every More entry is hidden", () => {
    expect(mobileMoreHasVisibleEntries(op(["shipping", "weekly", "warehouseMap"]))).toBe(false);
    expect(mobileMoreHasVisibleEntries(op(["shipping", "weekly"]))).toBe(true);
  });
});