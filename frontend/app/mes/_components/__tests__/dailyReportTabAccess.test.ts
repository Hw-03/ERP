import { describe, expect, it } from "vitest";
import { mobileMoreHasVisibleEntries, normalizeHiddenSidebarTabs } from "../tabAccess";

describe("일일 작업 일보 접근 제어", () => {
  it("저장된 숨김 설정에 dailyReport를 인식한다", () => {
    expect(normalizeHiddenSidebarTabs(["dailyReport"])).toEqual(["dailyReport"]);
  });

  it("dailyReport만 숨기면 More 항목은 남아 있다", () => {
    expect(mobileMoreHasVisibleEntries({ hidden_sidebar_tabs: ["dailyReport"] })).toBe(true);
  });
});
