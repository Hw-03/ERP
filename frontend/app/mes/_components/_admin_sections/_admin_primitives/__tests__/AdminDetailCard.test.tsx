import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminDetailCard } from "../AdminDetailCard";

describe("AdminDetailCard", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fades a new selection without remounting inputs or replaying on an ordinary rerender", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    const { container, rerender } = render(<AdminDetailCard selectionKey="first"><input aria-label="Draft" defaultValue="draft" /></AdminDetailCard>);
    const card = container.querySelector<HTMLElement>("[data-admin-detail-content]")!;
    card.style.setProperty("--admin-fade-duration", "350ms");
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel }));
    Object.defineProperty(card, "animate", { value: animate });
    const input = screen.getByRole("textbox", { name: "Draft" });
    fireEvent.change(input, { target: { value: "unsaved" } });
    input.focus();

    rerender(<AdminDetailCard selectionKey="second"><input aria-label="Draft" defaultValue="draft" /></AdminDetailCard>);
    expect(animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: "ease-out" });
    expect(screen.getByRole("textbox", { name: "Draft" })).toBe(input);
    expect(input).toHaveValue("unsaved");
    expect(input).toHaveFocus();

    rerender(<AdminDetailCard selectionKey="second"><input aria-label="Draft" defaultValue="draft" /></AdminDetailCard>);
    expect(animate).toHaveBeenCalledTimes(1);
    rerender(<AdminDetailCard selectionKey="third"><input aria-label="Draft" defaultValue="draft" /></AdminDetailCard>);
    expect(cancel).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenCalledTimes(2);
  });

  it("skips the selection fade when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const { container, rerender } = render(<AdminDetailCard selectionKey="first">content</AdminDetailCard>);
    const animate = vi.fn();
    Object.defineProperty(container.querySelector("[data-admin-detail-content]"), "animate", { value: animate });
    rerender(<AdminDetailCard selectionKey="second">content</AdminDetailCard>);
    expect(animate).not.toHaveBeenCalled();
  });

  it("lets the entry cover own the reveal and resumes selection fades after it is removed", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    const view = (covered: boolean, selectionKey: string) => <div data-admin-entry-covered={covered || undefined}><AdminDetailCard selectionKey={selectionKey}>content</AdminDetailCard></div>;
    const { container, rerender } = render(view(true, "first"));
    const body = container.querySelector<HTMLElement>("[data-admin-detail-content]")!;
    body.style.setProperty("--admin-fade-duration", "350ms");
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    Object.defineProperty(body, "animate", { value: animate });
    rerender(view(true, "second"));
    expect(animate).not.toHaveBeenCalled();
    rerender(view(false, "second"));
    expect(animate).not.toHaveBeenCalled();
    rerender(view(false, "third"));
    expect(animate).toHaveBeenCalledOnce();
  });


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

  it("renders tab actions beside, rather than inside, the tablist", () => {
    render(
      <AdminDetailCard
        tabs={[{ id: "info", label: "Info" }, { id: "history", label: "History" }]}
        activeTab="info"
        tabActions={<button type="button">Delete</button>}
      >
        content
      </AdminDetailCard>,
    );

    const tablist = screen.getByRole("tablist");
    const deleteButton = screen.getByRole("button", { name: "Delete" });
    const tabRow = tablist.parentElement!;
    const actionWrapper = tablist.nextElementSibling;

    expect(tabRow).toHaveClass("flex", "justify-between");
    expect(tabRow.previousElementSibling).toBeNull();
    expect(tablist).toHaveClass("min-w-0", "flex-1", "flex-nowrap", "overflow-x-auto");
    expect(actionWrapper).toBe(deleteButton.parentElement);
    expect(actionWrapper).toHaveClass("shrink-0");
    expect(actionWrapper).toContainElement(deleteButton);
    expect(tablist).not.toContainElement(deleteButton);
  });
});
