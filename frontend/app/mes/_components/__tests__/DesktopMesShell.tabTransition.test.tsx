import { act, fireEvent, render as renderBase, screen, waitFor } from "@testing-library/react";
import { Suspense, useState, type ReactNode } from "react";
import { useDesktopTabHome } from "../DesktopTabHome";
import { useRegisterDirty } from "@/lib/ui/dirty-guard";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DesktopMesShell } from "../DesktopMesShell";
import { AppearancePreferencesProvider } from "../useAppearancePreferences";
import type { DesktopTabId } from "../tabAccess";
import { sendClientEvent } from "@/lib/client-events";

const setAuditScreen = vi.hoisted(() => vi.fn());
const operatorState = vi.hoisted(() => ({ current: null as { employee_id: string; name: string; department: string; hidden_sidebar_tabs: string[]; level?: string; department_role?: string } | null }));
const stocktakeMenuState = vi.hoisted(() => ({ data: { enabled: true, employee_visible: true, participant_departments: ["조립"], participant_count: 1 } as { enabled: boolean; employee_visible: boolean; participant_departments: string[]; participant_count: number } | undefined, isLoading: false }));
const stocktakeFlush = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../stocktake/useStocktakeMenuVisibility", () => ({ useStocktakeMenuVisibility: () => stocktakeMenuState }));

function render(ui: ReactNode) {
  const view = renderBase(<AppearancePreferencesProvider>{ui}</AppearancePreferencesProvider>);
  return { ...view, rerender: (next: ReactNode) => view.rerender(<AppearancePreferencesProvider>{next}</AppearancePreferencesProvider>) };
}

const routerPush = vi.hoisted(() => vi.fn());
const routerReplace = vi.hoisted(() => vi.fn());
const queryClientMock = vi.hoisted(() => ({
  prefetchQuery: vi.fn(),
}));
const shippingViewProps = vi.hoisted(() => vi.fn());
const adminViewMounts = vi.hoisted(() => vi.fn());
const defectViewStates = vi.hoisted(() => vi.fn());
const slowDashboard = vi.hoisted(() => ({ pending: false, promise: new Promise<void>(() => {}) }));
const slowHistory = vi.hoisted(() => ({ pending: false, promise: new Promise<void>(() => {}) }));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => queryClientMock,
}));

vi.mock("@/lib/client-events", () => ({
  sendClientEvent: vi.fn(),
}));

vi.mock("@/lib/activity-audit-context", () => ({
  setAuditScreen,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
  useSearchParams: () => new URLSearchParams("tab=history"),
}));


vi.mock("@/lib/queries/useProductionQuery", () => ({
  useProductionCapacityQuery: () => ({ data: null, isLoading: true, refetch: vi.fn() }),
}));

vi.mock("../login/useCurrentOperator", () => ({
  useCurrentOperator: () => operatorState.current,
  readCurrentOperator: () => operatorState.current,
  setCurrentOperator: vi.fn(),
}));

const sidebarTabs: DesktopTabId[] = ["dashboard", "warehouse", "shipping", "defect", "history", "dailyReport", "weekly", "warehouseMap", "settings", "stocktake"];
vi.mock("../stocktake/StocktakeView", () => ({ StocktakeView: () => {
  const [dirty, setDirty] = useState(true);
  useRegisterDirty("stocktake-test", dirty, async () => { await stocktakeFlush(); setDirty(false); }, undefined, { mode: "auto-save" });
  return <main>stocktake content</main>;
} }));

vi.mock("../DesktopSidebar", () => ({
  DESKTOP_TAB_ICON_COLORS: {
    dashboard: "#fff",
    warehouse: "#fff",
    shipping: "#fff",
    warehouseMap: "#fff",
    defect: "#fff",
    history: "#fff",
    dailyReport: "#fff",
    weekly: "#fff",
    admin: "#fff",
    settings: "#fff",
  },
  DesktopSidebar: ({
    activeTab,
    onTabChange,
    onOpenAdminPinEntry,
    visibleTabs,
  }: {
    activeTab: DesktopTabId;
    onTabChange: (tab: DesktopTabId) => void;
    onOpenAdminPinEntry: () => void;
    visibleTabs: DesktopTabId[];
  }) => (
    <nav data-testid="sidebar-visible-tabs" data-visible-tabs={visibleTabs.join(",")}>
      <button type="button" onClick={onOpenAdminPinEntry}>admin pin entry</button>
      {sidebarTabs.map((tab) => (
        <button
          key={tab}
          type="button"
          aria-current={activeTab === tab ? "page" : undefined}
          onClick={() => onTabChange(tab)}
        >
          {tab}
        </button>
      ))}
    </nav>
  ),
}));

