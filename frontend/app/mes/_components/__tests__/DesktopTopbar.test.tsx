import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AlertTriangle } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { DailyWorkDatePicker } from "../_daily_report/DailyWorkDatePicker";
import { DesktopTopbar } from "../DesktopTopbar";
import { clearCurrentOperator } from "../login/useCurrentOperator";

const notificationBellState = vi.hoisted(() => ({
  loginDialogEnabled: undefined as boolean | undefined,
  operator: null as null | { employee_id: string; name: string; department: string; warehouse_role: string; department_role: string },
  memoClose: null as (() => void) | null,
}));

vi.mock("../login/useCurrentOperator", () => ({
  useCurrentOperator: () => notificationBellState.operator,
  clearCurrentOperator: vi.fn(),
}));

vi.mock("../notifications/NotificationBell", () => ({
  NotificationBell: ({ loginDialogEnabled }: { loginDialogEnabled: boolean }) => {
    notificationBellState.loginDialogEnabled = loginDialogEnabled;
    return null;
  },
}));

vi.mock("../personal_memo/PersonalMemoDialog", () => ({
  PersonalMemoDialog: ({ employeeId, onClose }: { employeeId: string; onClose: () => void }) => {
    notificationBellState.memoClose = onClose;
    return <div role="dialog" aria-label="메모장" data-employee-id={employeeId}><button onClick={onClose}>메모장 닫기</button></div>;
  },
}));

