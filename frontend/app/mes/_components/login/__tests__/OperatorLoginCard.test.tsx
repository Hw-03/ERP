import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Employee } from "@/lib/api";

const state = vi.hoisted(() => ({
  employees: [] as Employee[],
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
  useLoginEmployees: () => state.employees,
}));

vi.mock("./useLoginEmployees", () => ({
  useLoginEmployees: () => state.employees,
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
    state.employees = [makeEmployee()];
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
});
