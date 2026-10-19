import { act, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type Employee } from "@/lib/api";
import { OperatorAccessSync } from "../OperatorAccessSync";
import { clearCurrentOperator, getOperatorAccessContext, readCurrentOperator, setCurrentOperator, updateCurrentOperatorAccess, type Operator } from "../useCurrentOperator";
import { useCurrentOperator } from "../useCurrentOperator";
import { invalidateOperationalQueries, RealtimeSyncProvider } from "@/lib/queries/realtime";
import { sendClientEvent } from "@/lib/client-events";
import { DesktopSidebar } from "../../DesktopSidebar";
import { MobileMoreScreen } from "../../mobile/screens/MobileMoreScreen";
import { WarehouseSectionTabs } from "../../_warehouse_sections/WarehouseSectionTabs";
import { filterVisibleSidebarTabs, isSidebarTabVisible, SIDEBAR_TAB_IDS, MOBILE_MORE_ENTRY_TAB_IDS } from "../../tabAccess";
import { isDepartmentApprover } from "../../_warehouse_steps";

vi.mock("@/lib/client-events", () => ({ sendClientEvent: vi.fn() }));
vi.mock("@/lib/auth/operator-session", () => ({ revokeOperatorSession: vi.fn(async () => ({ status: "revoked" })) }));
const operator: Operator = { employee_id: "one", employee_code: "E1", name: "직원", role: "사원", department: "조립", warehouse_role: "none", department_role: "none", as_research_approver: false, io_enabled: true, hidden_sidebar_tabs: [], assigned_model_slots: [], loginPopupEnabled: true };
const employee = { ...operator, is_active: true } as Employee;
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })) {
  return { client, ...render(<QueryClientProvider client={client}><OperatorAccessSync employeeId="one" /></QueryClientProvider>) };
}
beforeEach(() => { sessionStorage.clear(); setCurrentOperator(operator, "boot"); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const noop = (): void => {};
function SessionViews() {
  const current = useCurrentOperator();
  return <>
    <div data-testid="pc"><DesktopSidebar activeTab="dashboard" onTabChange={noop} visibleTabs={filterVisibleSidebarTabs(SIDEBAR_TAB_IDS, current)} /></div>
    <div data-testid="mobile"><MobileMoreScreen operator={current} onProfile={noop} onOpenNotifications={noop} onChecklist={noop} onDailyReport={noop} onWeekly={noop} onShipping={noop} onWarehouseMap={noop} visibleEntries={MOBILE_MORE_ENTRY_TAB_IDS.filter((tab) => isSidebarTabVisible(tab, current))} /></div>
    <WarehouseSectionTabs active="compose" onChange={noop} showQueue={current?.warehouse_role === "primary" || current?.warehouse_role === "deputy"} showDeptQueue={isDepartmentApprover(current)} showAsResearchQueue={current?.as_research_approver} />
  </>;
}

describe("OperatorAccessSync", () => {
  it.each(["logout", "switch"] as const)("조회 중 %s 후 도착한 이전 직원 응답을 무시한다", async (action) => {
    const pending = deferred<Employee[]>();
    vi.spyOn(api, "getEmployees").mockReturnValue(pending.promise);
    const view = mount();
    await act(async () => {
      if (action === "logout") await clearCurrentOperator();
      else setCurrentOperator({ ...operator, employee_id: "other" }, "other-boot");
    });
    await act(async () => pending.resolve([{ ...employee, warehouse_role: "primary" }]));
    if (action === "logout") expect(readCurrentOperator()).toBeNull();
    else expect(readCurrentOperator()).toMatchObject({ employee_id: "other", warehouse_role: "none" });
    view.unmount(); view.client.clear();
  });
  it("첫 조회 중 실시간 변경이 오면 이전 요청을 취소하고 최신 권한을 다시 조회한다", async () => {
    const old = deferred<Employee[]>();
    const read = vi.spyOn(api, "getEmployees").mockReturnValueOnce(old.promise).mockResolvedValue([{ ...employee, warehouse_role: "primary" }]);
    const view = mount();
    await waitFor(() => expect(read).toHaveBeenCalledOnce());
    await act(async () => { await invalidateOperationalQueries(view.client); });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(readCurrentOperator()?.warehouse_role).toBe("primary"));
    await act(async () => old.resolve([employee]));
    expect(readCurrentOperator()?.warehouse_role).toBe("primary");
    view.unmount(); view.client.clear();
  });
  it("다른 관리자 저장의 SSE와 재연결을 PC·모바일 메뉴·승인함에 재로그인 없이 반영한다", async () => {
    let receive!: (revision: number) => void;
    let reconnect!: () => void;
    vi.stubGlobal("EventSource", class {
      listener?: (event: MessageEvent<string>) => void;
      onopen: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      constructor() {
        receive = (revision) => this.listener?.(new MessageEvent("revision", { data: JSON.stringify({ revision, updated_at: "2026-10-19T00:00:00Z" }) }));
        reconnect = () => this.onopen?.(new Event("open"));
      }
      addEventListener(_type: string, listener: (event: MessageEvent<string>) => void): void { this.listener = listener; }
      removeEventListener(): void {}
      close(): void {}
    });
    let server = employee;
    const read = vi.spyOn(api, "getEmployees").mockImplementation(async () => [server]);
    vi.mocked(sendClientEvent).mockClear();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const view = render(<QueryClientProvider client={client}><RealtimeSyncProvider><OperatorAccessSync employeeId="one" /><SessionViews /></RealtimeSyncProvider></QueryClientProvider>);
    await waitFor(() => expect(read).toHaveBeenCalledOnce());
    server = { ...employee, warehouse_role: "primary", department_role: "deputy", as_research_approver: true, hidden_sidebar_tabs: ["shipping"] };
    act(() => receive(7));
    await waitFor(() => expect(screen.getByRole("tab", { name: /창고 승인함/ })).toBeInTheDocument());
    expect(screen.getByRole("tab", { name: /부서 승인함/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /AS·연구 승인함/ })).toBeInTheDocument();
    expect(within(screen.getByTestId("pc")).queryByRole("button", { name: /^출하/ })).not.toBeInTheDocument();
    expect(within(screen.getByTestId("mobile")).queryByRole("button", { name: /^출하/ })).not.toBeInTheDocument();
    server = employee;
    act(() => receive(8));
    await waitFor(() => expect(screen.queryByRole("tab", { name: /창고 승인함/ })).not.toBeInTheDocument());
    expect(within(screen.getByTestId("mobile")).getByRole("button", { name: /^출하/ })).toBeInTheDocument();
    server = { ...employee, hidden_sidebar_tabs: ["shipping"] };
    act(() => reconnect());
    await waitFor(() => expect(within(screen.getByTestId("mobile")).queryByRole("button", { name: /^출하/ })).not.toBeInTheDocument());
    expect(sendClientEvent).not.toHaveBeenCalled();
    view.unmount(); client.clear();
  });
  it("최초의 오래된 캐시를 건너뛰고 서버의 메뉴와 결재 역할을 반영한다", async () => {
    const pending = deferred<Employee[]>();
    const read = vi.spyOn(api, "getEmployees").mockReturnValue(pending.promise);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const context = getOperatorAccessContext()!;
    client.setQueryData(["employees", "access", "one", context.login], { employee: { ...employee, warehouse_role: "primary" }, context });
    const view = mount(client);
    expect(readCurrentOperator()?.warehouse_role).toBe("none");
    await act(async () => pending.resolve([{ ...employee, department_role: "deputy", as_research_approver: true, hidden_sidebar_tabs: ["shipping"] }]));
    await waitFor(() => expect(readCurrentOperator()).toMatchObject({ warehouse_role: "none", department_role: "deputy", as_research_approver: true, hidden_sidebar_tabs: ["shipping"] }));
    expect(read).toHaveBeenCalledOnce();
    view.unmount(); client.clear();
  });

  it("본인 저장 전에 시작된 조회가 늦게 와도 저장 결과를 되돌리지 않는다", async () => {
    const pending = deferred<Employee[]>();
    vi.spyOn(api, "getEmployees").mockReturnValue(pending.promise);
    const view = mount();
    act(() => { updateCurrentOperatorAccess({ ...operator, warehouse_role: "primary" }); });
    await act(async () => pending.resolve([employee]));
    expect(readCurrentOperator()?.warehouse_role).toBe("primary");
    view.unmount(); view.client.clear();
  });

  it("오래된 캐시가 있어도 최초 서버 조회가 실패하면 로그인 권한을 유지한다", async () => {
    const read = vi.spyOn(api, "getEmployees").mockRejectedValue(new Error("조회 실패"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const context = getOperatorAccessContext()!;
    client.setQueryData(["employees", "access", "one", context.login], { employee: { ...employee, warehouse_role: "primary" }, context });
    const view = mount(client);
    await waitFor(() => expect(read).toHaveBeenCalledOnce());
    await waitFor(() => expect(client.getQueryState(["employees", "access", "one", context.login])?.status).toBe("error"));
    expect(readCurrentOperator()?.warehouse_role).toBe("none");
    view.unmount(); client.clear();
  });

  it("같은 직원의 재로그인 이전 응답과 실패한 조회를 적용하지 않는다", async () => {
    const pending = deferred<Employee[]>();
    const read = vi.spyOn(api, "getEmployees").mockReturnValueOnce(pending.promise).mockRejectedValue(new Error("조회 실패"));
    const view = mount();
    act(() => setCurrentOperator(operator, "boot"));
    await act(async () => pending.resolve([{ ...employee, department_role: "primary" }]));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(readCurrentOperator()?.department_role).toBe("none");
    view.unmount(); view.client.clear();
  });
});
