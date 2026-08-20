import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Employee, OperatorSessionResponse } from "@/lib/api";
import { ApiError } from "@/lib/api-core";
import { readCurrentOperator } from "../useCurrentOperator";

const state = vi.hoisted(() => ({
  employees: [] as Employee[],
  createOperatorSession: vi.fn(),
  completeOperatorPinChange: vi.fn(),
  cancelPinChangeChallenge: vi.fn(),
}));

vi.mock("@/lib/api/operator-session", () => ({
  operatorSessionApi: {
    createOperatorSession: state.createOperatorSession,
    completeOperatorPinChange: state.completeOperatorPinChange,
    cancelPinChangeChallenge: state.cancelPinChangeChallenge,
    deleteOperatorSession: vi.fn(),
  },
}));

vi.mock("@/lib/client-events", () => ({
  sendClientEvent: vi.fn(),
}));

vi.mock("../useLoginEmployees", () => ({
  useLoginEmployees: () => state.employees,
}));

vi.mock("../EmployeeCombobox", () => ({
  EmployeeCombobox: ({ employees, onChange }: { employees: Employee[]; onChange: (emp: Employee) => void }) => (
    <button type="button" onClick={() => onChange(employees[0])}>
      직원 선택
    </button>
  ),
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
    created_at: "2026-08-19T00:00:00Z",
    updated_at: "2026-08-19T00:00:00Z",
    assigned_model_slots: [],
    hidden_sidebar_tabs: [],
    login_notification_popup_enabled: false,
    ...overrides,
  };
}

function makeSession(employee = makeEmployee()): OperatorSessionResponse {
  return {
    employee,
    expires_at: "2026-08-19T12:00:00Z",
    boot_id: "boot-1",
  };
}

async function selectAndSubmit(pin = "1234"): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "직원 선택" }));
  fireEvent.change(screen.getByLabelText("PIN 번호"), { target: { value: pin } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
  });
}

