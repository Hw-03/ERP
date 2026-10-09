/* eslint-disable @next/next/no-img-element */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendClientEvent } from "@/lib/client-events";
import type { Employee } from "@/lib/api";
import { clearCurrentOperator, readCurrentOperator, setCurrentOperator, useCurrentOperator, type Operator } from "../useCurrentOperator";

const state = vi.hoisted(() => ({ getAppSession: vi.fn(), getEmployees: vi.fn(), getWeeklyReport: vi.fn(), getMap: vi.fn() }));
vi.mock("next/image", () => ({ default: ({ alt = "", ...props }: Record<string, unknown>) => <img alt={String(alt)} {...props} /> }));
vi.mock("@/lib/api", () => ({ api: { getAppSession: state.getAppSession, getEmployees: state.getEmployees, getWeeklyReport: state.getWeeklyReport } }));
vi.mock("@/lib/api/warehouse-map", () => ({ warehouseMapApi: { getMap: state.getMap } }));
vi.mock("@/lib/client-events", () => ({ sendClientEvent: vi.fn() }));
vi.mock("../OperatorLoginCard", () => ({ OperatorLoginCard: () => <div>Login form</div> }));
import { MesLoginGate } from "../MesLoginGate";

const operator: Operator = { employee_id: "emp-1", employee_code: "E1", name: "작업자", role: "직원", department: "창고", warehouse_role: "primary", department_role: "none", as_research_approver: false, assigned_model_slots: [], io_enabled: true, hidden_sidebar_tabs: [], loginPopupEnabled: true, theme: "dark", sidebar_mode: "expanded" };
const employee = (patch: Partial<Employee> = {}): Employee => ({ employee_id: operator.employee_id, employee_code: "E1", name: "작업자", role: "직원", department: "창고", warehouse_role: "primary", department_role: "none", as_research_approver: false, assigned_model_slots: [], io_enabled: true, hidden_sidebar_tabs: [], login_notification_popup_enabled: true, is_active: true, phone: null, display_order: 1, created_at: "2026-10-07T00:00:00Z", updated_at: "2026-10-07T00:00:00Z", theme: "light", sidebar_mode: "hover", ...patch });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; }
function Content() { const op = useCurrentOperator(); return <><input aria-label="작성 수량" defaultValue="7" /><span>역할 {op?.warehouse_role}</span></>; }
async function openGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendered = render(<QueryClientProvider client={client}><MesLoginGate><Content /></MesLoginGate></QueryClientProvider>);
  await screen.findByLabelText("작성 수량");
  vi.mocked(sendClientEvent).mockClear();
  return rendered;
}
async function focus() {
  const before = state.getEmployees.mock.calls.length;
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  await waitFor(() => expect(state.getEmployees.mock.calls.length).toBeGreaterThan(before));
}

