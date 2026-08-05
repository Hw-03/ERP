import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AppearanceSettingsModal,
  type AppearancePreferences,
} from "../AppearanceSettingsModal";

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
  setCurrentOperator: vi.fn(),
  updateCurrentOperatorPreferences: vi.fn(),
  getStoredBootId: vi.fn(() => "boot-1"),
}));

vi.mock("@/lib/api", () => ({
  api: { changeMyPin: state.changeMyPin },
}));

vi.mock("@/lib/api/employees", () => ({
  employeesApi: { setLoginPopup: state.setLoginPopup },
}));

vi.mock("../login/useCurrentOperator", () => ({
  useCurrentOperator: () => state.operator,
  setCurrentOperator: state.setCurrentOperator,
  updateCurrentOperatorPreferences: state.updateCurrentOperatorPreferences,
  getStoredBootId: state.getStoredBootId,
}));

const initialPreferences: AppearancePreferences = {
  theme: "light",
  sidebarMode: "hover",
};

function renderModal(overrides: Partial<React.ComponentProps<typeof AppearanceSettingsModal>> = {}) {
  const onClose = vi.fn();
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <AppearanceSettingsModal
      open
      preferences={initialPreferences}
      onClose={onClose}
      onSave={onSave}
      {...overrides}
    />,
  );
  return { onClose, onSave };
}