describe("OperatorLoginCard", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    state.employees = [makeEmployee()];
    state.createOperatorSession.mockReset();
    state.completeOperatorPinChange.mockReset();
    state.completeOperatorPinChange.mockResolvedValue(undefined);
    state.cancelPinChangeChallenge.mockReset();
    state.cancelPinChangeChallenge.mockResolvedValue(undefined);
  });

  it("logs in through the canonical operator session API and caches its server profile", async () => {
    const onLogin = vi.fn();
    state.createOperatorSession.mockResolvedValue(
      makeSession(makeEmployee({ role: "조립/사원", sidebar_mode: "expanded" })),
    );

    render(<OperatorLoginCard onLogin={onLogin} />);
    await selectAndSubmit();

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(state.createOperatorSession).toHaveBeenCalledWith("emp-1", "1234");
    expect(readCurrentOperator()).toMatchObject({
      employee_id: "emp-1",
      role: "조립/사원",
      sidebar_mode: "expanded",
    });
  });

  it("shows a unified error for invalid credentials", async () => {
    state.createOperatorSession.mockRejectedValue(
      new ApiError("직원 또는 PIN 정보가 올바르지 않습니다.", 401, "INVALID_CREDENTIALS"),
    );

    render(<OperatorLoginCard onLogin={() => {}} />);
    await selectAndSubmit("9999");

    expect(await screen.findByRole("alert")).toHaveTextContent("직원 또는 PIN 정보가 올바르지 않습니다.");
  });

  it("changes a default PIN and logs in again with the new PIN", async () => {
    const onLogin = vi.fn();
    state.createOperatorSession
      .mockRejectedValueOnce(
        new ApiError("새 PIN을 먼저 설정해야 합니다.", 409, "PIN_CHANGE_REQUIRED"),
      )
      .mockResolvedValueOnce(makeSession());

    render(<OperatorLoginCard onLogin={onLogin} />);
    await selectAndSubmit("0000");

    expect(await screen.findByLabelText("새 PIN")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("새 PIN"), { target: { value: "5678" } });
    fireEvent.change(screen.getByLabelText("새 PIN 확인"), { target: { value: "5678" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "PIN 설정 및 로그인" }));
    });

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(state.completeOperatorPinChange).toHaveBeenCalledWith("emp-1", "5678");
    expect(state.createOperatorSession).toHaveBeenNthCalledWith(2, "emp-1", "5678");
    expect(readCurrentOperator()?.employee_id).toBe("emp-1");
  });

  it("does not submit the initial PIN change when confirmation differs", async () => {
    state.createOperatorSession.mockRejectedValueOnce(
      new ApiError("새 PIN을 먼저 설정해야 합니다.", 409, "PIN_CHANGE_REQUIRED"),
    );

    render(<OperatorLoginCard onLogin={() => {}} />);
    await selectAndSubmit("0000");
    fireEvent.change(await screen.findByLabelText("새 PIN"), { target: { value: "5678" } });
    fireEvent.change(screen.getByLabelText("새 PIN 확인"), { target: { value: "6789" } });
    fireEvent.click(screen.getByRole("button", { name: "PIN 설정 및 로그인" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("새 PIN과 확인 PIN이 일치하지 않습니다.");
    expect(state.completeOperatorPinChange).not.toHaveBeenCalled();
  });

  it("returns to login when the PIN-change challenge has expired", async () => {
    state.createOperatorSession.mockRejectedValueOnce(
      new ApiError("새 PIN을 먼저 설정해야 합니다.", 409, "PIN_CHANGE_REQUIRED"),
    );
    state.completeOperatorPinChange.mockRejectedValueOnce(
      new ApiError("세션이 만료되었습니다.", 401, "SESSION_EXPIRED"),
    );

    render(<OperatorLoginCard onLogin={() => {}} />);
    await selectAndSubmit("0000");
    fireEvent.change(await screen.findByLabelText("새 PIN"), { target: { value: "5678" } });
    fireEvent.change(screen.getByLabelText("새 PIN 확인"), { target: { value: "5678" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "PIN 설정 및 로그인" }));
    });

    expect(await screen.findByLabelText("PIN 번호")).toBeInTheDocument();
    expect(screen.queryByLabelText("새 PIN")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("로그인부터 다시 시도해 주세요.");
    expect(state.cancelPinChangeChallenge).toHaveBeenCalledWith("emp-1");
  });

  it("keeps the PIN-change form open for a correctable new-PIN validation error", async () => {
    state.createOperatorSession.mockRejectedValueOnce(
      new ApiError("새 PIN은 기본 PIN과 달라야 합니다.", 409, "PIN_CHANGE_REQUIRED"),
    );
    state.completeOperatorPinChange.mockRejectedValueOnce(
      new ApiError("새 PIN은 기본 PIN과 달라야 합니다.", 422, "UNPROCESSABLE"),
    );

    render(<OperatorLoginCard onLogin={() => {}} />);
    await selectAndSubmit("0000");
    fireEvent.change(await screen.findByLabelText("새 PIN"), { target: { value: "0000" } });
    fireEvent.change(screen.getByLabelText("새 PIN 확인"), { target: { value: "0000" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "PIN 설정 및 로그인" }));
    });

    expect(await screen.findByLabelText("새 PIN")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("새 PIN은 기본 PIN과 달라야 합니다.");
  });

  it("offers an explicit path back to login from PIN change", async () => {
    state.createOperatorSession.mockRejectedValueOnce(
      new ApiError("새 PIN을 먼저 설정해야 합니다.", 409, "PIN_CHANGE_REQUIRED"),
    );

    render(<OperatorLoginCard onLogin={() => {}} />);
    await selectAndSubmit("0000");
    fireEvent.change(await screen.findByLabelText("새 PIN"), { target: { value: "5678" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "로그인으로 돌아가기" }));
    });

    expect(state.cancelPinChangeChallenge).toHaveBeenCalledWith("emp-1");
    expect(await screen.findByLabelText("PIN 번호")).toBeInTheDocument();
    expect(screen.queryByLabelText("새 PIN")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the PIN-change form open when server-side challenge cancellation fails", async () => {
    state.createOperatorSession.mockRejectedValueOnce(
      new ApiError("새 PIN을 먼저 설정해야 합니다.", 409, "PIN_CHANGE_REQUIRED"),
    );
    state.cancelPinChangeChallenge.mockRejectedValueOnce(new Error("DB unavailable"));

    render(<OperatorLoginCard onLogin={() => {}} />);
    await selectAndSubmit("0000");
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "로그인으로 돌아가기" }));
    });

    expect(state.cancelPinChangeChallenge).toHaveBeenCalledWith("emp-1");
    expect(screen.getByLabelText("새 PIN")).toBeInTheDocument();
    expect(screen.queryByLabelText("PIN 번호")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "PIN 변경 취소를 서버에 반영하지 못했습니다. 다시 시도해 주세요.",
    );
  });

  it("does not show the PIN reset request helper on the login screen", () => {
    render(<OperatorLoginCard onLogin={() => {}} />);

    expect(screen.queryByText("PIN 초기화 요청")).not.toBeInTheDocument();
    expect(screen.queryByText("관리자에게 문의해 주세요")).not.toBeInTheDocument();
  });

  it("blocks login and exposes retry while server logout is still pending", () => {
    const onRetryLogout = vi.fn();
    render(
      <OperatorLoginCard
        onLogin={() => {}}
        logoutPending
        onRetryLogout={onRetryLogout}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "로그아웃을 서버에 반영하지 못했습니다.",
    );
    fireEvent.click(screen.getByRole("button", { name: "로그아웃 재시도" }));
    expect(onRetryLogout).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "직원 선택" }));
    expect(screen.getByRole("button", { name: "로그인" })).toBeDisabled();
  });
});
