import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Item, ItemConversionResult } from "@/lib/api";
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

vi.mock("../IoBundleCart", () => ({
  IoBundleCart: ({ onAdvance }: { onAdvance: () => void }) => (
    <button type="button" data-testid="draft-step-advance" onClick={onAdvance}>advance</button>
  ),
}));

vi.mock("../IoConfirmStep", () => ({
  IoConfirmStep: ({ onSaveDraft }: { onSaveDraft: () => void }) => (
    <button type="button" data-testid="draft-save" onClick={onSaveDraft}>save</button>
  ),
}));

const operator = {
  employee_id: "op-1",
  name: "operator",
  department: "조립",
  warehouse_role: "none",
};

function conversionItem(id: string, name: string, quantity: number): Item {
  return {
    item_id: id,
    item_name: name,
    unit: "EA",
    quantity,
    warehouse_qty: quantity,
    production_total: 0,
    defective_total: 0,
    pending_quantity: 0,
    available_quantity: quantity,
    last_reserver_name: null,
    location: null,
    locations: [],
    legacy_part: null,
    legacy_item_type: null,
    supplier: null,
    min_stock: null,
    mes_code: id,
    model_symbol: null,
    model_slots: [],
    process_type_code: "AF",
    serial_no: null,
    bom_completed_at: "2026-07-10T00:00:00Z",
    deleted_at: null,
    created_at: "2026-07-10T00:00:00Z",
    updated_at: "2026-07-10T00:00:00Z",
    department: null,
  };
}

const conversionItems = [
  conversionItem("af-1", "소스 AF", 5),
  conversionItem("af-2", "대상 AF", 0),
];

const conversionResult: ItemConversionResult = {
  request_id: null,
  requested_mode: "BOM",
  resolved_mode: "BOM",
  executable: true,
  blocking_reason: null,
  source_item_id: "af-1",
  source_item_name: "소스 AF",
  source_mes_code: "af-1",
  target_item_id: "af-2",
  target_item_name: "대상 AF",
  target_mes_code: "af-2",
  quantity: 1,
  source_department: "assembly",
  source_current_quantity: 5,
  source_available_quantity: 5,
  source_shortage_quantity: 0,
  reference_no: "ITEM-CONV-1",
  memo: "전환 사유",
  completed_at: "2026-07-10T00:00:00Z",
  lines: [],
  transactions: [],
};

function renderCompose(items: Item[] = [], currentOperator = operator) {
  return render(
    <IoComposeView
      globalSearch=""
      operator={currentOperator}
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
  vi.mocked(api.getItemConversionPreview).mockResolvedValue(conversionResult);
  vi.mocked(api.executeItemConversion).mockResolvedValue(conversionResult);
  routerPush.mockClear();
});

