import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";
import { api } from "@/lib/api";
import { IoWorkTypeStep } from "../IoWorkTypeStep";
import { ItemConversionCompleteView, ItemConversionWorkView } from "../ItemConversionView";

vi.mock("@/lib/api", () => ({
  api: {
    getItemConversionPreview: vi.fn(),
    executeItemConversion: vi.fn(),
  },
}));

const apiMock = api as unknown as {
  getItemConversionPreview: ReturnType<typeof vi.fn>;
  executeItemConversion: ReturnType<typeof vi.fn>;
};

function item(id: string, name: string, process: string, mesCode = id, quantity = 10): Item {
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
    mes_code: mesCode,
    model_symbol: null,
    model_slots: [],
    process_type_code: process,
    serial_no: null,
    bom_completed_at: "2026-07-06T00:00:00Z",
    deleted_at: null,
    created_at: "2026-07-06T00:00:00Z",
    updated_at: "2026-07-06T00:00:00Z",
    department: null,
  };
}

const items = [
  item("pa-1", "Source PA", "PA", "3-PA-0001", 3),
  item("pa-2", "Target PA", "PA", "3-PA-0002", 0),
  item("af-1", "Domestic AF", "AF", "3-AF-0001", 5),
  item("af-2", "Export AF", "AF", "3-AF-0002", 0),
  item("pr-1", "Raw Part", "PR", "3-PR-0001", 20),
];

const result = {
  request_id: null,
  requested_mode: "BOM",
  resolved_mode: "BOM",
  executable: true,
  blocking_reason: null,
  source_item_id: "af-1",
  source_item_name: "Domestic AF",
  source_mes_code: "3-AF-0001",
  target_item_id: "af-2",
  target_item_name: "Export AF",
  target_mes_code: "3-AF-0002",
  quantity: 1,
  source_department: "조립",
  source_current_quantity: 5,
  source_available_quantity: 5,
  source_shortage_quantity: 0,
  reference_no: "ITEM-CONV-1234",
  memo: "수출 사양 구성 전환",
  completed_at: "2026-07-06T00:00:00Z",
  lines: [
    {
      item_id: "part-1",
      item_name: "Cable Set",
      mes_code: "3-PR-0001",
      process_type_code: "PR",
      source_quantity: 1,
      target_quantity: 2,
      delta_per_unit: 1,
      total_delta: 1,
      unit: "EA",
      department: "창고",
      current_quantity: 10,
      available_quantity: 10,
      shortage_quantity: 0,
      line_kind: "consume",
    },
  ],
  transactions: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.getItemConversionPreview.mockResolvedValue(result);
  apiMock.executeItemConversion.mockResolvedValue(result);
});

