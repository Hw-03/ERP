import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Employee } from "@/lib/api";
import { ApiError } from "@/lib/api-core";

const state = vi.hoisted(() => ({
  employees: [] as Employee[],
  employeesState: "ready" as "loading" | "ready" | "error",
  retryEmployees: vi.fn(),
  verifyEmployeePin: vi.fn(),
  getAppSession: vi.fn(),
  markLoginNotificationPopupPending: vi.fn(),
  setCurrentOperator: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    verifyEmployeePin: state.verifyEmployeePin,
    getAppSession: state.getAppSession,
  },
}));

vi.mock("../useLoginEmployees", () => ({
  useLoginEmployees: () => ({
    employees: state.employees,
    status: state.employeesState,
    retry: state.retryEmployees,
  }),
}));

vi.mock("./useLoginEmployees", () => ({
  useLoginEmployees: () => ({
    employees: state.employees,
    status: state.employeesState,
    retry: state.retryEmployees,
  }),
}));

vi.mock("../EmployeeCombobox", () => ({
  EmployeeCombobox: ({ employees, onChange }: { employees: Employee[]; onChange: (emp: Employee) => void }) => (
    <button type="button" data-testid="employee-combobox" onClick={() => onChange(employees[0])}>
      직원 선택
    </button>
  ),
}));

vi.mock("./EmployeeCombobox", () => ({
  EmployeeCombobox: ({ employees, onChange }: { employees: Employee[]; onChange: (emp: Employee) => void }) => (
    <button type="button" data-testid="employee-combobox" onClick={() => onChange(employees[0])}>
      직원 선택
    </button>
  ),
}));

vi.mock("../useCurrentOperator", () => ({
  markLoginNotificationPopupPending: state.markLoginNotificationPopupPending,
  setCurrentOperator: state.setCurrentOperator,
}));

vi.mock("./useCurrentOperator", () => ({
  markLoginNotificationPopupPending: state.markLoginNotificationPopupPending,
  setCurrentOperator: state.setCurrentOperator,
}));

import { OperatorLoginCard } from "../OperatorLoginCard";

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    employee_id: "emp-1",
    employee_code: "E1",
    name: "김현우",
    role: "staff",
    phone: null,
    department: "조립",
    level: "staff",
    warehouse_role: "none",
    department_role: "none",
    io_enabled: true,
    display_order: 1,
    is_active: true,
    created_at: "2026-07-02T00:00:00Z",
    updated_at: "2026-07-02T00:00:00Z",
    assigned_model_slots: [],
    hidden_sidebar_tabs: [],
    login_notification_popup_enabled: false,
    ...overrides,
  };
}

async function submitLogin() {
  fireEvent.click(screen.getByRole("button", { name: "직원 선택" }));
  fireEvent.change(screen.getByLabelText(/PIN/), { target: { value: "1234" } });
  fireEvent.click(screen.getByRole("button", { name: /로그인/ }));
}