describe("MesLoginGate focus session refresh", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
    localStorage.clear(); sessionStorage.clear();
    state.getAppSession.mockReset().mockResolvedValue({ boot_id: "boot-1" });
    state.getEmployees.mockReset().mockResolvedValue([employee()]);
    state.getWeeklyReport.mockReset().mockResolvedValue({});
    state.getMap.mockReset().mockResolvedValue({});
    setCurrentOperator(operator, "boot-1");
  });
  afterEach(() => vi.restoreAllMocks());

  it("focus 반영은 회수된 역할·숨김 탭만 갱신하고 입력·appearance·audit를 보존한다", async () => {
    await openGate();
    const input = screen.getByLabelText("작성 수량");
    fireEvent.change(input, { target: { value: "13" } });
    const audit = sessionStorage.getItem("dexcowin_mes_audit_session");
    state.getEmployees.mockResolvedValue([employee({ warehouse_role: "none", hidden_sidebar_tabs: ["warehouse", "defect"], io_enabled: false })]);
    await focus();
    await waitFor(() => expect(screen.getByText("역할 none")).toBeInTheDocument());
    expect(readCurrentOperator()).toMatchObject({ io_enabled: false, hidden_sidebar_tabs: ["warehouse", "defect"], theme: "dark", sidebar_mode: "expanded" });
    expect(input).toHaveValue("13");
    expect(sessionStorage.getItem("dexcowin_mes_audit_session")).toBe(audit);
    expect(sendClientEvent).not.toHaveBeenCalled();
  });

  it("focus에서 비활성화 확인 시 현재 탭 로그인 화면으로 돌아간다", async () => {
    await openGate();
    state.getEmployees.mockResolvedValue([]);
    await focus();
    expect(await screen.findByText("Login form")).toBeInTheDocument();
    expect(readCurrentOperator()).toBeNull();
    expect(screen.queryByLabelText("작성 수량")).not.toBeInTheDocument();
  });

  it("다시 보이는 탭은 직원 정보를 갱신하지만 숨겨진 탭 이벤트는 조회하지 않는다", async () => {
    await openGate();
    const before = state.getEmployees.mock.calls.length;
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(state.getEmployees).toHaveBeenCalledTimes(before);
    state.getEmployees.mockResolvedValue([employee({ department_role: "deputy", as_research_approver: true })]);
    visibility.mockReturnValue("visible");
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(readCurrentOperator()).toMatchObject({ department_role: "deputy", as_research_approver: true }));
  });

  it("focus에서 서버 재시작을 확인하면 이전 작업자 세션을 재사용하지 않는다", async () => {
    await openGate();
    state.getAppSession.mockResolvedValue({ boot_id: "boot-2" });
    await focus();
    expect(await screen.findByText("Login form")).toBeInTheDocument();
    expect(readCurrentOperator()).toBeNull();
    expect(sessionStorage.getItem("dexcowin_mes_audit_session")).toBeNull();
  });

  it("focus 조회 실패는 초안을 잃지 않고 재시도 후 최신 역할로 복구한다", async () => {
    await openGate();
    const input = screen.getByLabelText("작성 수량");
    state.getEmployees.mockRejectedValue(new Error("offline"));
    await focus();
    await screen.findByRole("alert");
    expect(readCurrentOperator()?.employee_id).toBe("emp-1");
    expect(screen.getByLabelText("작성 수량")).toBe(input);
    state.getEmployees.mockResolvedValue([employee({ warehouse_role: "none" })]);
    fireEvent.click(screen.getByRole("button", { name: "직원 정보 다시 확인" }));
    await waitFor(() => expect(readCurrentOperator()?.warehouse_role).toBe("none"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("역순 focus 응답은 최신 회수 상태를 덮어쓰지 않는다", async () => {
    await openGate();
    const old = deferred<Employee[]>();
    state.getEmployees.mockReturnValueOnce(old.promise).mockResolvedValue([employee({ warehouse_role: "none" })]);
    await focus();
    await focus();
    await waitFor(() => expect(readCurrentOperator()?.warehouse_role).toBe("none"));
    await act(async () => old.resolve([employee()]));
    expect(readCurrentOperator()?.warehouse_role).toBe("none");
  });

  it.each(["emp-1", "emp-2"])("로그아웃 뒤 %s로 재로그인하면 이전 focus 응답을 적용하지 않는다", async (id) => {
    await openGate();
    const old = deferred<Employee[]>();
    state.getEmployees.mockReturnValueOnce(old.promise);
    await focus();
    act(() => { clearCurrentOperator(); setCurrentOperator({ ...operator, employee_id: id, warehouse_role: "none" }, "boot-1"); });
    const audit = sessionStorage.getItem("dexcowin_mes_audit_session");
    await act(async () => old.resolve([employee()]));
    expect(readCurrentOperator()).toMatchObject({ employee_id: id, warehouse_role: "none" });
    expect(sessionStorage.getItem("dexcowin_mes_audit_session")).toBe(audit);
  });
});
