import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SlidePanel } from "../SlidePanel";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SlidePanel", () => {
  it("keeps the default modal dialog semantics and focus trap", () => {
    vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body);

    render(
      <SlidePanel open onClose={() => {}} hideCloseButton labelledBy="modal-panel-title">
        <h2 id="modal-panel-title">모달 상세</h2>
        <button type="button">첫 동작</button>
        <button type="button">마지막 동작</button>
      </SlidePanel>,
    );

    const dialog = screen.getByRole("dialog", { name: "모달 상세" });
    const first = screen.getByRole("button", { name: "첫 동작" });
    const last = screen.getByRole("button", { name: "마지막 동작" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "modal-panel-title");
    expect(first).toHaveFocus();

    last.focus();
    expect(fireEvent.keyDown(last, { key: "Tab" })).toBe(false);
    expect(first).toHaveFocus();
  });

  it("uses a nonmodal complementary region without trapping focus and still closes on Escape", () => {
    vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(document.body);
    const onClose = vi.fn();

    render(
      <>
        <button type="button">목록 행</button>
        <SlidePanel
          open
          modal={false}
          onClose={onClose}
          hideCloseButton
          labelledBy="history-panel-title"
        >
          <h2 id="history-panel-title">선택 품목명</h2>
          <button type="button">패널 동작</button>
        </SlidePanel>
      </>,
    );

    const panel = screen.getByRole("complementary", { name: "선택 품목명" });
    const action = screen.getByRole("button", { name: "패널 동작" });
    expect(panel).not.toHaveAttribute("aria-modal");
    expect(panel).toHaveAttribute("aria-labelledby", "history-panel-title");

    action.focus();
    expect(fireEvent.keyDown(action, { key: "Tab" })).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("hides retained children from focus and accessibility while closed, then restores them", () => {
    const onClose = vi.fn();
    const renderPanel = (open: boolean) => (
      <SlidePanel open={open} onClose={onClose} hideCloseButton labelledBy="retained-panel-title">
        <h2 id="retained-panel-title">유지된 상세</h2>
        <button type="button">유지된 동작</button>
      </SlidePanel>
    );
    const { rerender } = render(renderPanel(false));

    expect(screen.queryByRole("button", { name: "유지된 동작" })).not.toBeInTheDocument();
    const retainedAction = screen.getByRole("button", { name: "유지된 동작", hidden: true });
    const hiddenWrapper = retainedAction.closest("[aria-hidden='true']");
    expect(hiddenWrapper).toHaveAttribute("inert");

    rerender(renderPanel(true));

    const restoredAction = screen.getByRole("button", { name: "유지된 동작" });
    expect(screen.getByRole("dialog", { name: "유지된 상세" })).toHaveAttribute("aria-modal", "true");
    expect(restoredAction.closest("[aria-hidden]")).toBeNull();
    expect(restoredAction.closest("[inert]")).toBeNull();
  });
});
