import { act, fireEvent, render, screen } from "@testing-library/react";
import { useLayoutEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DashboardNavigationProvider, useDashboardNavigation, useDashboardSnapshot } from "../DashboardNavigation";

function Screen() {
  const nav = useDashboardNavigation()!;
  const [item, setItem] = useState<string | null>(null);
  const [search, setSearch] = useState("keep");
  useDashboardSnapshot("inventory:main", () => ({ item, search }), value => { setItem(value.item); setSearch(value.search); }, { isHome: !item, home: () => setItem(null) });
  return <><button onClick={() => nav.navigate("inventory")}>재고</button><button onClick={() => nav.commit(() => setItem("a"))}>상세</button><input aria-label="검색" value={search} onChange={e => setSearch(e.target.value)} /><output>{item ?? "목록"}</output></>;
}
describe("대시보드 탐색 이력", () => {
  it("HTTP에서 randomUUID가 없어도 진입·상세 이동·뒤로 복원이 동작한다", () => {
    const getRandomValues = crypto.getRandomValues.bind(crypto);
    vi.stubGlobal("crypto", { getRandomValues });
    try {
      window.history.replaceState({ __NA: true }, "", "/mes?tab=dashboard");
      render(<DashboardNavigationProvider><Screen /></DashboardNavigationProvider>);
      const home = window.history.state;
      expect(screen.getByText("목록")).toBeVisible();
      expect(home.desktopDashboard.key).toEqual(expect.any(String));
      fireEvent.click(screen.getByText("상세"));
      const detail = window.history.state;
      expect(detail.desktopDashboard.key).not.toBe(home.desktopDashboard.key);
      expect(screen.getByText("a")).toBeVisible();
      act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: home })));
      expect(screen.getByText("목록")).toBeVisible();
      act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: detail })));
      expect(screen.getByText("a")).toBeVisible();
      expect(window.history.state.__NA).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("탭 왕복은 각 화면을 복원하고 뒤로 이동 취소는 이력을 추가하지 않는다", () => {
    let nav: ReturnType<typeof useDashboardNavigation>;
    let accept: (() => void) | undefined;
    function Owner() {
      const current = useDashboardNavigation();
      useLayoutEffect(() => { nav = current; }, [current]);
      return <Screen />;
    }
    window.history.replaceState({}, "", "/mes?tab=dashboard");
    render(<DashboardNavigationProvider><Owner /></DashboardNavigationProvider>);
    fireEvent.click(screen.getByText("상세"));
    const detail = window.history.state;
    act(() => nav!.navigate("capacity"));
    expect(nav!.view).toBe("capacity");
    act(() => nav!.navigate("inventory"));
    expect(screen.getByText("a")).toBeVisible();
    const current = window.history.state;
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    const push = vi.spyOn(window.history, "pushState");
    nav!.guard.current = action => { accept = action; };
    act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: detail })));
    expect(go).toHaveBeenCalledWith(2);
    act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: current })));
    expect(accept).toBeDefined();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText("a")).toBeVisible();
    act(() => accept!());
    expect(go).toHaveBeenLastCalledWith(-2);
    act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: detail })));
    expect(nav!.view).toBe("inventory");
    vi.restoreAllMocks();
  });
  it("현재 탭 복귀는 조건을 유지하고 이전 entry를 복원한다", () => {
    window.history.replaceState({ __NA: true }, "", "/mes?tab=dashboard");
    render(<DashboardNavigationProvider><Screen /></DashboardNavigationProvider>);
    fireEvent.click(screen.getByText("상세"));
    const detail = window.history.state;
    fireEvent.click(screen.getByText("재고"));
    expect(screen.getByText("목록")).toBeVisible();
    expect(screen.getByLabelText("검색")).toHaveValue("keep");
    const home = window.history.state;
    fireEvent.click(screen.getByText("재고"));
    expect(window.history.state).toEqual(home);
    act(() => { window.history.replaceState(detail, ""); window.dispatchEvent(new PopStateEvent("popstate", { state: detail })); });
    expect(screen.getByText("a")).toBeVisible();
    expect(window.history.state.__NA).toBe(true);
    expect(JSON.stringify(window.history.state)).not.toContain("keep");
  });
});