describe("DesktopTopbar", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("PIN 변경과 로그아웃 사이의 메모장을 누르면 메뉴를 닫고 현재 직원의 팝업을 연다", () => {
    notificationBellState.operator = { employee_id: "emp-1", name: "김현우", department: "조립", warehouse_role: "none", department_role: "none" };
    render(<DesktopTopbar title="대시보드" onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /김현우/ }));
    const menu = screen.getByTestId("desktop-user-menu");
    expect(within(menu).getAllByRole("button").map((button) => button.textContent)).toEqual(["PIN 변경", "메모장", "로그아웃"]);
    const memo = within(menu).getByRole("button", { name: "메모장" });
    expect(memo).toHaveClass("min-h-11");
    expect(memo.querySelector("svg")).toHaveClass("lucide-notebook-pen");
    fireEvent.click(memo);
    expect(screen.queryByTestId("desktop-user-menu")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "메모장" })).toHaveAttribute("data-employee-id", "emp-1");
    fireEvent.click(screen.getByRole("button", { name: "메모장 닫기" }));
    expect(screen.queryByRole("dialog", { name: "메모장" })).not.toBeInTheDocument();
  });

  it("직원이 바뀌면 메모장을 숨기고 이전 팝업의 늦은 닫기 응답이 새 직원 팝업을 닫지 않는다", () => {
    const original = { employee_id: "emp-1", name: "김현우", department: "조립", warehouse_role: "none", department_role: "none" };
    notificationBellState.operator = original;
    const props = { title: "대시보드", onRefresh: vi.fn() };
    const { rerender } = render(<DesktopTopbar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /김현우/ }));
    fireEvent.click(screen.getByRole("button", { name: "메모장", exact: true }));
    const oldClose = notificationBellState.memoClose;
    notificationBellState.operator = { ...original, employee_id: "emp-2", name: "이영희" };
    rerender(<DesktopTopbar {...props} />);
    expect(screen.queryByRole("dialog", { name: "메모장" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /이영희/ }));
    fireEvent.click(screen.getByRole("button", { name: "메모장", exact: true }));
    act(() => { oldClose?.(); });
    expect(screen.getByRole("dialog", { name: "메모장" })).toHaveAttribute("data-employee-id", "emp-2");
    notificationBellState.operator = original;
    rerender(<DesktopTopbar {...props} />);
    expect(screen.queryByRole("dialog", { name: "메모장" })).not.toBeInTheDocument();
  });
  it("waits for server revocation before reloading after logout", async () => {
    const reload = vi.fn();
    vi.stubGlobal("window", new Proxy(window, { get: (target, key) => key === "location" ? { reload } : Reflect.get(target, key) }));
    let finish!: () => void;
    vi.mocked(clearCurrentOperator).mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
    notificationBellState.operator = { employee_id: "emp-1", name: "김현우", department: "조립", warehouse_role: "none", department_role: "none" };
    render(<DesktopTopbar title="전수조사" onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /김현우/ }));
    fireEvent.click(screen.getByRole("button", { name: "로그아웃", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "로그아웃", exact: true }));
    await waitFor(() => expect(clearCurrentOperator).toHaveBeenCalled());
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /로그아웃|처리 중/ })).toBeDisabled();
    await act(async () => { finish(); });
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it("uses the active tab color for the leading icon", () => {
    const { container } = render(
      <DesktopTopbar
        title="불량"
        icon={AlertTriangle}
        iconColor={LEGACY_COLORS.red}
        onRefresh={vi.fn()}
      />,
    );

    const iconBox = container.querySelector("[data-testid='desktop-topbar-icon']");

    expect(iconBox).toHaveStyle({
      color: LEGACY_COLORS.red,
      background: `color-mix(in srgb, ${LEGACY_COLORS.red} 12%, transparent)`,
    });
  });

  it("exposes the status pill as the destination for transient notices", () => {
    render(
      <DesktopTopbar
        title="출하"
        icon={AlertTriangle}
        iconColor={LEGACY_COLORS.blue}
        status="DEXCOWIN MES"
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByTestId("desktop-status-target")).toHaveTextContent("DEXCOWIN MES");
  });

  it("enables the login notification dialog for the desktop top bar", () => {
    render(
      <DesktopTopbar
        title="Dashboard"
        icon={AlertTriangle}
        iconColor={LEGACY_COLORS.blue}
        onRefresh={vi.fn()}
      />,
    );

    expect(notificationBellState.loginDialogEnabled).toBe(true);
  });

  it("allows an absolute-positioned date dialog to escape the title addon", () => {
    render(
      <DesktopTopbar
        title="Daily report"
        onRefresh={vi.fn()}
        titleAddon={<DailyWorkDatePicker value="2026-08-10" maxDate="2026-08-10" onChange={vi.fn()} />}
      />,
    );

    expect(screen.getByTestId("desktop-topbar-title-addon")).toHaveClass("overflow-visible");

    fireEvent.click(screen.getByRole("button", { name: "일보 날짜 선택" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("전일·다음 날 화살표는 주말을 건너뛰고 오늘 이후 이동은 막는다", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DailyWorkDatePicker value="2026-08-28" maxDate="2026-08-30" onChange={onChange} />,
    );

    expect(screen.getByRole("button", { name: "다음 날" })).toBeDisabled();

    rerender(
      <DailyWorkDatePicker value="2026-08-31" maxDate="2026-08-31" onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "전일" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-08-28");

    rerender(
      <DailyWorkDatePicker value="2026-08-28" maxDate="2026-08-31" onChange={onChange} />,
    );

    const nextButton = screen.getByRole("button", { name: "다음 날" });
    expect(nextButton).toBeEnabled();

    fireEvent.click(nextButton);
    expect(onChange).toHaveBeenLastCalledWith("2026-08-31");
  });

  it("uses an opaque popup surface for the user menu", () => {
    notificationBellState.operator = {
      employee_id: "emp-1",
      name: "김현우",
      department: "조립",
      warehouse_role: "none",
      department_role: "none",
    };

    render(<DesktopTopbar title="대시보드" onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /김현우/ }));

    expect(screen.getByTestId("desktop-user-menu")).toHaveStyle({
      background: "var(--c-popup-bg)",
      boxShadow: "var(--c-popup-shadow)",
    });
  });
  it("keeps the operator when a pending stocktake blocks logout", async () => {
    vi.mocked(clearCurrentOperator).mockClear();
    notificationBellState.operator = { employee_id: "emp-1", name: "김현우", department: "조립", warehouse_role: "none", department_role: "none" };
    render(<DesktopTopbar title="전수조사" onRefresh={vi.fn()} onBeforeLogout={async () => { throw new Error("pending"); }} />);
    fireEvent.click(screen.getByRole("button", { name: /김현우/ }));
    fireEvent.click(screen.getByRole("button", { name: "로그아웃", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "로그아웃", exact: true }));
    await screen.findByText("저장 결과를 확인하지 못해 로그아웃하지 않았습니다.");
    expect(clearCurrentOperator).not.toHaveBeenCalled();
  });
});