describe("OperatorLoginCard", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    state.employees = [makeEmployee()];
    state.employeesState = "ready";
    state.retryEmployees.mockReset();
    state.verifyEmployeePin.mockReset();
    state.getAppSession.mockReset();
    state.markLoginNotificationPopupPending.mockReset();
    state.setCurrentOperator.mockReset();
    state.getAppSession.mockResolvedValue({ boot_id: "boot-1", started_at: "2026-07-02T00:00:00Z" });
  });

  it("does not show the PIN reset request helper on the login screen", () => {
    render(<OperatorLoginCard onLogin={() => {}} />);

    expect(screen.queryByText("PIN 초기화 요청")).not.toBeInTheDocument();
    expect(screen.queryByText("관리자에게 문의해 주세요")).not.toBeInTheDocument();
  });

  it("clears the PIN and restores focus after login fails", async () => {
    state.verifyEmployeePin.mockRejectedValue(new ApiError("invalid PIN", 403));

    render(<OperatorLoginCard onLogin={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "직원 선택" }));

    const pinInput = screen.getByLabelText(/PIN/);
    await waitFor(() => expect(pinInput).toHaveFocus());

    fireEvent.change(pinInput, { target: { value: "1234" } });
    const loginButton = screen.getByRole("button", { name: /로그인/ });
    loginButton.focus();
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("PIN 번호가 올바르지 않습니다.");
      expect(pinInput).toHaveValue("");
      expect(pinInput).not.toBeDisabled();
      expect(pinInput).toHaveFocus();
    });
  });

  it("marks the login notification popup pending when the login response has the setting enabled", async () => {
    state.verifyEmployeePin.mockResolvedValue(makeEmployee({ login_notification_popup_enabled: true }));

    render(<OperatorLoginCard onLogin={() => {}} />);
    await submitLogin();

    await waitFor(() => {
      expect(state.markLoginNotificationPopupPending).toHaveBeenCalledWith("emp-1");
    });
  });

  it("does not mark the login notification popup pending when the login response has the setting disabled", async () => {
    state.verifyEmployeePin.mockResolvedValue(makeEmployee({ login_notification_popup_enabled: false }));

    render(<OperatorLoginCard onLogin={() => {}} />);
    await submitLogin();

    await waitFor(() => {
      expect(state.setCurrentOperator).toHaveBeenCalled();
    });
    expect(state.markLoginNotificationPopupPending).not.toHaveBeenCalled();
  });

  it("preserves the employee role in the stored operator", async () => {
    state.verifyEmployeePin.mockResolvedValue(makeEmployee({ role: "조립/사원" }));

    render(<OperatorLoginCard onLogin={() => {}} />);
    await submitLogin();

    await waitFor(() => {
      expect(state.setCurrentOperator).toHaveBeenCalledWith(
        expect.objectContaining({ role: "조립/사원" }),
        "boot-1",
      );
    });
  });

  it("stores the employee sidebar mode in the current operator session", async () => {
    state.verifyEmployeePin.mockResolvedValue({
      ...makeEmployee(),
      sidebar_mode: "expanded",
    } as Employee);

    render(<OperatorLoginCard onLogin={() => {}} />);
    await submitLogin();

    await waitFor(() => {
      expect(state.setCurrentOperator).toHaveBeenCalledWith(
        expect.objectContaining({ sidebar_mode: "expanded" }),
        "boot-1",
      );
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("keeps the PIN and does not log in when session confirmation fails", async () => {
    state.verifyEmployeePin.mockResolvedValue(makeEmployee());
    state.getAppSession.mockRejectedValue(new Error("offline"));
    const onLogin = vi.fn();

    render(<OperatorLoginCard onLogin={onLogin} />);
    await act(async () => { await submitLogin(); });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("연결 상태를 확인하지 못했습니다");
    });
    expect(screen.getByLabelText(/PIN/)).toHaveValue("1234");
    expect(state.setCurrentOperator).not.toHaveBeenCalled();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("retries only the session confirmation after a temporary failure", async () => {
    state.verifyEmployeePin.mockResolvedValue(makeEmployee());
    state.getAppSession
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ boot_id: "boot-1", started_at: "2026-07-02T00:00:00Z" });
    const onLogin = vi.fn();

    render(<OperatorLoginCard onLogin={onLogin} />);
    await submitLogin();

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(state.verifyEmployeePin).toHaveBeenCalledTimes(1);
    expect(state.getAppSession).toHaveBeenCalledTimes(2);
    expect(state.setCurrentOperator).toHaveBeenCalledWith(expect.any(Object), "boot-1");
  });

  it("does not turn a rate-limited PIN response into an invalid PIN message", async () => {
    state.verifyEmployeePin.mockRejectedValue(new ApiError("too many", 429));

    render(<OperatorLoginCard onLogin={() => {}} />);
    await act(async () => { await submitLogin(); });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("로그인 시도가 너무 많습니다");
      expect(screen.getByLabelText(/PIN/)).toHaveValue("1234");
      expect(screen.getByLabelText(/PIN/)).not.toBeDisabled();
    });
    expect(state.getAppSession).not.toHaveBeenCalled();
  });

  it("does not store or log in when the session response has an empty boot id", async () => {
    state.verifyEmployeePin.mockResolvedValue(makeEmployee());
    state.getAppSession.mockResolvedValue({ boot_id: "", started_at: "2026-09-08T00:00:00Z" });
    const onLogin = vi.fn();

    render(<OperatorLoginCard onLogin={onLogin} />);
    await submitLogin();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("연결 상태를 확인하지 못했습니다"));
    expect(screen.getByLabelText(/PIN/)).toHaveValue("1234");
    expect(state.getAppSession).toHaveBeenCalledTimes(1);
    expect(state.setCurrentOperator).not.toHaveBeenCalled();
    expect(onLogin).not.toHaveBeenCalled();
  });
});
