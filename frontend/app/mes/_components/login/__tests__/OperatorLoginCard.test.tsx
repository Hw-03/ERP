import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Employee, OperatorSessionResponse } from "@/lib/api";
import { ApiError } from "@/lib/api-core";

const state = vi.hoisted(() => ({
  employees: [] as Employee[],
  employeesState: "ready" as "loading" | "ready" | "error",
  retryEmployees: vi.fn(),
  createOperatorSession: vi.fn(),
  completeOperatorPinChange: vi.fn(),
  cancelPinChangeChallenge: vi.fn(),
  getAppSession: vi.fn(),
  markLoginNotificationPopupPending: vi.fn(),
  setCurrentOperator: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, getAppSession: state.getAppSession } };
});

vi.mock("@/lib/api/operator-session", () => ({
  operatorSessionApi: {
    createOperatorSession: state.createOperatorSession,
    completeOperatorPinChange: state.completeOperatorPinChange,
    cancelPinChangeChallenge: state.cancelPinChangeChallenge,
    deleteOperatorSession: vi.fn(),
  },
}));

vi.mock("../useCurrentOperator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../useCurrentOperator")>();
  return {
    ...actual,
    markLoginNotificationPopupPending: state.markLoginNotificationPopupPending,
    setCurrentOperator: state.setCurrentOperator,
  };
});

vi.mock("../useLoginEmployees", () => ({
  useLoginEmployees: () => ({
    employees: state.employees,
    status: state.employeesState,
    retry: state.retryEmployees,
  }),
}));