vi.mock("../DesktopTopbar", () => ({
  DesktopTopbar: ({ title, titleAddon, actionSlot }: { title: string; titleAddon?: ReactNode; actionSlot?: ReactNode }) => (
    <header>
      {title}
      <div data-testid="desktop-topbar-title-addon">{titleAddon}</div>
      <div data-testid="desktop-topbar-actions">{actionSlot}</div>
    </header>
  ),
}));

vi.mock("../DesktopInventoryView", () => ({ DesktopInventoryView: () => {
  if (slowDashboard.pending) throw slowDashboard.promise;
  return <main>dashboard content</main>;
} }));

it("updates the selected menu and header before a slow destination renders", () => {
  window.history.replaceState(null, "", "/mes?tab=history");
  render(<Suspense fallback={<div>root loading</div>}><DesktopMesShell /></Suspense>);
  slowDashboard.pending = true;
  try {
    fireEvent.click(screen.getByRole("button", { name: "dashboard", exact: true }));
    expect(screen.getByRole("button", { name: "dashboard", exact: true })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("banner")).toHaveTextContent("대시보드");
    expect(screen.getByRole("status", { name: "대시보드 화면을 불러오는 중입니다" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "history", exact: true }));
    expect(screen.getByText("history content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "history", exact: true })).toHaveAttribute("aria-current", "page");
  } finally {
    slowDashboard.pending = false;
  }
});

it("keeps the dashboard filter controls visible while the screen is preparing", () => {
  window.history.replaceState(null, "", "/mes?tab=history");
  render(<Suspense fallback={<div>root loading</div>}><DesktopMesShell /></Suspense>);
  slowDashboard.pending = true;
  try {
    fireEvent.click(screen.getByRole("button", { name: "dashboard", exact: true }));

    expect(screen.getByRole("status", { name: "대시보드 화면을 불러오는 중입니다" })).toBeInTheDocument();
    const kpiButtons = screen.getAllByRole("status", { name: "집계 중" }).map((status) => status.closest("button"));
    expect(kpiButtons).toHaveLength(4);
    expect(kpiButtons.map((button) => button?.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining("전체"),
      expect.stringContaining("정상"),
      expect.stringContaining("부족"),
      expect.stringContaining("품절"),
    ]));
    expect(screen.getByRole("textbox", { name: "자재 검색" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "필터", exact: true })).toBeDisabled();
  } finally {
    slowDashboard.pending = false;
  }
});

it("does not animate the dashboard skeleton before the real screen is ready", () => {
  window.history.replaceState(null, "", "/mes?tab=history");
  render(<Suspense fallback={<div>root loading</div>}><DesktopMesShell /></Suspense>);
  slowDashboard.pending = true;
  try {
    fireEvent.click(screen.getByRole("button", { name: "dashboard", exact: true }));

    expect(screen.getByRole("status", { name: "대시보드 화면을 불러오는 중입니다" })).toBeInTheDocument();
    expect(screen.getByTestId("desktop-tab-transition")).not.toHaveClass("animate-desktop-tab-enter");
  } finally {
    slowDashboard.pending = false;
  }
});
vi.mock("../DesktopWarehouseView", () => ({
  DesktopWarehouseView: ({ onSubmitSuccess }: { onSubmitSuccess?: () => void }) => {
    const [home, setHome] = useState(true);
    const [draft, setDraft] = useState("");
    useRegisterDirty("warehouse-test", !!draft, () => {}, undefined, { mode: "confirm-only" });
    useDesktopTabHome("warehouse-test", { isHome: home, returnHome: () => { setHome(true); setDraft(""); } });
    return (
    <main>
      <input aria-label="테스트 작업 입력" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <span>{home ? "warehouse home" : "warehouse detail"}</span>
      <button onClick={() => setHome(false)}>warehouse detail entry</button>
      <button type="button" onClick={() => onSubmitSuccess?.()}>warehouse submit</button>
    </main>
    );
  },
}));
vi.mock("../DesktopShippingView", () => ({
  DesktopShippingView: (props: Record<string, unknown>) => {
    const [home, setHome] = useState(true);
    useDesktopTabHome("shipping-test", { isHome: home, returnHome: () => setHome(true) });
    shippingViewProps(props);
    return <main>shipping content<button onClick={() => setHome(false)}>shipping detail entry</button></main>;
  },
}));
vi.mock("../DesktopDefectView", () => ({
  DesktopDefectView: () => {
    const [view, setView] = useState(window.history.state?.defect ?? "hub");
    useDesktopTabHome("defect-test", { isHome: view === "hub", returnHome: () => setView("hub") });
    defectViewStates(view);
    return <main>defect content<button onClick={() => setView("list")}>defect detail entry</button></main>;
  },
}));
vi.mock("../DesktopHistoryView", () => ({ DesktopHistoryView: () => {
  if (slowHistory.pending) throw slowHistory.promise;
  return <main>history content</main>;
} }));

it("keeps summary card details while the history screen is preparing", () => {
  window.history.replaceState(null, "", "/mes?tab=history");
  render(<Suspense fallback={<div>root loading</div>}><DesktopMesShell /></Suspense>);
  fireEvent.click(screen.getByRole("button", { name: "dashboard", exact: true }));
  slowHistory.pending = true;
  try {
    fireEvent.click(screen.getByRole("button", { name: "history", exact: true }));
    expect(screen.getByRole("status", { name: "입출고 내역 화면을 불러오는 중입니다" })).toBeInTheDocument();
    expect(screen.getByText("창고 재고가 움직인 작업")).toBeInTheDocument();
    expect(screen.getByText("부서 재고가 움직인 작업")).toBeInTheDocument();
    expect(screen.getByText("실수량 확인과 재고 조정 작업")).toBeInTheDocument();
    expect(screen.getAllByLabelText("집계 중")).toHaveLength(4);
    expect(screen.getByPlaceholderText("작업 · 품명 · 코드 · 담당자 · 메모")).toBeDisabled();
    expect(screen.getByRole("button", { name: "전체", exact: true })).toBeDisabled();
    expect(screen.getByRole("button", { name: "필터", exact: true })).toBeDisabled();
    expect(screen.getByRole("button", { name: "달력", exact: true })).toBeDisabled();
  } finally {
    slowHistory.pending = false;
  }
});
vi.mock("../DesktopDailyWorkReportView", async () => {
  const { useEffect } = await import("react");
  return {
    DesktopDailyWorkReportView: ({ onTopbarControlsChange }: { onTopbarControlsChange?: (node: ReactNode | null) => void }) => {
      useEffect(() => {
        onTopbarControlsChange?.(<span>daily topbar controls</span>);
        return () => onTopbarControlsChange?.(null);
      }, [onTopbarControlsChange]);
      return <main>daily report content</main>;
    },
  };
});
vi.mock("../DesktopWeeklyReportView", () => ({ DesktopWeeklyReportView: () => <main>weekly content</main> }));
vi.mock("../DesktopAdminView", async () => {
  const { useEffect } = await import("react");
  return {
    DesktopAdminView: () => {
      useEffect(() => {
        adminViewMounts();
      }, []);
      return <main>admin content</main>;
    },
  };
});
vi.mock("../DesktopWarehouseMapTab", () => ({ DesktopWarehouseMapTab: () => {
  const [detail, setDetail] = useState(false);
  useDesktopTabHome("map-test", { isHome: !detail, returnHome: () => setDetail(false) });
  return <main>warehouse map content<button onClick={() => setDetail(true)}>map detail entry</button></main>;
} }));
vi.mock("../CapacityDetailModal", () => ({ CapacityDetailModal: () => <div /> }));
vi.mock("../_weekly_sections/WeeklyWeekPicker", () => ({
  WeeklyWeekPicker: () => <div />,
  getWeekStartMonday: () => new Date("2026-08-31T00:00:00+09:00"),
}));

describe("DesktopMesShell tab transition", () => {
  const originalStartViewTransition = document.startViewTransition;
  it.each(["manager", "visible-worker", "hidden-worker"])("preserves the stocktake URL while the operator restores on desktop remount: %s", outcome => {
    operatorState.current = null;
    stocktakeMenuState.data = undefined;
    stocktakeMenuState.isLoading = false;
    window.history.replaceState({}, "", "/mes?tab=stocktake");
    const { rerender } = render(<DesktopMesShell />);
    expect(routerReplace).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?tab=stocktake");
    expect(screen.getByRole("status", { name: "재고 전수조사 준비 중" })).toBeInTheDocument();
    expect(screen.queryByText("stocktake content")).not.toBeInTheDocument();

    operatorState.current = { employee_id: "restored-worker", name: "작업자", department: "조립", department_role: outcome === "manager" ? "primary" : "none", hidden_sidebar_tabs: [] };
    stocktakeMenuState.data = { enabled: false, employee_visible: outcome !== "hidden-worker", participant_departments: ["조립"], participant_count: 1 };
    rerender(<DesktopMesShell />);
    if (outcome === "hidden-worker") {
      expect(screen.queryByText("stocktake content")).not.toBeInTheDocument();
      expect(screen.getByText("dashboard content")).toBeInTheDocument();
      expect(routerReplace).toHaveBeenCalledWith("?tab=dashboard", { scroll: false });
    } else {
      expect(routerReplace).not.toHaveBeenCalled();
      expect(screen.getByText("stocktake content")).toBeInTheDocument();
    }
  });
  it.each(["ON", "OFF", "error"])("초기 전수조사 URL은 표시 조회 대기 후 %s 결과에 따라 진입한다", outcome => {
    operatorState.current = { employee_id: "worker-a", name: "작업자", department: "조립", hidden_sidebar_tabs: ["stocktake"] };
    stocktakeMenuState.data = undefined;
    stocktakeMenuState.isLoading = true;
    window.history.replaceState({}, "", "/mes?tab=stocktake");
    const { rerender } = render(<DesktopMesShell />);
    expect(window.location.search).toBe("?tab=stocktake");
    expect(screen.getByRole("status", { name: "재고 전수조사 준비 중" })).toBeInTheDocument();
    expect(screen.queryByText("stocktake content")).not.toBeInTheDocument();
    expect(stocktakeFlush).not.toHaveBeenCalled();
    stocktakeMenuState.isLoading = false;
    stocktakeMenuState.data = outcome === "error" ? undefined : { enabled: outcome === "ON", employee_visible: outcome === "ON", participant_departments: ["조립"], participant_count: 1 };
    rerender(<DesktopMesShell />);
    if (outcome === "ON") expect(screen.getByText("stocktake content")).toBeInTheDocument();
    else {
      expect(screen.queryByText("stocktake content")).not.toBeInTheDocument();
      expect(screen.getByText("dashboard content")).toBeInTheDocument();
    }
  });

  it("opens the stocktake screen through the real desktop render branch", () => {
    operatorState.current = { employee_id: "employee-a", name: "작업자", department: "조립", hidden_sidebar_tabs: [] };
    render(<DesktopMesShell />);
    fireEvent.click(screen.getByRole("button", { name: "stocktake", exact: true }));
    expect(screen.getByText("stocktake content")).toBeInTheDocument();
  });

  it("일괄 OFF에서 직접 진입을 막고 로그인 중 ON 변경을 사이드바에 반영한다", () => {
    operatorState.current = { employee_id: "employee-a", name: "작업자", department: "조립", hidden_sidebar_tabs: [] };
    stocktakeMenuState.data = { enabled: false, employee_visible: false, participant_departments: ["조립"], participant_count: 1 };
    window.history.replaceState({}, "", "/mes?tab=stocktake");
    const { rerender } = render(<DesktopMesShell />);
    expect(screen.queryByText("stocktake content")).not.toBeInTheDocument();
    expect(screen.getByTestId("sidebar-visible-tabs").getAttribute("data-visible-tabs")?.split(",")).not.toContain("stocktake");
    stocktakeMenuState.data = { enabled: true, employee_visible: true, participant_departments: ["조립"], participant_count: 1 };
    rerender(<DesktopMesShell />);
    expect(screen.getByTestId("sidebar-visible-tabs").getAttribute("data-visible-tabs")?.split(",")).toContain("stocktake");
    fireEvent.click(screen.getByRole("button", { name: "stocktake", exact: true }));
    expect(screen.getByText("stocktake content")).toBeInTheDocument();
  });
  it.each([{ department_role: "primary" }, { department_role: "deputy" }, { level: "admin", department_role: "none" }])("관리자 전수조사 진입은 일괄 OFF에도 유지한다: %j", manager => {
    operatorState.current = { employee_id: "manager-a", name: "관리자", department: "연구", hidden_sidebar_tabs: [], ...manager };
    stocktakeMenuState.data = { enabled: false, employee_visible: true, participant_departments: ["조립"], participant_count: 1 };
    render(<DesktopMesShell />);
    expect(screen.getByTestId("sidebar-visible-tabs").getAttribute("data-visible-tabs")?.split(",")).toContain("stocktake");
    fireEvent.click(screen.getByRole("button", { name: "stocktake", exact: true }));
    expect(screen.getByText("stocktake content")).toBeInTheDocument();
  });
  it("일괄 OFF를 받아도 전수조사 초안 저장이 끝나기 전에는 본문을 보존한다", async () => {
    let finish!: () => void;
    stocktakeFlush.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    operatorState.current = { employee_id: "worker-a", name: "작업자", department: "조립", hidden_sidebar_tabs: [] };
    const { rerender } = render(<DesktopMesShell />);
    fireEvent.click(screen.getByRole("button", { name: "stocktake", exact: true }));
    stocktakeMenuState.data = { enabled: false, employee_visible: false, participant_departments: ["조립"], participant_count: 1 };
    rerender(<DesktopMesShell />);
    expect(screen.getByText("stocktake content")).toBeInTheDocument();
    expect(stocktakeFlush).toHaveBeenCalledOnce();
    expect(screen.getByTestId("sidebar-visible-tabs").getAttribute("data-visible-tabs")?.split(",")).not.toContain("stocktake");
    await act(async () => { finish(); });
    await waitFor(() => expect(screen.queryByText("stocktake content")).not.toBeInTheDocument());
    expect(screen.getByText("dashboard content")).toBeInTheDocument();
  });
  it("일괄 OFF 후 저장 실패나 미확정 명령이면 전수조사 본문을 유지한다", async () => {
    stocktakeFlush.mockRejectedValueOnce(new Error("unresolved command"));
    operatorState.current = { employee_id: "worker-a", name: "작업자", department: "조립", hidden_sidebar_tabs: [] };
    const { rerender } = render(<DesktopMesShell />);
    fireEvent.click(screen.getByRole("button", { name: "stocktake", exact: true }));
    stocktakeMenuState.data = { enabled: false, employee_visible: false, participant_departments: ["조립"], participant_count: 1 };
    rerender(<DesktopMesShell />);
    await act(async () => {});
    expect(stocktakeFlush).toHaveBeenCalledOnce();
    expect(screen.getByText("stocktake content")).toBeInTheDocument();
  });

  it("숨긴 전수조사는 사이드바에서 제외하고 직접 URL 및 콜백 진입도 제한한다", () => {
    operatorState.current = { employee_id: "employee-hidden", name: "작업자", department: "조립", hidden_sidebar_tabs: ["stocktake"] };
    stocktakeMenuState.data = { enabled: true, employee_visible: false, participant_departments: ["조립"], participant_count: 1 };
    window.history.replaceState({}, "", "/mes?tab=stocktake");
    render(<DesktopMesShell />);
    expect(screen.getByTestId("sidebar-visible-tabs").getAttribute("data-visible-tabs")?.split(",")).not.toContain("stocktake");
    expect(screen.queryByText("stocktake content")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "stocktake", exact: true }));
    expect(screen.queryByText("stocktake content")).not.toBeInTheDocument();
    expect(screen.getByText("dashboard content")).toBeInTheDocument();
  });

  it("일괄 OFF 후 개인 켜기를 서버에서 받으면 이전 로그인 숨김과 무관하게 표시한다", () => {
    operatorState.current = { employee_id: "worker-a", name: "작업자", department: "조립", hidden_sidebar_tabs: ["stocktake"] };
    stocktakeMenuState.data = { enabled: false, employee_visible: true, participant_departments: ["조립"], participant_count: 1 };
    render(<DesktopMesShell />);
    fireEvent.click(screen.getByRole("button", { name: "stocktake", exact: true }));
    expect(screen.getByText("stocktake content")).toBeInTheDocument();
  });

  beforeEach(() => {
    stocktakeMenuState.isLoading = false;
    stocktakeFlush.mockReset().mockResolvedValue(undefined);
    stocktakeMenuState.data = { enabled: true, employee_visible: true, participant_departments: ["조립"], participant_count: 1 };
    operatorState.current = null;
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    window.history.replaceState({}, "", "/mes?tab=history");
    routerPush.mockClear();
    routerReplace.mockClear();
    queryClientMock.prefetchQuery.mockClear();
    shippingViewProps.mockClear();
    adminViewMounts.mockClear();
    defectViewStates.mockClear();
    vi.mocked(sendClientEvent).mockClear();
    setAuditScreen.mockClear();
  });

  afterEach(() => {
    document.startViewTransition = originalStartViewTransition;
    vi.unstubAllGlobals();
  });

  it("전역 검색 진입점을 표시하지 않는다", () => {
    render(<DesktopMesShell />);
    expect(screen.getByTestId("desktop-topbar-actions")).toBeEmptyDOMElement();
  });

  it("실제 경고 취소는 URL과 입력을 유지하고 폐기 복귀에만 한 번 모션을 재생한다", () => {
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    render(<DesktopMesShell />);
    const menu = screen.getByRole("button", { name: "warehouse", exact: true });
    fireEvent.click(menu);
    const body = screen.getByTestId("desktop-tab-transition");
    Object.defineProperty(body, "animate", { value: animate });
    fireEvent.click(screen.getByText("warehouse detail entry"));
    fireEvent.change(screen.getByLabelText("테스트 작업 입력"), { target: { value: "미저장" } });
    window.history.replaceState({ keep: true }, "", "/mes?tab=warehouse&section=mine&unrelated=keep");
    const length = window.history.length;
    fireEvent.click(menu);
    fireEvent.click(screen.getByText("계속 머무르기"));
    expect(window.location.search).toContain("section=mine");
    expect(screen.getByLabelText("테스트 작업 입력")).toHaveValue("미저장");
    expect(animate).not.toHaveBeenCalled();
    fireEvent.click(menu);
    fireEvent.click(screen.getByText("나가기", { exact: true }));
    expect(screen.getByTestId("desktop-tab-transition")).toBe(body);
    expect(window.location.search).toBe("?tab=warehouse&unrelated=keep");
    expect(window.history.state).toMatchObject({ keep: true });
    expect(window.history.length).toBe(length + 1);
    expect(animate).toHaveBeenCalledWith([{ opacity: 0.7 }, { opacity: 1 }], { duration: 180, easing: "ease-out" });
    fireEvent.click(menu);
    expect(animate).toHaveBeenCalledOnce();
  });

  it.each(["shipping", "defect"] as const)("%s 허브 복귀는 명확한 페이드를 한 번 적용하고 첫 화면 연타에는 재생하지 않는다", (tab) => {
    render(<DesktopMesShell />);
    const menu = screen.getByRole("button", { name: tab, exact: true });
    fireEvent.click(menu);
    const body = screen.getByTestId("desktop-tab-transition");
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    Object.defineProperty(body, "animate", { value: animate });
    fireEvent.click(screen.getByText(`${tab} detail entry`));
    fireEvent.click(menu);
    expect(screen.getByTestId("desktop-tab-transition")).toBe(body);
    expect(animate).toHaveBeenCalledWith([{ opacity: 0.7 }, { opacity: 1 }], { duration: 180, easing: "ease-out" });
    fireEvent.click(menu);
    expect(animate).toHaveBeenCalledOnce();
  });

  it.each(["warehouse", "warehouseMap"] as const)(
    "%s 현재 탭을 연타해도 화면을 다시 마운트하지 않는다",
    (tab) => {
      render(<DesktopMesShell />);
      const menu = screen.getByRole("button", { name: tab, exact: true });
      fireEvent.click(menu);
      const content = screen.getByRole("main");
      for (let click = 0; click < 5; click += 1) fireEvent.click(menu);
      expect(screen.getByRole("main")).toBe(content);
      expect(routerPush).not.toHaveBeenCalled();
    },
  );

  it("모션 감소 설정에서는 허브 복귀 애니메이션을 실행하지 않는다", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    render(<DesktopMesShell />);
    fireEvent.click(screen.getByRole("button", { name: "shipping", exact: true }));
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    Object.defineProperty(screen.getByTestId("desktop-tab-transition"), "animate", { value: animate });
    fireEvent.click(screen.getByText("shipping detail entry"));
    fireEvent.click(screen.getByRole("button", { name: "shipping", exact: true }));
    expect(animate).not.toHaveBeenCalled();
  });

  it("지도 복귀 기록은 상세 위치만 지우고 다른 브라우저 상태를 보존한다", () => {
    render(<DesktopMesShell />);
    fireEvent.click(screen.getByRole("button", { name: "warehouseMap", exact: true }));
    fireEvent.click(screen.getByText("map detail entry"));
    window.history.replaceState({ wm: { stage: "row", angleId: 1, row: 2 }, wmDepth: 2, unrelated: "keep" }, "", "/mes?tab=warehouseMap&other=keep");
    fireEvent.click(screen.getByRole("button", { name: "warehouseMap", exact: true }));
    expect(window.history.state).toMatchObject({ wmDepth: 0, unrelated: "keep" });
    expect(window.history.state.wm).toBeUndefined();
    expect(window.location.search).toBe("?tab=warehouseMap&other=keep");
  });

  it.each(["step=2", "section=mine", "draftId=draft-1", "stockRequestId=request-1"])(
    "입출고 하위 화면(%s)에서는 기존 첫 메뉴 복귀를 유지한다",
    (query) => {
      render(<DesktopMesShell />);
      const menu = screen.getByRole("button", { name: "warehouse", exact: true });
      fireEvent.click(menu);
      const content = screen.getByRole("main");
      window.history.replaceState({}, "", `/mes?tab=warehouse&${query}`);
      fireEvent.click(screen.getByText("warehouse detail entry"));
      fireEvent.click(menu);
      expect(screen.getByRole("main")).toBe(content);
      expect(screen.getByText("warehouse home")).toBeInTheDocument();
      expect(window.location.search).toBe("?tab=warehouse");
    },
  );

  it("품목 전환 중에는 같은 입출고 탭으로 첫 메뉴에 복귀한다", () => {
    render(<DesktopMesShell />);
    const menu = screen.getByRole("button", { name: "warehouse", exact: true });
    fireEvent.click(menu);
    const content = screen.getByRole("main");
    window.history.replaceState({ wic: 1 }, "", "/mes?tab=warehouse");
    fireEvent.click(screen.getByText("warehouse detail entry"));
    fireEvent.click(menu);
    expect(screen.getByRole("main")).toBe(content);
    expect(screen.getByText("warehouse home")).toBeInTheDocument();
    expect(window.history.state.wic).toBeUndefined();
  });

  it.each(["warehouse", "defect", "settings"] as const)(
    "%s 정적 허브는 공용 카드 스켈레톤 없이 즉시 렌더링한다",
    (tab) => {
      render(<DesktopMesShell />);

      fireEvent.click(screen.getByRole("button", { name: tab }));

      expect(screen.queryByRole("status", { name: `${tab === "warehouse" ? "입출고" : tab === "defect" ? "불량" : "설정"} 화면을 불러오는 중입니다` })).not.toBeInTheDocument();
    },
  );

  it("commits a tab click immediately and updates the URL without App Router navigation", () => {
    document.startViewTransition = vi.fn();
    const pushState = vi.spyOn(window.history, "pushState");

    render(<DesktopMesShell />);

    expect(screen.getByText("history content")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "weekly" }));

    expect(document.startViewTransition).not.toHaveBeenCalled();
    expect(screen.getByText("weekly content")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveTextContent("주간보고");
    expect(screen.getByRole("button", { name: "weekly" })).toHaveAttribute("aria-current", "page");
    expect(pushState).toHaveBeenCalledWith(null, "", "?tab=weekly");
    expect(routerPush).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
    expect(sendClientEvent).toHaveBeenCalledWith({
      event: "ui_nav",
      from: "history",
      to: "weekly",
      path: "/mes",
      screen_key: "desktop.weekly",
      screen_label: "주간보고",
      source: "desktop",
    });
    expect(setAuditScreen).toHaveBeenLastCalledWith({ key: "desktop.weekly", label: "주간보고" });
  });

  it("prefetches the default history page before the first history tab visit", () => {
    document.title = "MES 개발";
    render(<DesktopMesShell />);
    expect(document.title).toBe("MES 개발");

    expect(queryClientMock.prefetchQuery.mock.calls[0][0].queryKey.slice(0, 2)).toEqual([
      "transactions",
      "displayGroups",
    ]);
    expect(queryClientMock.prefetchQuery).toHaveBeenCalledWith(expect.objectContaining({
      queryKey: [
        "transactions",
        "displayGroups",
        expect.objectContaining({ limit: 100, cursor: null }),
      ],
    }));
    expect(queryClientMock.prefetchQuery).toHaveBeenCalledWith(expect.objectContaining({
      queryKey: [
        "transactions",
        "summary",
        expect.objectContaining({ dateFrom: expect.any(String) }),
      ],
    }));
  });

  it("prefetches the current KST Monday through Sunday", () => {
    render(<DesktopMesShell />);

    expect(queryClientMock.prefetchQuery).toHaveBeenCalledWith(expect.objectContaining({
      queryKey: ["weekly", "report", "2026-08-31", "2026-09-06"],
    }));
  });

  it("does not wire the abolished shipping preparation entry into the shell", () => {
    render(<DesktopMesShell />);

    fireEvent.click(screen.getByRole("button", { name: "shipping" }));
    expect(shippingViewProps).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ onStartPrepareWork: expect.any(Function) }),
    );
  });

  it.each(sidebarTabs)("applies the shared content transition when navigating to %s", (tab) => {
    if (tab === "stocktake") operatorState.current = { employee_id: "employee-a", name: "작업자", department: "조립", hidden_sidebar_tabs: [] };
    render(<DesktopMesShell />);

    fireEvent.click(screen.getByRole("button", { name: tab }));

    expect(screen.getByTestId("desktop-tab-transition")).toHaveAttribute("data-active-tab", tab);
    expect(screen.getByTestId("desktop-tab-transition")).toHaveClass("animate-desktop-navigation-enter");
  });

  it.each(["dashboard", "history"] as const)("%s retains the skeleton over ready content until the dissolve ends", async (tab) => {
    window.history.replaceState({}, "", `/mes?tab=${tab === "dashboard" ? "history" : "dashboard"}`);
    const slow = tab === "dashboard" ? slowDashboard : slowHistory;
    let resolve!: () => void;
    slow.promise = new Promise<void>((done) => { resolve = done; });
    render(<Suspense fallback={<div>root loading</div>}><DesktopMesShell /></Suspense>);
    slow.pending = true;
    try {
      fireEvent.click(screen.getByRole("button", { name: tab, exact: true }));
      const cover = screen.getByTestId("desktop-loading-cover");
      expect(cover).not.toHaveAttribute("aria-hidden");

      await act(async () => {
        slow.pending = false;
        resolve();
        await slow.promise;
      });

      expect(screen.getByText(`${tab} content`)).toBeInTheDocument();
      expect(screen.getByTestId("desktop-loading-cover")).toBe(cover);
      expect(cover).toHaveAttribute("aria-hidden", "true");
      expect(cover).toHaveAttribute("inert");
      expect(cover).toHaveClass("desktop-loading-cover-exit");
      await waitFor(() => expect(screen.queryByTestId("desktop-loading-cover")).not.toBeInTheDocument());
    } finally {
      slow.pending = false;
      resolve();
    }
  });

  it("does not restart the shared transition when the active tab is refreshed", () => {
    render(<DesktopMesShell />);
    const transition = screen.getByTestId("desktop-tab-transition");

    fireEvent.click(screen.getByRole("button", { name: "history" }));

    expect(screen.getByTestId("desktop-tab-transition")).toBe(transition);
  });

  it("returns an active defect tab to the hub when its sidebar button is selected again", async () => {
    window.history.replaceState({ defect: "storage" }, "", "/mes?tab=defect");

    render(<DesktopMesShell />);

    expect(defectViewStates).toHaveBeenLastCalledWith("storage");

    fireEvent.click(screen.getByRole("button", { name: "defect" }));

    await waitFor(() => expect(defectViewStates).toHaveBeenLastCalledWith("hub"));
    expect(window.history.state).toMatchObject({ defect: "hub" });
  });

  it("shows daily report controls in the top bar only while the daily tab is active", () => {
    window.history.replaceState({}, "", "/mes?tab=dailyReport");

    render(<DesktopMesShell />);

    expect(screen.getByTestId("desktop-topbar-title-addon")).toHaveTextContent("daily topbar controls");
    fireEvent.click(screen.getByRole("button", { name: "history" }));
    expect(screen.getByTestId("desktop-topbar-title-addon")).toBeEmptyDOMElement();
  });

  it("opens settings from a direct tab URL even when it is not an employee-visible business tab", () => {
    window.history.replaceState({}, "", "/mes?tab=settings");

    render(<DesktopMesShell />);

    expect(screen.getByRole("banner")).toHaveTextContent("설정");
    expect(screen.getByRole("button", { name: "settings" })).toHaveAttribute("aria-current", "page");
  });

  it("remounts the admin PIN entry when requested from an already active admin tab", async () => {
    render(<DesktopMesShell />);

    fireEvent.click(screen.getByRole("button", { name: "admin pin entry" }));
    await waitFor(() => expect(adminViewMounts).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "admin pin entry" }));
    await waitFor(() => expect(adminViewMounts).toHaveBeenCalledTimes(2));
  });

  it.each(["dashboard", "history", "dailyReport", "weekly"] as const)(
    "keeps 12px top spacing for the %s tab content after navigation",
    (tab) => {
      const { container } = render(<DesktopMesShell />);

      fireEvent.click(screen.getByRole("button", { name: tab }));

      expect(container.querySelector(".desktop-tab-content")).toHaveClass("mt-3");
    },
  );

  it.each(["dashboard", "history", "warehouse", "shipping", "defect", "warehouseMap"] as const)(
    "keeps the %s shell gutter on the page background",
    (tab) => {
      render(<DesktopMesShell />);

      fireEvent.click(screen.getByRole("button", { name: tab }));

      expect(screen.getByTestId("desktop-shell-frame")).toHaveStyle({ background: "var(--c-bg)" });
    },
  );

  it("keeps the weekly report shell gutter unchanged", () => {
    render(<DesktopMesShell />);

    fireEvent.click(screen.getByRole("button", { name: "weekly" }));

    expect(screen.getByTestId("desktop-shell-frame")).toHaveStyle({ background: "var(--c-bg)" });
  });
});
