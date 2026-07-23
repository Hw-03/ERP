import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminDetailCard } from "../AdminDetailCard";

describe("AdminDetailCard", () => {
  it("renders detail tabs as rounded selectable buttons and reserves scrollbar space for content", () => {
    const onTabChange = vi.fn();
    const { container } = render(
      <AdminDetailCard
        tabs={[{ id: "info", label: "Info" }, { id: "history", label: "History" }]}
        activeTab="info"
        onTabChange={onTabChange}
      >
        content
      </AdminDetailCard>,
    );

    const activeTab = screen.getByRole("tab", { name: "Info" });
    const panel = screen.getByRole("tabpanel");

    expect(activeTab).toHaveAttribute("aria-selected", "true");
    expect(activeTab).toHaveAttribute("tabindex", "0");
    expect(activeTab).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", activeTab.id);
    expect(activeTab).toHaveClass("rounded-[12px]", "border", "focus-visible:ring-2");
    expect(container.querySelector("[data-admin-detail-content]")).toHaveClass("[scrollbar-gutter:stable]");

    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(onTabChange).toHaveBeenCalledWith("history");
  });

  it("changes the selected tab and moves focus with arrow, Home, and End keys", () => {
    const onTabChange = vi.fn();
    render(
      <AdminDetailCard
        tabs={[
          { id: "info", label: "Info" },
          { id: "history", label: "History" },
          { id: "settings", label: "Settings" },
        ]}
        activeTab="info"
        onTabChange={onTabChange}
      >
        content
      </AdminDetailCard>,
    );

    const info = screen.getByRole("tab", { name: "Info" });
    const history = screen.getByRole("tab", { name: "History" });
    const settings = screen.getByRole("tab", { name: "Settings" });

    info.focus();
    fireEvent.keyDown(info, { key: "ArrowRight" });
    expect(onTabChange).toHaveBeenLastCalledWith("history");
    expect(history).toHaveFocus();

    fireEvent.keyDown(history, { key: "ArrowLeft" });
    expect(onTabChange).toHaveBeenLastCalledWith("info");
    expect(info).toHaveFocus();

    fireEvent.keyDown(info, { key: "End" });
    expect(onTabChange).toHaveBeenLastCalledWith("settings");
    expect(settings).toHaveFocus();

    fireEvent.keyDown(settings, { key: "Home" });
    expect(onTabChange).toHaveBeenLastCalledWith("info");
    expect(info).toHaveFocus();
  });

  it("제목 없이 action만 있으면 확인 action을 한 줄 전체 폭으로 배치한다", () => {
    render(
      <AdminDetailCard
        actions={
          <>
            <span>정말 삭제하시겠습니까?</span>
            <button type="button">취소</button>
            <button type="button">삭제 확인</button>
          </>
        }
      >
        content
      </AdminDetailCard>,
    );

    expect(screen.getByRole("button", { name: "삭제 확인" }).parentElement).toHaveClass("w-full", "flex-nowrap");
  });
});
