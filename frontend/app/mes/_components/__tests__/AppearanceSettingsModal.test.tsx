import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AppearanceSettingsModal,
  type AppearancePreferences,
} from "../AppearanceSettingsModal";

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
});
