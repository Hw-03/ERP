import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { DesktopRightPanel } from "../../DesktopRightPanel";

vi.mock("@/app/mes/_components/DepartmentsContext", () => ({
  useDeptColorLookup: () => () => LEGACY_COLORS.blue,
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

vi.mock("../InventoryDetailLocations", () => ({
  InventoryDetailLocations: () => null,
}));

import { InventoryDetailPanel } from "../InventoryDetailPanel";

const originalScrollToDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");

function makeItem(): Item {
  return {
    item_id: "item-1",
    item_name: "테스트 품목",
    mes_code: "46-AA-0080",
    spec: null,
    unit: "EA",
    quantity: 5,
    warehouse_qty: 5,
    min_stock: null,
    department: null,
    process_type: null,
    image_filename: null,
    locations: [],
  } as unknown as Item;
}

afterEach(() => {
  vi.restoreAllMocks();
  if (originalScrollToDescriptor) {
    Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScrollToDescriptor);
  } else {
    delete (HTMLElement.prototype as { scrollTo?: HTMLElement["scrollTo"] }).scrollTo;
  }
});

describe("InventoryDetailPanel desktop quick actions", () => {
  it("uses the danger token for the outbound action", () => {
    render(<InventoryDetailPanel item={makeItem()} onGoToWarehouse={() => {}} />);

    expect(screen.getByRole("button", { name: "출고" })).toHaveStyle({
      background: LEGACY_COLORS.red,
      color: LEGACY_COLORS.white,
    });
  });

  it("scrolls only the desktop detail body when opening an inbound menu", async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      if (this.dataset.testid === "desktop-right-panel-body") {
        return { top: 0, bottom: 500 } as DOMRect;
      }
      if (this.textContent?.includes("부서 입고")) {
        return { top: 460, bottom: 560 } as DOMRect;
      }
      return { top: 0, bottom: 0 } as DOMRect;
    });

    render(
      <DesktopRightPanel title="테스트 품목">
        <InventoryDetailPanel item={makeItem()} onGoToWarehouse={() => {}} />
      </DesktopRightPanel>,
    );

    const body = screen.getByTestId("desktop-right-panel-body");
    Object.defineProperty(body, "scrollTop", { configurable: true, value: 40 });
    fireEvent.click(screen.getByRole("button", { name: "입고" }));

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith({ top: 116, behavior: "smooth" });
    });
  });

  it("scrolls the desktop detail body when opening an outbound menu", async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      if (this.dataset.testid === "desktop-right-panel-body") {
        return { top: 0, bottom: 500 } as DOMRect;
      }
      if (this.textContent?.includes("부서 출고")) {
        return { top: 470, bottom: 570 } as DOMRect;
      }
      return { top: 0, bottom: 0 } as DOMRect;
    });

    render(
      <DesktopRightPanel title="테스트 품목">
        <InventoryDetailPanel item={makeItem()} onGoToWarehouse={() => {}} />
      </DesktopRightPanel>,
    );

    const body = screen.getByTestId("desktop-right-panel-body");
    Object.defineProperty(body, "scrollTop", { configurable: true, value: 40 });
    fireEvent.click(screen.getByRole("button", { name: "출고" }));

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith({ top: 126, behavior: "smooth" });
    });
  });

  it("gives expanded desktop choices a clearly taller tap area", () => {
    render(<InventoryDetailPanel item={makeItem()} onGoToWarehouse={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "입고" }));
    const choice = screen.getByRole("button", { name: /부서 입고/ });
    expect(choice).toHaveClass("min-h-[64px]", "py-3");
    expect(choice.parentElement).toHaveClass("w-[calc(200%+0.5rem)]", "gap-2", "p-3");
  });

  it("aligns outbound choices with the desktop detail panel left edge", () => {
    render(<InventoryDetailPanel item={makeItem()} onGoToWarehouse={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "출고" }));
    const choice = screen.getByRole("button", { name: /부서 출고/ });
    expect(choice.parentElement).toHaveClass("-translate-x-[calc(50%+0.25rem)]");
  });
});
