import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";
import { api } from "@/lib/api";
import { IoComposeView } from "../IoComposeView";

const routerPush = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/mes",
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => new URLSearchParams("tab=warehouse"),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getAllBOM: vi.fn(),
    getItems: vi.fn(),
    preview: vi.fn(),
    saveDraft: vi.fn(),
    getDraft: vi.fn(),
    deleteDraft: vi.fn(),
    submit: vi.fn(),
    getItemConversionPreview: vi.fn(),
    executeItemConversion: vi.fn(),
  },
}));

const operator = {
  employee_id: "op-1",
  name: "김현우",
  department: "조립",
  warehouse_role: "none",
};

function renderCompose(items: Item[] = []) {
  return render(
    <IoComposeView
      globalSearch=""
      operator={operator}
      employees={[]}
      items={items}
      productModels={[]}
      setItems={() => {}}
      onStatusChange={() => {}}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getAllBOM).mockResolvedValue([]);
  vi.mocked(api.getItems).mockResolvedValue([]);
  routerPush.mockClear();
});

describe("IoComposeView navigation chrome", () => {
  it("keeps one five-step navigation row and removes duplicate active headers", async () => {
    renderCompose();

    const getWarehouseWorkCard = () =>
      screen
        .getAllByRole("button", { name: /창고 입출고/ })
        .find((button) => button.hasAttribute("aria-pressed"));

    expect(getWarehouseWorkCard()).toBeInTheDocument();
    expect(screen.queryByTestId("io-step-nav")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wizard-active-step-number")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wizard-active-step-title")).not.toBeInTheDocument();

    fireEvent.click(getWarehouseWorkCard()!);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /작업 유형 선택/ })).toBeInTheDocument();
    });
    const navItems = screen.getAllByTestId("io-step-nav-item");
    expect(navItems).toHaveLength(5);
    expect(navItems[0]).toHaveClass("done");
    expect(navItems[1]).toHaveClass("a");
    expect(navItems.slice(2).every((item) => item.classList.contains("locked"))).toBe(true);
    expect(navItems[0]).not.toHaveAttribute("disabled");
    expect(navItems.slice(2).every((item) => item.hasAttribute("disabled"))).toBe(true);
    expect(screen.queryByTestId("wizard-active-step-number")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wizard-active-step-title")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /품목 전환/ })).not.toBeInTheDocument();
    expect(screen.getByText("세부 작업과 부서 선택")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /작업 유형 선택/ }));

    await waitFor(() => {
      expect(getWarehouseWorkCard()).toBeInTheDocument();
    });
    expect(screen.queryByTestId("io-step-nav")).not.toBeInTheDocument();
  });

  it("does not show a preselected work type while choosing Step 1", async () => {
    renderCompose();

    const getWorkCards = () =>
      screen.getAllByRole("button").filter((button) => button.hasAttribute("aria-pressed"));

    expect(screen.queryByTestId("io-step-nav")).not.toBeInTheDocument();
    expect(getWorkCards()).toHaveLength(2);
    expect(getWorkCards().every((button) => button.getAttribute("aria-pressed") === "false")).toBe(true);

    fireEvent.click(getWorkCards()[1]);
    await waitFor(() => {
      expect(screen.getByTestId("io-step-nav")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByTestId("io-step-nav-item")[0]);
    await waitFor(() => {
      expect(screen.queryByTestId("io-step-nav")).not.toBeInTheDocument();
    });

    expect(getWorkCards()).toHaveLength(2);
    expect(getWorkCards().every((button) => button.getAttribute("aria-pressed") === "false")).toBe(true);
  });
  it("closes item conversion on browser back like other warehouse work screens", async () => {
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    renderCompose();

    fireEvent.click(screen.getByTestId("warehouse-item-conversion-card"));

    expect(pushStateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ wic: "work" }),
      "",
      expect.any(String),
    );
    expect(screen.getByRole("button", { name: /사양 전환/ })).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("warehouse-item-conversion-card")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /사양 전환/ })).not.toBeInTheDocument();

    pushStateSpy.mockRestore();
  });
});
