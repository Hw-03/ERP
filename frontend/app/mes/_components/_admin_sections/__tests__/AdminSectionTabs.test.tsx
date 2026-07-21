import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminSectionTabs } from "../AdminSectionTabs";

describe("AdminSectionTabs", () => {
  it("현재 섹션을 페이지 탭으로 표시하고 다른 탭 선택을 전달한다", () => {
    const onSelect = vi.fn();

    render(
      <AdminSectionTabs
        section="models"
        onSelect={onSelect}
        onLock={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "모델 관리" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByRole("button", { name: "BOM 관리" }));

    expect(onSelect).toHaveBeenCalledWith("bom");
  });

  it("관리자 잠금 동작을 별도 버튼으로 제공한다", () => {
    const onLock = vi.fn();

    render(
      <AdminSectionTabs
        section="settings"
        onSelect={vi.fn()}
        onLock={onLock}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "관리자 잠금" }));

    expect(onLock).toHaveBeenCalledOnce();
  });
});