describe("ItemConversionView", () => {
  it("shows item conversion as a warehouse work-type action", () => {
    const onItemConversion = vi.fn();

    render(
      <IoWorkTypeStep
        workType="process"
        operator={{ employee_id: "op-1", name: "operator", department: "조립" }}
        onWorkTypeChange={() => {}}
        onItemConversion={onItemConversion}
      />,
    );

    fireEvent.click(screen.getByTestId("warehouse-item-conversion-card"));

    expect(onItemConversion).toHaveBeenCalledTimes(1);
  });

  it("renders item conversion with the same compact step chrome as warehouse compose", () => {
    const onComplete = vi.fn();
    render(<ItemConversionWorkView items={items} loading={false} onComplete={onComplete} />);

    expect(screen.getByTestId("item-conversion-step-nav")).toBeInTheDocument();
    const navItems = screen.getAllByTestId("item-conversion-step-nav-item");
    expect(navItems).toHaveLength(4);
    expect(navItems.map((node) => node.getAttribute("data-state"))).toEqual([
      "active",
      "locked",
      "locked",
      "locked",
    ]);
    expect(screen.queryByText(/① 방식 선택/)).not.toBeInTheDocument();
  });

  it("marks mode selection done and returns to it from the conversion step chrome", () => {
    const onComplete = vi.fn();
    render(<ItemConversionWorkView items={items} loading={false} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole("button", { name: /구성 전환/ }));

    let navItems = screen.getAllByTestId("item-conversion-step-nav-item");
    expect(navItems.map((node) => node.getAttribute("data-state"))).toEqual([
      "done",
      "active",
      "locked",
      "locked",
    ]);

    fireEvent.click(navItems[0]);

    navItems = screen.getAllByTestId("item-conversion-step-nav-item");
    expect(navItems.map((node) => node.getAttribute("data-state"))).toEqual([
      "active",
      "locked",
      "locked",
      "locked",
    ]);
    expect(screen.getByRole("button", { name: /사양 전환/ })).toBeInTheDocument();
  });

  it("previews and executes an AF BOM item conversion with the four-step chrome", async () => {
    const onComplete = vi.fn();
    render(<ItemConversionWorkView items={items} loading={false} onComplete={onComplete} />);

    expect(screen.getByTestId("item-conversion-step-nav")).toBeInTheDocument();
    expect(screen.getAllByTestId("item-conversion-step-nav-item")).toHaveLength(4);
    expect(screen.queryByText(/① 방식 선택/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /구성 전환/ }));
    expect(screen.getByText("구성 전환")).toBeInTheDocument();
    expect(screen.getByText("소스 품목")).toBeInTheDocument();
    expect(screen.getByText("대상 품목")).toBeInTheDocument();
    expect(screen.getByText("실행 요약")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("item-conversion-source-search"), { target: { value: "af-1" } });
    fireEvent.change(screen.getByTestId("item-conversion-target-search"), { target: { value: "af-2" } });
    fireEvent.click(screen.getByTestId("item-conversion-preview-button"));

    await waitFor(() => {
      expect(apiMock.getItemConversionPreview).toHaveBeenCalledWith({
        source_item_id: "af-1",
        target_item_id: "af-2",
        quantity: 1,
        requested_mode: "BOM",
      });
    });
    expect(await screen.findByTestId("item-conversion-preview")).toHaveTextContent("Cable Set");

    fireEvent.click(screen.getByRole("button", { name: /^확인$/ }));
    fireEvent.change(screen.getByTestId("item-conversion-memo"), { target: { value: "수출 사양 구성 전환" } });
    fireEvent.click(await screen.findByTestId("item-conversion-confirm-button"));

    await waitFor(() => {
      expect(apiMock.executeItemConversion).toHaveBeenCalledWith({
        source_item_id: "af-1",
        target_item_id: "af-2",
        quantity: 1,
        requested_mode: "BOM",
        memo: "수출 사양 구성 전환",
      });
    });
    expect(onComplete).toHaveBeenCalledWith(result);
  });

  it("returns from conversion mode detail to mode selection on browser back", async () => {
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    const onComplete = vi.fn();
    render(<ItemConversionWorkView items={items} loading={false} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole("button", { name: /구성 전환/ }));

    expect(pushStateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ wic: "work", wicm: "BOM" }),
      "",
      expect.any(String),
    );
    expect(screen.getByTestId("item-conversion-source-search")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: { wic: "work" } }));
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /사양 전환/ })).toBeInTheDocument();
    });
    expect(screen.queryByTestId("item-conversion-source-search")).not.toBeInTheDocument();

    pushStateSpy.mockRestore();
  });

  it("renders the item conversion completion actions", () => {
    render(
      <ItemConversionCompleteView
        result={result}
        onNew={() => {}}
        onHistory={() => {}}
        onWarehouse={() => {}}
      />,
    );

    expect(screen.getByTestId("item-conversion-complete")).toHaveTextContent("Domestic AF");
    expect(screen.getByTestId("item-conversion-complete")).toHaveTextContent("Export AF");
    expect(screen.getByRole("button", { name: "새 품목 전환" })).toBeInTheDocument();
  });
});
