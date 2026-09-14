import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopSettingsView, type AppearancePreferences } from "../AppearanceSettingsModal";

const state = vi.hoisted(() => ({
  operator: {
    employee_id: "emp-1",
    name: "테스트 작업자",
    role: "작업자",
    department: "조립",
    level: "사원",
    employee_code: "E001",
    warehouse_role: "none",
    department_role: "none",
    assigned_model_slots: [],
    io_enabled: true,
    hidden_sidebar_tabs: [],
    loginPopupEnabled: true,
  },
  changeMyPin: vi.fn(),
  setLoginPopup: vi.fn(),
  updateCurrentOperatorPreferences: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: { changeMyPin: state.changeMyPin } }));
vi.mock("@/lib/api/employees", () => ({ employeesApi: { setLoginPopup: state.setLoginPopup } }));
vi.mock("../login/useCurrentOperator", () => ({
  useCurrentOperator: () => state.operator,
  updateCurrentOperatorPreferences: state.updateCurrentOperatorPreferences,
}));

const initialPreferences: AppearancePreferences = { theme: "light", sidebarMode: "hover" };

function renderSettings(overrides: Partial<React.ComponentProps<typeof DesktopSettingsView>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<DesktopSettingsView preferences={initialPreferences} onSave={onSave} {...overrides} />);
  return { onSave };
}

describe("DesktopSettingsView", () => {
  beforeEach(() => {
    state.operator.loginPopupEnabled = true;
    state.changeMyPin.mockReset();
    state.changeMyPin.mockResolvedValue(undefined);
    state.setLoginPopup.mockReset();
    state.setLoginPopup.mockResolvedValue({});
    state.updateCurrentOperatorPreferences.mockReset();
  });

  it("renders as normal settings content without a page-covering settings dialog", () => {
    renderSettings();

    expect(screen.getByTestId("desktop-settings-view")).toBeInTheDocument();
    expect(screen.queryByTestId("appearance-settings-backdrop")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "설정" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "라이트 테마" })).toBeInTheDocument();
  });

  it("keeps theme and sidebar choices as a draft until saved", async () => {
    const { onSave } = renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "다크 테마" }));
    fireEvent.click(screen.getByRole("button", { name: "펼침 고정" }));
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ theme: "dark", sidebarMode: "expanded" }));
  });

  it("resets unsaved appearance choices when cancelled without leaving the page", () => {
    const { onSave } = renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "다크 테마" }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId("desktop-settings-view")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "라이트 테마" })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens the PIN form only as a local settings dialog and closes it with Escape", () => {
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "PIN 재설정" }));
    expect(screen.getByRole("dialog", { name: "PIN 재설정" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "PIN 재설정" })).not.toBeInTheDocument();
    expect(screen.getByTestId("desktop-settings-view")).toBeInTheDocument();
  });

  it("validates and submits a PIN change", async () => {
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "PIN 재설정" }));
    fireEvent.change(screen.getByLabelText("현재 PIN"), { target: { value: "1234" } });
    fireEvent.change(screen.getByLabelText("새 PIN"), { target: { value: "5678" } });
    fireEvent.change(screen.getByLabelText("새 PIN 확인"), { target: { value: "5678" } });
    fireEvent.click(screen.getByRole("button", { name: "PIN 변경 저장" }));

    await waitFor(() => expect(state.changeMyPin).toHaveBeenCalledWith("emp-1", "1234", "5678"));
    expect(await screen.findByText("PIN이 변경되었습니다.")).toBeInTheDocument();
  });

  it("updates the login popup preference immediately", async () => {
    renderSettings();

    fireEvent.click(screen.getByRole("switch", { name: "로그인 시 읽지 않은 알림 팝업" }));

    await waitFor(() => expect(state.setLoginPopup).toHaveBeenCalledWith("emp-1", false));
    expect(state.updateCurrentOperatorPreferences).toHaveBeenCalledWith({ loginPopupEnabled: false });
  });

  it("shows the admin PIN shortcut only when the employee can open admin", () => {
    const onOpenAdminPinEntry = vi.fn();
    const { rerender } = render(
      <DesktopSettingsView
        preferences={initialPreferences}
        onSave={vi.fn().mockResolvedValue(undefined)}
        canOpenAdmin
        onOpenAdminPinEntry={onOpenAdminPinEntry}
      />,
    );

    expect(screen.getByText("기준 정보, BOM, 보안 설정을 관리합니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "관리" }));
    expect(onOpenAdminPinEntry).toHaveBeenCalledOnce();

    rerender(<DesktopSettingsView preferences={initialPreferences} onSave={vi.fn().mockResolvedValue(undefined)} />);
    expect(screen.queryByRole("button", { name: "관리" })).not.toBeInTheDocument();
  });
});