describe("IoComposeView navigation chrome", () => {
  it("waits to publish draft status until the success notice reaches the status target", async () => {
    const onStatusChange = vi.fn();
    vi.mocked(api.saveDraft).mockResolvedValue({ batch_id: "draft-save" } as never);

    render(
      <IoComposeView
        globalSearch=""
        operator={operator}
        employees={[]}
        items={[]}
        productModels={[]}
        setItems={() => {}}
        onStatusChange={onStatusChange}
        restoreDraft={{
          batch_id: "draft-save",
          work_type: "warehouse_io",
          sub_type: "warehouse_to_dept",
          from_department: "조립",
          to_department: "조립",
          bundles: [{
            bundle_id: "bundle-1",
            source_kind: "direct_item",
            title: "test",
            source_item_id: "item-1",
            source_mes_code: "ITEM-1",
            quantity: 1,
            expanded_level: 0,
            lines: [{
              line_id: "line-1",
              item_id: "item-1",
              item_name: "test",
              mes_code: "ITEM-1",
              unit: "EA",
              direction: "out",
              from_bucket: "warehouse",
              from_department: null,
              to_bucket: "production",
              to_department: "조립",
              quantity: 1,
              bom_expected: null,
              included: true,
              origin: "direct",
              edited: false,
              has_children: false,
              shortage: 0,
              exclusion_note: null,
            }],
          }],
        } as never}
      />,
    );

    await screen.findByTestId("draft-step-advance");
    onStatusChange.mockClear();
    fireEvent.click(screen.getByTestId("draft-step-advance"));
    fireEvent.click(await screen.findByTestId("draft-save"));

    const notice = await screen.findByTestId("io-draft-save-notice");
    expect(onStatusChange).not.toHaveBeenCalled();
    fireEvent.animationEnd(notice);
    expect(onStatusChange).toHaveBeenCalledWith(expect.stringMatching(/^저장됨 · \d{2}:\d{2}$/));
  });

  it("AS 작업자에게 독립 사용출고 카드를 보이고 품목 전환은 숨긴다", async () => {
    renderCompose([], { ...operator, department: "AS" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /AS·연구 사용출고/ })).toBeInTheDocument();
      expect(screen.queryByTestId("warehouse-item-conversion-card")).not.toBeInTheDocument();
    });
  });
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

  it("restores item conversion one step at a time from browser history", async () => {
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    renderCompose(conversionItems);

    fireEvent.click(screen.getByTestId("warehouse-item-conversion-card"));

    expect(pushStateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ wic: 1 }),
      "",
      expect.any(String),
    );
    expect(screen.getByTestId("item-conversion-source-search")).toBeInTheDocument();
    expect(screen.getByTestId("item-conversion-quantity")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("item-conversion-source-option-af-1"));
    fireEvent.click(screen.getByTestId("item-conversion-target-option-af-2"));
    fireEvent.click(screen.getByTestId("item-conversion-next-button"));
    await screen.findByTestId("item-conversion-preview");
    expect(pushStateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ wic: 2 }),
      "",
      expect.any(String),
    );

    fireEvent.change(screen.getByTestId("item-conversion-memo"), { target: { value: "history memo" } });
    fireEvent.click(screen.getByTestId("item-conversion-execute-next-button"));
    expect(screen.getByTestId("item-conversion-execute-step")).toBeInTheDocument();
    expect(pushStateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ wic: 3 }),
      "",
      expect.any(String),
    );

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: { wic: 2 } }));
    });
    await waitFor(() => {
      expect(screen.getByTestId("item-conversion-preview")).toBeInTheDocument();
    });
    expect(screen.getByTestId("item-conversion-memo")).toHaveValue("history memo");

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: { wic: 1 } }));
    });
    await waitFor(() => {
      expect(screen.getByTestId("item-conversion-source-search")).toBeInTheDocument();
    });
    expect(screen.getByTestId("item-conversion-source-option-af-1")).toHaveTextContent(/./);

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: { wic: 2 } }));
    });
    await waitFor(() => {
      expect(screen.getByTestId("item-conversion-preview")).toBeInTheDocument();
    });
    expect(screen.getByTestId("item-conversion-memo")).toHaveValue("history memo");

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("warehouse-item-conversion-card")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("item-conversion-source-search")).not.toBeInTheDocument();

    pushStateSpy.mockRestore();
  });

  it("returns directly to the work-type selection from the conversion navigation", async () => {
    const historyGoSpy = vi.spyOn(window.history, "go");
    renderCompose(conversionItems);

    fireEvent.click(screen.getByTestId("warehouse-item-conversion-card"));
    fireEvent.click(screen.getByTestId("item-conversion-source-option-af-1"));
    fireEvent.click(screen.getByTestId("item-conversion-target-option-af-2"));
    fireEvent.click(screen.getByTestId("item-conversion-next-button"));
    await screen.findByTestId("item-conversion-preview");
    fireEvent.change(screen.getByTestId("item-conversion-memo"), { target: { value: "history memo" } });
    fireEvent.click(screen.getByTestId("item-conversion-execute-next-button"));

    fireEvent.click(screen.getAllByTestId("item-conversion-step-nav-item")[0]);

    expect(historyGoSpy).toHaveBeenCalledWith(-3);
    expect(screen.getByTestId("warehouse-item-conversion-card")).toBeInTheDocument();
    historyGoSpy.mockRestore();
  });

  it("returns to work type selection after a confirmed item conversion", async () => {
    renderCompose(conversionItems);

    fireEvent.click(screen.getByTestId("warehouse-item-conversion-card"));
    fireEvent.click(screen.getByTestId("item-conversion-source-option-af-1"));
    fireEvent.click(screen.getByTestId("item-conversion-target-option-af-2"));
    fireEvent.click(screen.getByTestId("item-conversion-next-button"));

    await screen.findByTestId("item-conversion-preview");
    fireEvent.change(screen.getByTestId("item-conversion-memo"), { target: { value: "전환 사유" } });
    fireEvent.click(screen.getByTestId("item-conversion-execute-next-button"));
    fireEvent.click(screen.getByTestId("item-conversion-confirm-button"));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "전환 실행" }));

    await waitFor(() => {
      expect(api.executeItemConversion).toHaveBeenCalledTimes(1);
    });
    expect(api.executeItemConversion).toHaveBeenCalledWith(
      expect.objectContaining({ requester_employee_id: operator.employee_id }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("warehouse-item-conversion-card")).toBeInTheDocument();
    });
    expect(screen.queryByText("품목 전환 완료")).not.toBeInTheDocument();
    expect(window.history.state?.wic).toBeUndefined();
  });
});