describe("AppearanceSettingsModal", () => {
  beforeEach(() => {
    state.operator.loginPopupEnabled = true;
    state.changeMyPin.mockReset();
    state.changeMyPin.mockResolvedValue(undefined);
    state.setLoginPopup.mockReset();
    state.setLoginPopup.mockResolvedValue({});
    state.setCurrentOperator.mockReset();
    state.updateCurrentOperatorPreferences.mockReset();
    state.getStoredBootId.mockClear();
  });

  it("shows icon choices, an opaque backdrop, and closes on Escape", () => {
    const { onClose } = renderModal();

    expect(screen.getByTestId("appearance-settings-backdrop")).toHaveStyle({ background: "var(--c-bg)" });
    expect(screen.getByTestId("appearance-choice-icon-light")).toBeInTheDocument();
    expect(screen.getByTestId("appearance-choice-icon-expanded")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("uses the sidebar semantic colors for the compact choice rows", () => {
    renderModal();

    expect(screen.getByRole("button", { name: "라이트 테마" })).toHaveStyle({ borderColor: "var(--c-yellow)" });
    expect(screen.getByTestId("appearance-choice-icon-dark").parentElement).toHaveStyle({ color: "var(--c-purple)" });
    expect(screen.getByTestId("appearance-choice-icon-collapsed").parentElement).toHaveStyle({ color: "var(--c-blue)" });

    fireEvent.click(screen.getByRole("button", { name: "다크 테마" }));

    expect(screen.getByRole("button", { name: "다크 테마" })).toHaveStyle({ borderColor: "var(--c-purple)" });
  });

  it("opens and closes the PIN inputs from the borderless PIN row", () => {
    renderModal();

    const pinButton = screen.getByRole("button", { name: "PIN 재설정" });
    expect(screen.getByTestId("settings-pin-item")).not.toHaveClass("border");
    expect(pinButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(pinButton);
    expect(screen.getByLabelText("현재 PIN")).toBeInTheDocument();

    fireEvent.click(pinButton);
    expect(screen.queryByLabelText("현재 PIN")).not.toBeInTheDocument();
  });

  it("uses a vertical desktop divider instead of boxed setting groups", () => {
    renderModal({ canOpenAdmin: true, onOpenAdminPinEntry: vi.fn() });

    expect(screen.getByTestId("settings-theme-group")).not.toHaveClass("border");
    expect(screen.getByTestId("settings-sidebar-group")).not.toHaveClass("border");
    expect(screen.getByTestId("settings-layout")).toHaveClass("content-start", "gap-y-6");
    expect(screen.getByTestId("settings-layout")).not.toHaveClass("content-between");
    expect(screen.getByTestId("settings-column-divider")).toHaveClass("lg:border-l");
    expect(screen.getByTestId("settings-theme-group")).toHaveClass("lg:col-start-1", "lg:row-start-1");
    expect(screen.getByTestId("settings-sidebar-group")).toHaveClass("lg:col-start-1", "lg:row-start-2");
    expect(screen.getByTestId("settings-personal-group")).toHaveClass("lg:col-start-2", "lg:row-start-1");
    expect(screen.getByTestId("settings-admin-group")).toHaveClass("lg:col-start-2", "lg:row-start-2");
    expect(screen.getByTestId("settings-theme-group-divider")).toHaveClass("border-t");
  });

  it("keeps only setting names above the rows without redundant descriptions", () => {
    renderModal();

    expect(screen.queryByText("화면 표시와 개인 설정을 관리하세요.")).not.toBeInTheDocument();
    expect(screen.queryByText("화면 색상을 선택합니다.")).not.toBeInTheDocument();
    expect(screen.queryByText("데스크톱 왼쪽 메뉴의 펼침 방식을 선택합니다.")).not.toBeInTheDocument();
    expect(screen.queryByText("내 PIN과 로그인 알림 표시를 관리합니다.")).not.toBeInTheDocument();
  });

  it("keeps the modal open when Escape is pressed during saving", async () => {
    let resolveSave: (() => void) | undefined;
    const onSave = vi.fn(() => new Promise<void>((resolve) => {
      resolveSave = resolve;
    }));
    const { onClose } = renderModal({ onSave });

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    resolveSave?.();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("shows the management shortcut only when the admin tab is available", () => {
    const onOpenAdminPinEntry = vi.fn();
    const adminProps = { canOpenAdmin: true, onOpenAdminPinEntry };
    const { rerender } = render(
      <AppearanceSettingsModal
        open
        preferences={initialPreferences}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
        {...(adminProps as unknown as React.ComponentProps<typeof AppearanceSettingsModal>)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "PIN 재설정" }));
    fireEvent.change(screen.getByLabelText("현재 PIN"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "관리" }));
    expect(onOpenAdminPinEntry).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "PIN 재설정" })).toHaveAttribute("aria-expanded", "false");

    rerender(
      <AppearanceSettingsModal
        open
        preferences={initialPreferences}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.queryByRole("button", { name: "관리" })).not.toBeInTheDocument();
  });

  it("저장 전 선택은 임시 상태로만 유지하고 취소하면 저장하지 않는다", () => {
    const { onClose, onSave } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "다크 테마" }));
    fireEvent.click(screen.getByRole("button", { name: "접힘 고정" }));

    expect(screen.getByRole("button", { name: "다크 테마" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "접힘 고정" })).toHaveAttribute("aria-pressed", "true");
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("저장하면 두 설정을 함께 전달하고 모달을 닫는다", async () => {
    const { onClose, onSave } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "다크 테마" }));
    fireEvent.click(screen.getByRole("button", { name: "펼침 고정" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ theme: "dark", sidebarMode: "expanded" });
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("저장 실패 시 선택값과 오류를 유지한다", async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error("network"));
    renderModal({ onSave });

    fireEvent.click(screen.getByRole("button", { name: "다크 테마" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("설정을 저장하지 못했습니다. 다시 시도해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "설정" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다크 테마" })).toHaveAttribute("aria-pressed", "true");
  });

  it("현재 PIN과 일치하는 새 PIN을 즉시 변경하고 중복 제출을 막는다", async () => {
    let resolveChange: (() => void) | undefined;
    state.changeMyPin.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveChange = resolve;
    }));
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "PIN 재설정" }));
    fireEvent.change(screen.getByLabelText("현재 PIN"), { target: { value: "1234" } });
    fireEvent.change(screen.getByLabelText("새 PIN"), { target: { value: "5678" } });
    fireEvent.change(screen.getByLabelText("새 PIN 확인"), { target: { value: "5678" } });

    const submit = screen.getByRole("button", { name: "PIN 변경 저장" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(state.changeMyPin).toHaveBeenCalledOnce();
    expect(state.changeMyPin).toHaveBeenCalledWith("emp-1", "1234", "5678");
    expect(submit).toBeDisabled();

    resolveChange?.();
    expect(await screen.findByText("PIN이 변경되었습니다.")).toBeInTheDocument();
    expect(screen.queryByLabelText("현재 PIN")).not.toBeInTheDocument();
  });

  it("PIN 불일치와 API 실패를 같은 펼침 영역에서 안내한다", async () => {
    state.changeMyPin.mockRejectedValueOnce(new Error("현재 PIN이 올바르지 않습니다."));
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "PIN 재설정" }));
    fireEvent.change(screen.getByLabelText("현재 PIN"), { target: { value: "1234" } });
    fireEvent.change(screen.getByLabelText("새 PIN"), { target: { value: "5678" } });
    fireEvent.change(screen.getByLabelText("새 PIN 확인"), { target: { value: "5679" } });
    fireEvent.click(screen.getByRole("button", { name: "PIN 변경 저장" }));

    expect(await screen.findByText("새 PIN과 확인 PIN이 일치하지 않습니다.")).toBeInTheDocument();
    expect(state.changeMyPin).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("새 PIN 확인"), { target: { value: "5678" } });
    fireEvent.click(screen.getByRole("button", { name: "PIN 변경 저장" }));

    expect(await screen.findByText("현재 PIN이 올바르지 않습니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("현재 PIN")).toHaveValue("1234");
  });

  it("닫기 요청 시 재오픈 effect 전에 PIN 펼침·입력·오류를 초기화한다", async () => {
    const props = {
      preferences: initialPreferences,
      onClose: vi.fn(),
      onSave: vi.fn().mockResolvedValue(undefined),
    };
    const { rerender } = render(<AppearanceSettingsModal open {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "PIN 재설정" }));
    fireEvent.change(screen.getByLabelText("현재 PIN"), { target: { value: "1234" } });
    fireEvent.change(screen.getByLabelText("새 PIN"), { target: { value: "5678" } });
    fireEvent.change(screen.getByLabelText("새 PIN 확인"), { target: { value: "5679" } });
    fireEvent.click(screen.getByRole("button", { name: "PIN 변경 저장" }));
    expect(await screen.findByText("새 PIN과 확인 PIN이 일치하지 않습니다.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(props.onClose).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "PIN 재설정" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("현재 PIN")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("새 PIN")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("새 PIN 확인")).not.toBeInTheDocument();
    expect(screen.queryByText("새 PIN과 확인 PIN이 일치하지 않습니다.")).not.toBeInTheDocument();

    rerender(<AppearanceSettingsModal open={false} {...props} />);
    rerender(<AppearanceSettingsModal open {...props} />);
    expect(screen.getByRole("button", { name: "PIN 재설정" })).toHaveAttribute("aria-expanded", "false");
  });

  it("로그인 알림 팝업 설정을 즉시 저장하고 현재 작업자 상태를 공유한다", async () => {
    renderModal();

    const toggle = screen.getByRole("switch", { name: "로그인 시 읽지 않은 알림 팝업" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(state.setLoginPopup).toHaveBeenCalledWith("emp-1", false);
    });
    expect(state.updateCurrentOperatorPreferences).toHaveBeenCalledWith({ loginPopupEnabled: false });
    expect(state.setCurrentOperator).not.toHaveBeenCalled();
    expect(state.getStoredBootId).not.toHaveBeenCalled();
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("알림 팝업 설정을 저장했습니다.")).toBeInTheDocument();
  });

  it("로그인 알림 팝업 저장 실패 시 기존 설정을 유지한다", async () => {
    state.setLoginPopup.mockRejectedValueOnce(new Error("network"));
    renderModal();

    const toggle = screen.getByRole("switch", { name: "로그인 시 읽지 않은 알림 팝업" });
    fireEvent.click(toggle);

    expect(await screen.findByText("알림 팝업 설정을 저장하지 못했습니다.")).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(state.setCurrentOperator).not.toHaveBeenCalled();
  });
});
