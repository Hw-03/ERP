import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Item, ShippingComponentChangeResult } from "@/lib/api";
import { api } from "@/lib/api";
import { IoWorkTypeStep } from "../IoWorkTypeStep";
import { ItemConversionCompleteView, ItemConversionWorkView } from "../ItemConversionView";

vi.mock("@/lib/api", () => ({
  api: {
    getIndependentShippingComponentChangePreview: vi.fn(),
    executeIndependentShippingComponentChange: vi.fn(),
  },
}));

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
    bom_completed_at: null,
    deleted_at: null,
    created_at: "2026-07-06T00:00:00Z",
    updated_at: "2026-07-06T00:00:00Z",
    department: null,
  };
}

const items = [
  item("pa-1", "Source PA", "PA", "3-PA-0001", 3),
  item("pa-2", "Target PA", "PA", "3-PA-0002", 0),
  item("af-1", "AF Item", "AF", "3-AF-0001", 5),
];

const result: ShippingComponentChangeResult = {
  request_id: null,
  source_item_id: "pa-1",
  source_item_name: "Source PA",
  source_mes_code: "3-PA-0001",
  target_item_id: "pa-2",
  target_item_name: "Target PA",
  target_mes_code: "3-PA-0002",
  quantity: 1,
  source_department: "조립",
  source_current_quantity: 3,
  source_available_quantity: 3,
  source_shortage_quantity: 0,
  reference_no: "SHIP-COMP-independent",
  memo: null,
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
    },
  ],
  transactions: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getIndependentShippingComponentChangePreview).mockResolvedValue(result);
  vi.mocked(api.executeIndependentShippingComponentChange).mockResolvedValue(result);
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

  it("previews and executes a PA item conversion", async () => {
    const onComplete = vi.fn();
    render(<ItemConversionWorkView items={items} loading={false} onComplete={onComplete} />);

    fireEvent.change(screen.getByTestId("item-conversion-source-search"), { target: { value: "pa-1" } });
    fireEvent.change(screen.getByTestId("item-conversion-target-search"), { target: { value: "pa-2" } });
    fireEvent.click(screen.getByTestId("item-conversion-preview-button"));

    await waitFor(() => {
      expect(api.getIndependentShippingComponentChangePreview).toHaveBeenCalledWith({
        source_pa_item_id: "pa-1",
        target_pa_item_id: "pa-2",
        quantity: 1,
      });
    });
    expect(await screen.findByTestId("item-conversion-preview")).toHaveTextContent("Cable Set");

    fireEvent.click(screen.getByTestId("item-conversion-execute-button"));
    fireEvent.click(await screen.findByTestId("item-conversion-confirm-button"));

    await waitFor(() => {
      expect(api.executeIndependentShippingComponentChange).toHaveBeenCalledWith({
        source_pa_item_id: "pa-1",
        target_pa_item_id: "pa-2",
        quantity: 1,
        memo: null,
      });
    });
    expect(onComplete).toHaveBeenCalledWith(result);
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

    expect(screen.getByTestId("item-conversion-complete")).toHaveTextContent("Source PA");
    expect(screen.getByTestId("item-conversion-complete")).toHaveTextContent("Target PA");
  });
});
