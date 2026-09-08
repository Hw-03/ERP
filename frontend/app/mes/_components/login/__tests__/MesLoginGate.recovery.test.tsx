/* eslint-disable @next/next/no-img-element */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Operator } from "../useCurrentOperator";

const state = vi.hoisted(() => ({
  getAppSession: vi.fn(),
  getEmployees: vi.fn(),
  getWeeklyReport: vi.fn(),
  getMap: vi.fn(),
  readCurrentOperator: vi.fn(),
  getStoredBootId: vi.fn(),
  clearCurrentOperator: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: ({ alt = "", ...props }: Record<string, unknown>) => <img alt={String(alt)} {...props} />,
}));
vi.mock("@/lib/api", () => ({ api: {
  getAppSession: state.getAppSession,
  getEmployees: state.getEmployees,
  getWeeklyReport: state.getWeeklyReport,
} }));
vi.mock("@/lib/api/warehouse-map", () => ({ warehouseMapApi: { getMap: state.getMap } }));
vi.mock("../useCurrentOperator", () => ({
  clearCurrentOperator: state.clearCurrentOperator,
  getStoredBootId: state.getStoredBootId,
  readCurrentOperator: state.readCurrentOperator,
}));
vi.mock("../OperatorLoginCard", () => ({ OperatorLoginCard: () => <div>Login form</div> }));

import { MesLoginGate } from "../MesLoginGate";

const stored: Operator = {
  employee_id: "emp-1", name: "김현우", role: "staff", department: "조립", level: "staff",
  employee_code: "E1", warehouse_role: "none", department_role: "none", assigned_model_slots: [],
  io_enabled: true, hidden_sidebar_tabs: [], loginPopupEnabled: false,
};

function renderGate() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MesLoginGate><div>Authenticated content</div></MesLoginGate></QueryClientProvider>);
}

describe("MesLoginGate stored session recovery", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
    state.getAppSession.mockReset();
    state.getEmployees.mockReset();
    state.getWeeklyReport.mockResolvedValue({});
    state.getMap.mockResolvedValue({});
    state.readCurrentOperator.mockReturnValue(stored);
    state.getStoredBootId.mockReturnValue("boot-1");
    state.clearCurrentOperator.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("keeps stored operator and withholds application content when session recovery fails", async () => {
    state.getAppSession.mockRejectedValue(new Error("offline"));

    renderGate();

    await waitFor(() => expect(screen.getByText("로그인 정보를 확인하지 못했습니다.")).toBeInTheDocument());
    expect(state.clearCurrentOperator).not.toHaveBeenCalled();
    expect(screen.queryByText("Authenticated content")).not.toBeInTheDocument();
  });

  it("clears stored operator when the server boot id changed", async () => {
    state.getAppSession.mockResolvedValue({ boot_id: "boot-2" });

    renderGate();

    await waitFor(() => expect(state.clearCurrentOperator).toHaveBeenCalledTimes(1));
  });

  it("clears the stored operator and returns to the login form when the employee is inactive", async () => {
    state.getAppSession.mockResolvedValue({ boot_id: "boot-1" });
    state.getEmployees.mockResolvedValue([{ employee_id: "another-employee" }]);

    renderGate();

    await waitFor(() => expect(state.clearCurrentOperator).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Login form")).toBeInTheDocument();
    expect(screen.queryByText("Authenticated content")).not.toBeInTheDocument();
  });

  it("keeps stored operator when the session response has no boot id", async () => {
    state.getAppSession.mockResolvedValue({ started_at: "2026-09-08T00:00:00Z" });

    renderGate();

    await waitFor(() => expect(screen.getByText("로그인 정보를 확인하지 못했습니다.")).toBeInTheDocument());
    expect(state.getAppSession).toHaveBeenCalledTimes(1);
    expect(state.clearCurrentOperator).not.toHaveBeenCalled();
  });

  it("keeps stored operator when active employee lookup fails", async () => {
    state.getAppSession.mockResolvedValue({ boot_id: "boot-1" });
    state.getEmployees.mockRejectedValue(new Error("offline"));

    renderGate();

    await waitFor(() => expect(screen.getByText("로그인 정보를 확인하지 못했습니다.")).toBeInTheDocument());
    expect(state.clearCurrentOperator).not.toHaveBeenCalled();
    expect(screen.queryByText("Authenticated content")).not.toBeInTheDocument();
  });

  it("keeps stored operator when active employee response is malformed", async () => {
    state.getAppSession.mockResolvedValue({ boot_id: "boot-1" });
    state.getEmployees.mockResolvedValue({ employees: [] });

    renderGate();

    await waitFor(() => expect(screen.getByText("로그인 정보를 확인하지 못했습니다.")).toBeInTheDocument());
    expect(state.getEmployees).toHaveBeenCalledTimes(1);
    expect(state.clearCurrentOperator).not.toHaveBeenCalled();
  });

  it("enters the application after the recovery retry succeeds", async () => {
    state.getAppSession.mockRejectedValue(new Error("offline"));

    renderGate();

    await waitFor(() => expect(screen.getByText("로그인 정보를 확인하지 못했습니다.")).toBeInTheDocument());
    state.getAppSession.mockReset();
    state.getAppSession.mockResolvedValue({ boot_id: "boot-1" });
    state.getEmployees.mockResolvedValue([{ employee_id: "emp-1" }]);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    await waitFor(() => expect(screen.getByText("Authenticated content")).toBeInTheDocument());
  });
});
