import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { clearCurrentOperator } from "../../login/useCurrentOperator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

const DEFAULT_ROLE = "조립/사원";

const state = vi.hoisted(() => ({
  memoClose: null as (() => void) | null,
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

vi.mock("../../personal_memo/PersonalMemoDialog", () => ({
  PersonalMemoDialog: ({ employeeId, onClose, mobilePresentation }: { employeeId: string; onClose: () => void; mobilePresentation?: boolean }) => {
    state.memoClose = onClose;
    return <div role="dialog" aria-label="메모장" data-employee-id={employeeId} data-mobile={mobilePresentation}><button onClick={onClose}>메모장 닫기</button></div>;
  },
}));

import { MobileUserMenuSheet } from "../MobileUserMenuSheet";

describe("MobileUserMenuSheet", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("비밀번호 변경과 로그아웃 사이에서 메모장을 열면 시트만 닫고 모바일 메모장을 유지한다", () => {
    function Host() {
      const [open, setOpen] = useState(true);
      return <MobileUserMenuSheet open={open} onClose={() => setOpen(false)} />;
    }
    render(<Host />);
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["비밀번호 변경", "메모장", "로그아웃"]);
    const memo = screen.getByRole("button", { name: "메모장" });
    expect(memo).toHaveClass("min-h-11");
    expect(memo.querySelector("svg")).toHaveClass("lucide-notebook-pen");
    fireEvent.click(memo);
    expect(screen.queryByRole("button", { name: "비밀번호 변경" })).not.toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: "메모장" });
    expect(dialog).toHaveAttribute("data-employee-id", "emp-1");
    expect(dialog).toHaveAttribute("data-mobile", "true");
    fireEvent.click(screen.getByRole("button", { name: "메모장 닫기" }));
    expect(screen.queryByRole("dialog", { name: "메모장" })).not.toBeInTheDocument();
  });

  it("계정 변경 시 메모장을 숨기고 이전 닫기 응답으로 다른 계정의 팝업을 닫지 않는다", () => {
    const props = { open: true, onClose: vi.fn() };
    const { rerender } = render(<MobileUserMenuSheet {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "메모장", exact: true }));
    const oldClose = state.memoClose;
    state.operator.employee_id = "emp-2";
    rerender(<MobileUserMenuSheet {...props} />);
    expect(screen.queryByRole("dialog", { name: "메모장" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "메모장", exact: true }));
    act(() => { oldClose?.(); });
    expect(screen.getByRole("dialog", { name: "메모장" })).toHaveAttribute("data-employee-id", "emp-2");
    state.operator.employee_id = "emp-1";
    rerender(<MobileUserMenuSheet {...props} />);
    expect(screen.queryByRole("dialog", { name: "메모장" })).not.toBeInTheDocument();
  });
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
    state.operator.employee_id = "emp-1";
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
