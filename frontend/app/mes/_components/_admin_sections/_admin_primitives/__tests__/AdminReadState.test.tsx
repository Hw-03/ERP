import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminReadBoundary } from "../AdminReadState";

describe("AdminReadBoundary reveal", () => {
  const animate = vi.fn(() => ({ cancel: vi.fn() }));
  beforeEach(() => {
    animate.mockClear();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
  });
  afterEach(() => { Reflect.deleteProperty(Element.prototype, "animate"); vi.unstubAllGlobals(); });

  const view = (loading: boolean, error?: string) => <div data-testid="owner">
    <AdminReadBoundary read={{ loading, error, retry: vi.fn() }} label="Detail" skeleton={<span>Skeleton</span>}>
      <input aria-label="Draft" defaultValue="draft" />
    </AdminReadBoundary>
  </div>;

  it("reveals resolved content before paint and preserves edits on ordinary rerenders", () => {
    const { rerender } = render(view(true));
    screen.getByTestId("owner").style.setProperty("--admin-fade-duration", ".35s");
    expect(animate).not.toHaveBeenCalled();
    rerender(view(false));
    expect(animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: "ease-out" });
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "unsaved" } });
    input.focus();
    rerender(view(false));
    expect(animate).toHaveBeenCalledOnce();
    expect(screen.getByRole("textbox")).toBe(input);
    expect(input).toHaveValue("unsaved");
    expect(input).toHaveFocus();
  });

  it("skips errors and reveals successful retries", () => {
    const { rerender } = render(view(true));
    rerender(view(false, "Failed"));
    expect(animate).not.toHaveBeenCalled();
    rerender(view(true));
    rerender(view(false));
    expect(animate).toHaveBeenCalledOnce();
  });

  it("leaves the initial reveal to the opaque entry cover", () => {
    const covered = (loading: boolean) => <div data-admin-entry-covered="true">{view(loading)}</div>;
    const { rerender } = render(covered(true));
    rerender(covered(false));
    expect(animate).not.toHaveBeenCalled();
  });

  it("skips a nested reveal while the section entry already owns the fade", () => {
    const content = (loading: boolean, opacity: number) => <div data-admin-section-reveal style={{ opacity }}>{view(loading)}</div>;
    const { rerender } = render(content(true, 0.4));
    rerender(content(false, 0.4));
    expect(animate).not.toHaveBeenCalled();
    rerender(content(true, 1));
    rerender(content(false, 1));
    expect(animate).toHaveBeenCalledOnce();
  });

  it("honors reduced motion and does not fade initially ready content", () => {
    const { rerender } = render(view(false));
    expect(animate).not.toHaveBeenCalled();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    rerender(view(true));
    rerender(view(false));
    expect(animate).not.toHaveBeenCalled();
  });
});
