import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InventoryTableStickyHeader } from "../InventoryFilterBar";
import { InventoryTable } from "../InventoryTable";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("desktop inventory sticky header", () => {
  it("검색창이 커져도 열 헤더와 모서리를 검색창 바로 아래에 고정한다", () => {
    let height = 75;
    let resize: ResizeObserverCallback = () => {};
    const disconnect = vi.fn();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ height } as DOMRect));
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) { resize = callback; }
      observe = vi.fn();
      disconnect = disconnect;
    });
    const { container, unmount } = render(<section>
      <InventoryTableStickyHeader searchValue="" onSearchChange={() => {}} count={1} isFiltered={false} onManageSearch={() => {}} />
      <InventoryTable columns={[{ label: "품목명" }]}><tr><td>전극</td></tr></InventoryTable>
    </section>);
    const surface = container.firstElementChild as HTMLElement;
    expect(surface.style.getPropertyValue("--desktop-inventory-header-top")).toBe("75px");
    expect(container.querySelector("thead")).toHaveStyle({ top: "var(--desktop-inventory-header-top,75px)" });
    expect(screen.getByTestId("inventory-table-corner-mask")).toHaveStyle({ top: "var(--desktop-inventory-header-top,75px)" });

    height = 119;
    act(() => resize([], {} as ResizeObserver));
    expect(surface.style.getPropertyValue("--desktop-inventory-header-top")).toBe("119px");
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
