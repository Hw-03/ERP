import { describe, expect, it } from "vitest";
import {
  firstVisibleSidebarTab,
  filterVisibleSidebarTabs,
  mobileMoreHasVisibleEntries,
  normalizeHiddenSidebarTabs,
  setSidebarTabVisible,
  isSidebarTabVisible,
} from "../tabAccess";

const op = (hidden_sidebar_tabs?: string[] | null) => ({ hidden_sidebar_tabs });

describe("tabAccess", () => {
  it("전수조사는 서버의 현재 개인 설정을 적용하고 일괄 실행 값과 세션의 이전 값은 결합하지 않는다", () => {
    const enabled = { enabled: true, employee_visible: true, participant_departments: ["조립"], participant_count: 1 };
    const worker = { department: "조립", hidden_sidebar_tabs: [] };
    expect(filterVisibleSidebarTabs(["stocktake"], worker)).toEqual([]);
    expect(filterVisibleSidebarTabs(["stocktake"], worker, enabled)).toEqual(["stocktake"]);
    expect(isSidebarTabVisible("stocktake", { ...worker, department: "연구" }, enabled)).toBe(true);
    expect(isSidebarTabVisible("stocktake", { ...worker, hidden_sidebar_tabs: ["stocktake"] }, enabled)).toBe(true);
    expect(isSidebarTabVisible("stocktake", worker, { ...enabled, enabled: false })).toBe(true);
    expect(isSidebarTabVisible("stocktake", worker, { ...enabled, employee_visible: false })).toBe(false);
    expect(isSidebarTabVisible("stocktake", null, enabled)).toBe(false);
    expect(normalizeHiddenSidebarTabs(["stocktake"])).toEqual(["stocktake"]);
    expect(filterVisibleSidebarTabs(["dashboard", "stocktake", "warehouse"], op(["stocktake"]))).toEqual(["dashboard", "warehouse"]);
    expect(setSidebarTabVisible([], "stocktake", false)).toEqual(["stocktake"]);
    expect(filterVisibleSidebarTabs(["stocktake"], { ...worker, hidden_sidebar_tabs: ["warehouse", "defect"] }, enabled)).toEqual(["stocktake"]);
  });
  it.each([{ department_role: "primary" }, { department_role: "deputy" }])("부서 정·부는 일괄 OFF 및 조회 실패에도 진입하지만 개인 숨김을 존중한다: %j", manager => {
    expect(isSidebarTabVisible("stocktake", manager)).toBe(true);
    expect(isSidebarTabVisible("stocktake", manager, { enabled: false, employee_visible: true, participant_departments: [], participant_count: 0 })).toBe(true);
    expect(isSidebarTabVisible("stocktake", manager, { enabled: true, employee_visible: false, participant_departments: [], participant_count: 0 })).toBe(false);
    expect(isSidebarTabVisible("stocktake", { ...manager, hidden_sidebar_tabs: ["stocktake"] })).toBe(false);
  });
  it("과거 admin 값은 부서 역할 없이 전수조사 진입 권한을 부여하지 않는다", () => {
    const legacy = { department_role: "none", level: "admin" };
    expect(isSidebarTabVisible("stocktake", legacy)).toBe(false);
  });
  it("filters hidden desktop sidebar tabs", () => {
    expect(
      filterVisibleSidebarTabs(["dashboard", "weekly", "admin"], op(["weekly", "admin"])),
    ).toEqual(["dashboard"]);
  });

  it("uses the first allowed tab when dashboard is hidden", () => {
    expect(firstVisibleSidebarTab(op(["dashboard", "stocktake", "warehouse"]))).toBe("shipping");
  });

  it("ignores unknown persisted tab ids on the client", () => {
    expect(normalizeHiddenSidebarTabs(["weekly", "unknown", "weekly"])).toEqual(["weekly"]);
  });


  it("toggles warehouse and defect as one visible-tab group", () => {
    expect(setSidebarTabVisible([], "warehouse", false)).toEqual(["warehouse", "defect"]);
    expect(setSidebarTabVisible(["warehouse", "defect", "weekly"], "defect", true)).toEqual(["weekly"]);
  });
  it("hides the mobile More slot when every More entry is hidden", () => {
    expect(mobileMoreHasVisibleEntries(op(["dailyReport", "shipping", "weekly", "warehouseMap"]))).toBe(false);
    expect(mobileMoreHasVisibleEntries(op(["stocktake", "dailyReport", "shipping", "weekly", "warehouseMap"]))).toBe(false);
    expect(mobileMoreHasVisibleEntries(op(["shipping", "weekly"]))).toBe(true);
  });
});
