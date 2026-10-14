import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { clearCurrentOperator } from "../../login/useCurrentOperator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DEFAULT_ROLE = "조립/사원";

const state = vi.hoisted(() => ({
  operator: {
    employee_id: "emp-1",
    name: "김현우",
    department: "조립",
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
}));

vi.mock("@/lib/ui/BottomSheet", () => ({
  BottomSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div>{children}</div> : null,
}));

vi.mock("../../login/useCurrentOperator", () => ({
  clearCurrentOperator: vi.fn(),
  useCurrentOperator: () => state.operator,
}));

vi.mock("@/lib/api", () => ({ api: { changeMyPin: vi.fn() } }));

import { MobileUserMenuSheet } from "../MobileUserMenuSheet";

describe("MobileUserMenuSheet", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("waits for server revocation before reloading after logout", async () => {
    const reload = vi.fn();
    vi.stubGlobal("window", new Proxy(window, { get: (target, key) => key === "location" ? { reload } : Reflect.get(target, key) }));
    let finish!: () => void;
    vi.mocked(clearCurrentOperator).mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
    render(<MobileUserMenuSheet open onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "로그아웃", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "로그아웃", exact: true }));
    await waitFor(() => expect(clearCurrentOperator).toHaveBeenCalled());
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "로그아웃", exact: true })).toBeDisabled();
    await act(async () => { finish(); });
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it("preserves login when the active stocktake cannot be saved", async () => {
    vi.mocked(clearCurrentOperator).mockClear();
    render(<MobileUserMenuSheet open onClose={() => {}} onBeforeLogout={async () => { throw new Error("저장 실패"); }} />);
    fireEvent.click(screen.getByRole("button", { name: "로그아웃", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "로그아웃", exact: true }));
    await screen.findByText("저장 결과를 확인하지 못해 로그아웃하지 않았습니다.");
    expect(clearCurrentOperator).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    state.operator.role = DEFAULT_ROLE;
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
});
