import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminDetailCard } from "../AdminDetailCard";

describe("AdminDetailCard", () => {
  const selectionCancel = vi.fn();
  const selectionAnimation = vi.fn(() => ({ cancel: selectionCancel }));
  beforeEach(() => {
    selectionCancel.mockClear();
    selectionAnimation.mockClear();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    Object.defineProperty(Element.prototype, "animate", { configurable: true, value: selectionAnimation });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 400, height: 300, left: 100, top: 200 } as DOMRect);
  });
  afterEach(() => { Reflect.deleteProperty(Element.prototype, "animate"); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("keeps the previous detail over the new one while preserving the live input DOM", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 400, height: 300, left: 100, top: 200 } as DOMRect);
    try {
      const content = (key: string, label: string) => <AdminDetailCard externalScrollbar selectionKey={key}><span>{label}</span><label htmlFor="draft">Draft</label><input id="draft" name="draft" defaultValue="draft" /></AdminDetailCard>;
      const { container, rerender, unmount } = render(content("first", "First employee"));
      const body = container.querySelector<HTMLElement>("[data-admin-detail-content]")!;
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "unsaved" } });
      input.focus();
      rerender(content("second", "Second employee"));
      const overlay = container.querySelector<HTMLElement>("[data-admin-detail-snapshot]")!;
      expect(overlay).toHaveTextContent("First employee");
      expect(overlay).not.toHaveTextContent("Second employee");
      expect(overlay).toHaveAttribute("aria-hidden", "true");
      expect(overlay.inert).toBe(true);
      expect(overlay.style.backgroundColor).toBe("var(--c-bg)");
      expect(overlay.style.backgroundImage).toBe("linear-gradient(var(--c-s1), var(--c-s1))");
      expect(overlay).toHaveStyle({ position: "absolute", left: `${body.offsetLeft}px`, top: `${body.offsetTop}px` });
      expect(overlay.querySelector("[id], [name], [for]")).toBeNull();
      expect(input).toHaveAccessibleName("Draft");
      expect(body).toHaveTextContent("Second employee");
      expect(getComputedStyle(body).opacity).not.toBe("0");
      expect(screen.getByRole("textbox")).toBe(input);
      expect(input).toHaveValue("unsaved");
      expect(input).toHaveFocus();
      expect(animate).toHaveBeenCalledWith([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: "ease-out", fill: "forwards" });
      const animation = animate.mock.results.at(-1)!.value as unknown as Animation;
      animation.onfinish?.call(animation, {} as AnimationPlaybackEvent);
      expect(container.querySelector("[data-admin-detail-snapshot]")).toBeNull();
      rerender(content("third", "Third employee"));
      expect(container.querySelectorAll("[data-admin-detail-snapshot]")).toHaveLength(1);
      const superseded = animate.mock.results.at(-1)!.value as unknown as Animation;
      rerender(content("fourth", "Fourth employee"));
      const latest = container.querySelector("[data-admin-detail-snapshot]");
      superseded.onfinish?.call(superseded, {} as AnimationPlaybackEvent);
      expect(container.querySelector("[data-admin-detail-snapshot]")).toBe(latest);
      unmount();
      expect(document.querySelector("[data-admin-detail-snapshot]")).toBeNull();
    } finally { bounds.mockRestore(); Reflect.deleteProperty(Element.prototype, "animate"); }
  });

  it.each(["350ms", ".35s"])("uses the same selection fade and converts %s to milliseconds", (duration) => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    const { container, rerender } = render(<AdminDetailCard selectionKey="first">content</AdminDetailCard>);
    const body = container.querySelector<HTMLElement>("[data-admin-detail-content]")!;
    body.style.setProperty("--admin-fade-duration", duration);
    // 이전 직원 화면의 예외가 남아 있어도 공통 전환을 바꾸지 않는다.
    body.style.setProperty("--admin-selection-opacity", "0.65");
    const animate = selectionAnimation;
    rerender(<AdminDetailCard selectionKey="second">content</AdminDetailCard>);
    expect(animate).toHaveBeenCalledWith([{ opacity: 1 }, { opacity: 0 }], { duration: 350, easing: "ease-out", fill: "forwards" });
  });

  it("places the optional scrollbar outside the detail card frame", () => {
    const { container } = render(<AdminDetailCard externalScrollbar>content</AdminDetailCard>);
    const viewport = container.querySelector("[data-admin-detail-content]")!;
    expect(viewport).toHaveAttribute("data-scrollbar-rail-viewport");
    expect(viewport).toHaveClass("lg:-right-2.5", "absolute");
    expect(viewport.parentElement).toHaveAttribute("data-scrollbar-rail-shell");
    expect(viewport.parentElement?.parentElement).toHaveClass("lg:mr-2.5");
    expect(viewport.parentElement?.querySelector("[data-scrollbar-rail-masks]")).toHaveClass("pointer-events-none", "absolute");
  });

  it("fades a new selection without remounting inputs or replaying on an ordinary rerender", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    const { container, rerender } = render(<AdminDetailCard selectionKey="first"><input aria-label="Draft" defaultValue="draft" /></AdminDetailCard>);
    const card = container.querySelector<HTMLElement>("[data-admin-detail-content]")!;
    card.style.setProperty("--admin-fade-duration", "350ms");
    const cancel = selectionCancel;
    const animate = selectionAnimation;
    const input = screen.getByRole("textbox", { name: "Draft" });
    fireEvent.change(input, { target: { value: "unsaved" } });
    input.focus();

    rerender(<AdminDetailCard selectionKey="second"><input aria-label="Draft" defaultValue="draft" /></AdminDetailCard>);
    expect(animate).toHaveBeenCalledWith([{ opacity: 1 }, { opacity: 0 }], { duration: 350, easing: "ease-out", fill: "forwards" });
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
    const animate = selectionAnimation;
    rerender(<AdminDetailCard selectionKey="second">content</AdminDetailCard>);
    expect(animate).not.toHaveBeenCalled();
  });

  it("lets the entry cover own the reveal and resumes selection fades after it is removed", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    const view = (covered: boolean, selectionKey: string) => <div data-admin-entry-covered={covered || undefined}><AdminDetailCard selectionKey={selectionKey}>content</AdminDetailCard></div>;
    const { container, rerender } = render(view(true, "first"));
    const body = container.querySelector<HTMLElement>("[data-admin-detail-content]")!;
    body.style.setProperty("--admin-fade-duration", "350ms");
    const animate = selectionAnimation;
    rerender(view(true, "second"));
    expect(animate).not.toHaveBeenCalled();
    rerender(view(false, "second"));
    expect(animate).not.toHaveBeenCalled();
    rerender(view(false, "third"));
    expect(animate).toHaveBeenCalledOnce();
  });

  it("fades only the body once when the selected item and active tab change together", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    const tabs = [{ id: "info", label: "Info" }, { id: "stock", label: "Stock" }];
    const content = (selectionKey: string, activeTab: string) => (
      <AdminDetailCard selectionKey={selectionKey} tabs={tabs} activeTab={activeTab} footer={<button>Save</button>}>
        <input aria-label="Draft" defaultValue="draft" />
      </AdminDetailCard>
    );
    const { rerender } = render(content("first", "info"));
    const panel = screen.getByRole("tabpanel");
    panel.style.setProperty("--admin-fade-duration", "350ms");
    const animate = selectionAnimation;
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "unsaved" } });
    const stockTab = screen.getByRole("tab", { name: "Stock" });
    stockTab.focus();

    rerender(content("first", "stock"));
    expect(animate).toHaveBeenCalledTimes(1);
    expect(stockTab).toHaveFocus();
    expect(input).toHaveValue("unsaved");
    expect(panel).not.toContainElement(stockTab);
    expect(panel).not.toContainElement(screen.getByRole("button", { name: "Save" }));
    rerender(content("first", "stock"));
    expect(animate).toHaveBeenCalledTimes(1);
    rerender(content("second", "info"));
    expect(animate).toHaveBeenCalledTimes(2);
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
