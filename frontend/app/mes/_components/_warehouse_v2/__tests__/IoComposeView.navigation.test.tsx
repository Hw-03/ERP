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
  name: "operator",
  department: "assembly",
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

function workTypeCards(): HTMLButtonElement[] {
  return screen.getAllByRole("button").filter((button): button is HTMLButtonElement => button.hasAttribute("aria-pressed"));
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

    expect(workTypeCards()).toHaveLength(2);
    expect(screen.queryByTestId("io-step-nav")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wizard-active-step-number")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wizard-active-step-title")).not.toBeInTheDocument();

    fireEvent.click(workTypeCards()[1]);

    await waitFor(() => {
      expect(screen.getByTestId("io-step-nav")).toBeInTheDocument();
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

    fireEvent.click(navItems[0]);

    await waitFor(() => {
      expect(screen.queryByTestId("io-step-nav")).not.toBeInTheDocument();
    });
    expect(workTypeCards()).toHaveLength(2);
  });

  it("does not show a preselected work type while choosing Step 1", async () => {
    renderCompose();

    expect(screen.queryByTestId("io-step-nav")).not.toBeInTheDocument();
    expect(workTypeCards()).toHaveLength(2);
    expect(workTypeCards().every((button) => button.getAttribute("aria-pressed") === "false")).toBe(true);

    fireEvent.click(workTypeCards()[1]);
    await waitFor(() => {
      expect(screen.getByTestId("io-step-nav")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByTestId("io-step-nav-item")[0]);
    await waitFor(() => {
      expect(screen.queryByTestId("io-step-nav")).not.toBeInTheDocument();
    });

    expect(workTypeCards()).toHaveLength(2);
    expect(workTypeCards().every((button) => button.getAttribute("aria-pressed") === "false")).toBe(true);
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
    expect(screen.getByTestId("item-conversion-source-search")).toBeInTheDocument();
    expect(screen.getByTestId("item-conversion-quantity")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("warehouse-item-conversion-card")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("item-conversion-source-search")).not.toBeInTheDocument();

    pushStateSpy.mockRestore();
  });
});
