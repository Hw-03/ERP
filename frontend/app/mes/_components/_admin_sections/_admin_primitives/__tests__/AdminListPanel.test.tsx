import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminListPanel } from "../AdminListPanel";

describe("AdminListPanel large lists", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 400, height: 300, top: 0, left: 0, bottom: 300, right: 400, x: 0, y: 0, toJSON: () => ({}),
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(300);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(51_000);
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: function(this: HTMLElement, options: ScrollToOptions) {
      this.scrollTop = options.top ?? 0;
      this.dispatchEvent(new Event("scroll"));
    } });
  });
  afterEach(() => { vi.restoreAllMocks(); Reflect.deleteProperty(HTMLElement.prototype, "scrollTo"); });
  const items = Array.from({ length: 1000 }, (_, id) => ({ id }));
  const row = ({ id }: { id: number }) => <button key={id}>Row {id}</button>;
  const getKey = ({ id }: { id: number }) => String(id);

  it("mounts only visible rows and makes the last row reachable by keyboard", async () => {
    render(<AdminListPanel items={items} renderItem={row} virtual={{ getKey, estimateSize: 51 }} />);
    expect(screen.getAllByRole("button").length).toBeLessThan(80);
    const first = screen.getByRole("button", { name: "Row 0", exact: true });
    act(() => first.focus());
    fireEvent.keyDown(first, { key: "End" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Row 999", exact: true })).toHaveFocus());
  });

  it("retains an explicitly pinned editing row outside the visible range", () => {
    render(<AdminListPanel items={items} renderItem={row} virtual={{ getKey, estimateSize: 51, pinnedKeys: ["999"] }} />);
    expect(screen.getByRole("button", { name: "Row 999", exact: true })).toBeInTheDocument();
    expect(screen.getAllByRole("button").length).toBeLessThan(80);
  });
});