vi.mock("../EmployeeCombobox", () => ({
  EmployeeCombobox: ({ employees, onChange }: { employees: Employee[]; onChange: (employee: Employee) => void }) => (
    <button type="button" onClick={() => onChange(employees[0])}>직원 선택</button>
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
    server_time: "2026-08-19T11:30:00Z",
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
    vi.spyOn(console, "warn").mockImplementation(() => {});
    state.employees = [makeEmployee()];
    state.employeesState = "ready";
    state.retryEmployees.mockReset();
    state.createOperatorSession.mockReset();
    state.createOperatorSession.mockResolvedValue(makeSession());
    state.completeOperatorPinChange.mockReset();
    state.completeOperatorPinChange.mockResolvedValue(undefined);
    state.cancelPinChangeChallenge.mockReset();
    state.cancelPinChangeChallenge.mockResolvedValue(undefined);
    state.getAppSession.mockReset();
    state.getAppSession.mockResolvedValue({ boot_id: "boot-1", started_at: "2026-07-02T00:00:00Z" });
    state.markLoginNotificationPopupPending.mockReset();
    state.setCurrentOperator.mockReset();
  });

  afterEach(() => vi.restoreAllMocks());

  it("creates the server operator session and stores the operator only after app-session confirmation", async () => {
    const onLogin = vi.fn();
    state.createOperatorSession.mockResolvedValue(makeSession(makeEmployee({ role: "조립/사원", sidebar_mode: "expanded" })));

    render(<OperatorLoginCard onLogin={onLogin} />);
    await selectAndSubmit();

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(onLogin).toHaveBeenCalledWith(
      expect.objectContaining({ boot_id: "boot-1", expires_at: expect.any(String) }),
    );
    expect(state.createOperatorSession).toHaveBeenCalledWith("emp-1", "1234");
    expect(state.getAppSession).toHaveBeenCalledTimes(1);
    expect(state.setCurrentOperator).toHaveBeenCalledWith(expect.objectContaining({ role: "조립/사원" }), "boot-1");
  });

  it("keeps authenticated operator state pending and retries only app-session confirmation", async () => {
    state.getAppSession
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ boot_id: "boot-1", started_at: "2026-07-02T00:00:00Z" });
    const onLogin = vi.fn();

    render(<OperatorLoginCard onLogin={onLogin} />);
    await selectAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent("연결 상태를 확인하지 못했습니다");
    expect(state.setCurrentOperator).not.toHaveBeenCalled();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "다시 시도" })));
    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(state.createOperatorSession).toHaveBeenCalledTimes(1);
    expect(state.getAppSession).toHaveBeenCalledTimes(3);
  });

  it("clears and refocuses the PIN after invalid credentials", async () => {
    state.createOperatorSession.mockRejectedValue(
      new ApiError("직원 또는 PIN 정보가 올바르지 않습니다.", 401, "INVALID_CREDENTIALS"),
    );
    render(<OperatorLoginCard onLogin={() => {}} />);
    await selectAndSubmit("9999");

    const input = screen.getByLabelText("PIN 번호");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("PIN 번호가 올바르지 않습니다"));
    expect(input).toHaveValue("");
    await waitFor(() => expect(input).toHaveFocus());
  });

  it("does not disguise a different authentication failure as a PIN mismatch", async () => {
    state.createOperatorSession.mockRejectedValue(
      new ApiError("작업자 세션이 만료되었습니다.", 401, "SESSION_EXPIRED"),
    );
    render(<OperatorLoginCard onLogin={() => {}} />);
    await selectAndSubmit("9999");

    expect(await screen.findByRole("alert")).toHaveTextContent("작업자 세션이 만료되었습니다");
    expect(screen.getByRole("alert")).not.toHaveTextContent("PIN 번호가 올바르지 않습니다");
  });

  it("keeps the PIN for a rate-limited response", async () => {
    state.createOperatorSession.mockRejectedValue(new ApiError("too many", 429));
    render(<OperatorLoginCard onLogin={() => {}} />);
    await selectAndSubmit();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("로그인 시도가 너무 많습니다"));
    expect(screen.getByLabelText("PIN 번호")).toHaveValue("1234");
    expect(state.getAppSession).not.toHaveBeenCalled();
  });

  it("changes a default PIN, creates the server session, and confirms app-session before login", async () => {
    const onLogin = vi.fn();
    state.createOperatorSession
      .mockRejectedValueOnce(new ApiError("새 PIN을 먼저 설정해야 합니다.", 409, "PIN_CHANGE_REQUIRED"))
      .mockResolvedValueOnce(makeSession());
    render(<OperatorLoginCard onLogin={onLogin} />);
    await selectAndSubmit("0000");

    fireEvent.change(await screen.findByLabelText("새 PIN"), { target: { value: "5678" } });
    fireEvent.change(screen.getByLabelText("새 PIN 확인"), { target: { value: "5678" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "PIN 설정 및 로그인" })));

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(state.completeOperatorPinChange).toHaveBeenCalledWith("emp-1", "5678");
    expect(state.createOperatorSession).toHaveBeenNthCalledWith(2, "emp-1", "5678");
    expect(state.setCurrentOperator).toHaveBeenCalledWith(expect.any(Object), "boot-1");
  });

  it("does not submit the PIN change when confirmation differs", async () => {
    state.createOperatorSession.mockRejectedValueOnce(new ApiError("change", 409, "PIN_CHANGE_REQUIRED"));
    render(<OperatorLoginCard onLogin={() => {}} />);
    await selectAndSubmit("0000");
    fireEvent.change(await screen.findByLabelText("새 PIN"), { target: { value: "5678" } });
    fireEvent.change(screen.getByLabelText("새 PIN 확인"), { target: { value: "6789" } });
    fireEvent.click(screen.getByRole("button", { name: "PIN 설정 및 로그인" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("일치하지 않습니다");
    expect(state.completeOperatorPinChange).not.toHaveBeenCalled();
  });

  it("returns to login when the PIN-change challenge expires", async () => {
    state.createOperatorSession.mockRejectedValueOnce(new ApiError("change", 409, "PIN_CHANGE_REQUIRED"));
    state.completeOperatorPinChange.mockRejectedValueOnce(new ApiError("expired", 401));
    render(<OperatorLoginCard onLogin={() => {}} />);
    await selectAndSubmit("0000");
    fireEvent.change(await screen.findByLabelText("새 PIN"), { target: { value: "5678" } });
    fireEvent.change(screen.getByLabelText("새 PIN 확인"), { target: { value: "5678" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "PIN 설정 및 로그인" })));

    expect(await screen.findByLabelText("PIN 번호")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("로그인부터 다시 시도해 주세요");
    expect(state.cancelPinChangeChallenge).toHaveBeenCalledWith("emp-1");
  });

  it("keeps the PIN-change form open for a correctable validation error", async () => {
    state.createOperatorSession.mockRejectedValueOnce(new ApiError("change", 409, "PIN_CHANGE_REQUIRED"));
    state.completeOperatorPinChange.mockRejectedValueOnce(new ApiError("기본 PIN과 달라야 합니다.", 422));
    render(<OperatorLoginCard onLogin={() => {}} />);
    await selectAndSubmit("0000");
    fireEvent.change(await screen.findByLabelText("새 PIN"), { target: { value: "0000" } });
    fireEvent.change(screen.getByLabelText("새 PIN 확인"), { target: { value: "0000" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "PIN 설정 및 로그인" })));

    expect(screen.getByLabelText("새 PIN")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("기본 PIN과 달라야 합니다");
  });

  it("cancels the PIN-change challenge before returning to login", async () => {
    state.createOperatorSession.mockRejectedValueOnce(new ApiError("change", 409, "PIN_CHANGE_REQUIRED"));
    render(<OperatorLoginCard onLogin={() => {}} />);
    await selectAndSubmit("0000");
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "로그인으로 돌아가기" })));

    expect(state.cancelPinChangeChallenge).toHaveBeenCalledWith("emp-1");
    expect(screen.getByLabelText("PIN 번호")).toBeInTheDocument();
  });

  it("keeps the PIN-change form open when challenge cancellation fails", async () => {
    state.createOperatorSession.mockRejectedValueOnce(new ApiError("change", 409, "PIN_CHANGE_REQUIRED"));
    state.cancelPinChangeChallenge.mockRejectedValueOnce(new Error("DB unavailable"));
    render(<OperatorLoginCard onLogin={() => {}} />);
    await selectAndSubmit("0000");
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "로그인으로 돌아가기" })));

    expect(screen.getByLabelText("새 PIN")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("PIN 변경 취소를 서버에 반영하지 못했습니다");
  });

  it("blocks login and exposes retry while server logout is pending", () => {
    const onRetryLogout = vi.fn();
    render(<OperatorLoginCard onLogin={() => {}} logoutPending onRetryLogout={onRetryLogout} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "로그아웃 완료를 확인하지 못했습니다. 다시 시도해 주세요.",
    );
    fireEvent.click(screen.getByRole("button", { name: "로그아웃 재시도" }));
    expect(onRetryLogout).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "직원 선택" }));
    expect(screen.getByRole("button", { name: "로그인" })).toBeDisabled();
  });

  it("shows employee loading and retry states", () => {
    state.employeesState = "error";
    render(<OperatorLoginCard onLogin={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(state.retryEmployees).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "로그인" })).toBeDisabled();
  });

  it("does not store or log in when app-session has an empty boot id", async () => {
    state.getAppSession.mockResolvedValue({ boot_id: "", started_at: "2026-09-08T00:00:00Z" });
    const onLogin = vi.fn();
    render(<OperatorLoginCard onLogin={onLogin} />);
    await selectAndSubmit();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("연결 상태를 확인하지 못했습니다"));
    expect(state.setCurrentOperator).not.toHaveBeenCalled();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("does not show a PIN reset helper", () => {
    render(<OperatorLoginCard onLogin={() => {}} />);
    expect(screen.queryByText("PIN 초기화 요청")).not.toBeInTheDocument();
  });
});
