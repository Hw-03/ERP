/* eslint-disable @next/next/no-img-element */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { readCurrentOperator, setCurrentOperator, useCurrentOperator, type Operator } from "../mes/_components/login/useCurrentOperator";
import NotFound from "../not-found";

const state = vi.hoisted(() => ({ pathname: "/mes/missing", push: vi.fn(), getEmployees: vi.fn(), getAppSession: vi.fn(), getWeeklyReport: vi.fn(), getMap: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname, useRouter: () => ({ push: state.push }) }));
vi.mock("next/image", () => ({ default: ({ alt = "", ...props }: Record<string, unknown>) => <img alt={String(alt)} {...props} /> }));
vi.mock("@/lib/client-events", () => ({ sendClientEvent: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { getAppSession: state.getAppSession, getEmployees: state.getEmployees, getWeeklyReport: state.getWeeklyReport } }));
vi.mock("@/lib/api/warehouse-map", () => ({ warehouseMapApi: { getMap: state.getMap } }));
vi.mock("@/lib/api/employees", () => ({ employeesApi: { getEmployeeAppearance: vi.fn(() => Promise.resolve({ employee_id: "emp-1", theme: "light", sidebar_mode: "hover" })) } }));
vi.mock("@/lib/queries/client", () => ({ QueryProvider: ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider> }));
vi.mock("../mes/_components/DepartmentsContext", () => ({ DepartmentsProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("../mes/_components/login/OperatorLoginCard", () => ({ OperatorLoginCard: () => <div>Login form</div> }));
vi.mock("../mes/_components/DesktopMesShell", () => ({ DesktopMesShell: ({ recoveryContent, onRecoveryNavigate }: { recoveryContent?: ReactNode; onRecoveryNavigate?: (query: string) => void }) => {
  const operator = useCurrentOperator();
  return <><header>{operator?.name}</header><nav aria-label="직원 메뉴"><button onClick={() => onRecoveryNavigate?.("?tab=dashboard")}>대시보드</button></nav>{recoveryContent}</>;
} }));
vi.mock("../mes/_components/mobile/MobileShell", () => ({ MobileShell: () => <div>Mobile shell</div> }));

const operator: Operator = { employee_id: "emp-1", employee_code: "E1", name: "로그인 직원", role: "직원", department: "조립", warehouse_role: "none", department_role: "none", assigned_model_slots: [], io_enabled: true, hidden_sidebar_tabs: [], loginPopupEnabled: false };
describe("missing MES route recovery", () => {
  beforeEach(() => {
    state.pathname = "/mes/missing";
    state.push.mockReset();
    state.getAppSession.mockReset().mockResolvedValue({ boot_id: "boot-1" });
    state.getEmployees.mockReset().mockResolvedValue([operator]);
    state.getWeeklyReport.mockReset().mockResolvedValue({});
    state.getMap.mockReset().mockResolvedValue({});
    sessionStorage.clear();
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn((query: string) => ({ matches: query !== "(max-width: 1023px)", addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  });
  it("로그인 확인 뒤 없는 MES 주소에서도 직원정보·메뉴와 복귀 안내를 표시한다", async () => {
    setCurrentOperator(operator, "boot-1");
    const audit = sessionStorage.getItem("dexcowin_mes_audit_session");
    render(<NotFound />);
    expect(await screen.findByText("로그인 직원")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "직원 메뉴" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "페이지를 찾을 수 없습니다" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "대시보드", exact: true }));
    expect(state.push).toHaveBeenCalledWith("/mes?tab=dashboard");
    expect(readCurrentOperator()?.employee_id).toBe("emp-1");
    expect(sessionStorage.getItem("dexcowin_mes_audit_session")).toBe(audit);
  });
  it("비활성 직원은 없는 MES 주소에서 직원정보·메뉴를 노출하지 않는다", async () => {
    setCurrentOperator(operator, "boot-1");
    state.getEmployees.mockResolvedValue([]);
    render(<NotFound />);
    expect(await screen.findByText("Login form")).toBeInTheDocument();
    expect(screen.queryByText("로그인 직원")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "직원 메뉴" })).not.toBeInTheDocument();
  });
  it("로그인 전에는 MES 직원정보·메뉴를 노출하지 않는다", async () => {
    render(<NotFound />);
    await screen.findByText("Login form");
    expect(screen.queryByRole("navigation", { name: "직원 메뉴" })).not.toBeInTheDocument();
  });
  it("MES 밖의 없는 주소는 독립 복구 안내를 유지한다", async () => {
    state.pathname = "/missing";
    render(<NotFound />);
    await waitFor(() => expect(screen.getByRole("link", { name: "대시보드로" })).toHaveAttribute("href", "/mes?tab=dashboard"));
    expect(state.getEmployees).not.toHaveBeenCalled();
  });
});
