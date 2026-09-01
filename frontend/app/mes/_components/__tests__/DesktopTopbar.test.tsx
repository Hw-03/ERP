import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AlertTriangle } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { DailyWorkDatePicker } from "../_daily_report/DailyWorkDatePicker";
import { DesktopTopbar } from "../DesktopTopbar";

const notificationBellState = vi.hoisted(() => ({
  loginDialogEnabled: undefined as boolean | undefined,
  operator: null as null | { employee_id: string; name: string; department: string; warehouse_role: string; department_role: string },
  clearCurrentOperator: vi.fn(),
  logoutCurrentOperator: vi.fn(),
  returnToOperatorLogin: vi.fn(),
  changeMyPin: vi.fn(),
}));

vi.mock("../login/useCurrentOperator", () => ({
  useCurrentOperator: () => notificationBellState.operator,
  clearCurrentOperator: notificationBellState.clearCurrentOperator,
  logoutCurrentOperator: notificationBellState.logoutCurrentOperator,
  returnToOperatorLogin: notificationBellState.returnToOperatorLogin,
}));

vi.mock("@/lib/api", () => ({
  api: { changeMyPin: notificationBellState.changeMyPin },
}));

vi.mock("../notifications/NotificationBell", () => ({
  NotificationBell: ({ loginDialogEnabled }: { loginDialogEnabled: boolean }) => {
    notificationBellState.loginDialogEnabled = loginDialogEnabled;
    return null;
  },
}));

describe("DesktopTopbar", () => {
  beforeEach(() => {
    notificationBellState.clearCurrentOperator.mockReset();
    notificationBellState.logoutCurrentOperator.mockReset();
    notificationBellState.logoutCurrentOperator.mockResolvedValue(undefined);
    notificationBellState.returnToOperatorLogin.mockReset();
    notificationBellState.changeMyPin.mockReset();
    notificationBellState.changeMyPin.mockResolvedValue(undefined);
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

    const target = screen.getByTestId("desktop-status-target");
    expect(target).toHaveTextContent("DEXCOWIN MES");
    expect(target).toHaveAttribute("data-status-target", "desktop");
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

  it("전일·다음 날 화살표로 날짜를 하루씩 이동하고 오늘 이후 이동은 막는다", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DailyWorkDatePicker value="2026-08-01" maxDate="2026-08-01" onChange={onChange} />,
    );

    expect(screen.getByRole("button", { name: "다음 날" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "전일" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-07-31");

    rerender(
      <DailyWorkDatePicker value="2026-07-31" maxDate="2026-08-01" onChange={onChange} />,
    );

    const nextButton = screen.getByRole("button", { name: "다음 날" });
    expect(nextButton).toBeEnabled();

    fireEvent.click(nextButton);
    expect(onChange).toHaveBeenLastCalledWith("2026-08-01");
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

  it("revokes the server session when logout is confirmed", async () => {
    notificationBellState.operator = {
      employee_id: "emp-1", name: "김현우", department: "조립", warehouse_role: "none", department_role: "none",
    };
    render(<DesktopTopbar title="대시보드" onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /김현우/ }));
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    const dialog = await screen.findByRole("dialog", { name: "로그아웃" });

    fireEvent.click(within(dialog).getByRole("button", { name: "로그아웃" }));

    await waitFor(() => expect(notificationBellState.logoutCurrentOperator).toHaveBeenCalledTimes(1));
  });

  it("returns to login after a successful PIN change revokes the session", async () => {
    notificationBellState.operator = {
      employee_id: "emp-1", name: "김현우", department: "조립", warehouse_role: "none", department_role: "none",
    };
    render(<DesktopTopbar title="대시보드" onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /김현우/ }));
    fireEvent.click(screen.getByRole("button", { name: "PIN 변경" }));
    const dialog = await screen.findByRole("dialog", { name: "PIN 변경" });
    const inputs = dialog.querySelectorAll("input");
    fireEvent.change(inputs[0], { target: { value: "1234" } });
    fireEvent.change(inputs[1], { target: { value: "5678" } });
    fireEvent.change(inputs[2], { target: { value: "5678" } });

    fireEvent.click(within(dialog).getByRole("button", { name: "변경" }));

    await waitFor(() => expect(notificationBellState.changeMyPin).toHaveBeenCalledWith("emp-1", "1234", "5678"));
    expect(notificationBellState.returnToOperatorLogin).toHaveBeenCalledTimes(1);
  });
});
