import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const DEFAULT_ROLE = "조립/사원";

const state = vi.hoisted(() => ({
  operator: {
    employee_id: "emp-1",
    name: "김현우",
    department: "조립",
    level: "staff",
    role: "조립/사원",
    employee_code: "E06",
    warehouse_role: "none",
    department_role: "none",
    theme: null,
    assigned_model_slots: [],
    io_enabled: true,
    hidden_sidebar_tabs: [],
    loginPopupEnabled: true,
  },
  logoutCurrentOperator: vi.fn(),
  returnToOperatorLogin: vi.fn(),
  changeMyPin: vi.fn(),
}));

vi.mock("@/lib/ui/BottomSheet", () => ({
  BottomSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div>{children}</div> : null,
}));

vi.mock("../../login/useCurrentOperator", () => ({
  clearCurrentOperator: vi.fn(),
  logoutCurrentOperator: state.logoutCurrentOperator,
  returnToOperatorLogin: state.returnToOperatorLogin,
  useCurrentOperator: () => state.operator,
}));

vi.mock("@/lib/api", () => ({ api: { changeMyPin: state.changeMyPin } }));

import { MobileUserMenuSheet } from "../MobileUserMenuSheet";

describe("MobileUserMenuSheet", () => {
  beforeEach(() => {
    state.operator.role = DEFAULT_ROLE;
    state.logoutCurrentOperator.mockReset();
    state.logoutCurrentOperator.mockResolvedValue(undefined);
    state.returnToOperatorLogin.mockReset();
    state.changeMyPin.mockReset();
    state.changeMyPin.mockResolvedValue(undefined);
  });

  it("shows the department and final role segment without exposing the access level", () => {
    render(<MobileUserMenuSheet open onClose={() => {}} />);

    expect(screen.getByText("조립 · 사원")).toBeInTheDocument();
    expect(screen.queryByText("staff")).not.toBeInTheDocument();
  });

  it("trims the final role segment after the department separator", () => {
    state.operator.role = "조립 / 사원  ";
    render(<MobileUserMenuSheet open onClose={() => {}} />);

    expect(screen.getByText("조립 · 사원")).toBeInTheDocument();
  });

  it("uses a role without a department separator as the job title", () => {
    state.operator.role = "사원";
    render(<MobileUserMenuSheet open onClose={() => {}} />);

    expect(screen.getByText("조립 · 사원")).toBeInTheDocument();
  });

  it("shows only the department when role is empty", () => {
    state.operator.role = "";
    render(<MobileUserMenuSheet open onClose={() => {}} />);

    expect(screen.getByText("조립")).toBeInTheDocument();
    expect(screen.queryByText("조립 ·")).not.toBeInTheDocument();
  });

  it("shows only the department when a legacy in-memory operator has no role", () => {
    state.operator.role = undefined as unknown as string;
    render(<MobileUserMenuSheet open onClose={() => {}} />);

    expect(screen.getByText("조립")).toBeInTheDocument();
    expect(screen.queryByText("조립 ·")).not.toBeInTheDocument();
  });

  it("revokes the server session when mobile logout is confirmed", async () => {
    render(<MobileUserMenuSheet open onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));

    await waitFor(() => expect(state.logoutCurrentOperator).toHaveBeenCalledTimes(1));
  });

  it("returns to login after a successful mobile PIN change", async () => {
    render(<MobileUserMenuSheet open onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "비밀번호 변경" }));
    fireEvent.change(screen.getByPlaceholderText("••••"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.change(screen.getByPlaceholderText("••••"), { target: { value: "5678" } });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.change(screen.getByPlaceholderText("••••"), { target: { value: "5678" } });
    fireEvent.click(screen.getByRole("button", { name: "변경" }));

    await waitFor(() => expect(state.changeMyPin).toHaveBeenCalledWith("emp-1", "1234", "5678"));
    expect(state.returnToOperatorLogin).toHaveBeenCalledTimes(1);
  });
});
