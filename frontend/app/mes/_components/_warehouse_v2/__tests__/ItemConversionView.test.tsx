import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Item, ItemConversionResult } from "@/lib/api";
import { api } from "@/lib/api";
import { IoWorkTypeStep } from "../IoWorkTypeStep";
import { ItemConversionWorkView } from "../ItemConversionView";

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

const result: ItemConversionResult = {
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
  source_department: "assembly",
  source_current_quantity: 5,
  source_available_quantity: 5,
  source_shortage_quantity: 0,
  reference_no: "ITEM-CONV-1234",
  memo: "BOM conversion",
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
      department: "shipping",
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
        operator={{ employee_id: "op-1", name: "operator", department: "assembly" }}
        onWorkTypeChange={() => {}}
        onItemConversion={onItemConversion}
      />,
    );

    fireEvent.click(screen.getByTestId("warehouse-item-conversion-card"));

    expect(onItemConversion).toHaveBeenCalledTimes(1);
  });

  it("starts item conversion at item and quantity selection without mode cards", () => {
    render(<ItemConversionWorkView items={items} loading={false} onComplete={() => {}} />);

    const navItems = screen.getAllByTestId("item-conversion-step-nav-item");
    expect(navItems).toHaveLength(4);
    expect(navItems.map((node) => node.getAttribute("data-state"))).toEqual([
      "done",
      "active",
      "locked",
      "locked",
    ]);
    expect(screen.queryByTestId("item-conversion-mode-selection")).not.toBeInTheDocument();
    expect(screen.queryByText("미선택")).not.toBeInTheDocument();
    expect(screen.getByTestId("item-conversion-source-search")).toBeInTheDocument();
    expect(screen.getByTestId("item-conversion-target-guide")).toHaveTextContent("소스 품목을 선택하세요");
    expect(screen.getByTestId("item-conversion-quantity")).toBeInTheDocument();
    expect(screen.getByTestId("item-conversion-selection-hint")).toHaveTextContent("소스 품목을 선택하세요");
    expect(screen.queryByText("선택 초기화")).not.toBeInTheDocument();
  });

  it("keeps source and target lists visible with selected row markers", () => {
    render(<ItemConversionWorkView items={items} loading={false} onComplete={() => {}} />);

    fireEvent.click(screen.getByTestId("item-conversion-source-option-af-1"));

    expect(screen.queryByTestId("item-conversion-source-selected-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("item-conversion-source-change")).not.toBeInTheDocument();
    expect(screen.getByTestId("item-conversion-source-search")).toBeInTheDocument();
    expect(screen.getByTestId("item-conversion-source-option-af-1")).toHaveTextContent("선택됨");
    expect(screen.queryByText("검색 결과가 없습니다.")).not.toBeInTheDocument();
    expect(screen.getByTestId("item-conversion-selection-hint")).toHaveTextContent("대상 품목을 선택하세요");

    fireEvent.change(screen.getByTestId("item-conversion-target-search"), { target: { value: "Export" } });
    fireEvent.click(screen.getByTestId("item-conversion-target-option-af-2"));

    expect(screen.queryByTestId("item-conversion-target-selected-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("item-conversion-target-change")).not.toBeInTheDocument();
    expect(screen.getByTestId("item-conversion-target-search")).toBeInTheDocument();
    expect(screen.getByTestId("item-conversion-target-option-af-2")).toHaveTextContent("선택됨");
    expect(screen.getByTestId("item-conversion-selection-hint")).toHaveTextContent("차이 확인으로 이동할 수 있습니다");

    fireEvent.click(screen.getByTestId("item-conversion-source-option-pa-1"));
    expect(screen.getByTestId("item-conversion-source-option-pa-1")).toHaveTextContent("선택됨");
    expect(screen.queryByTestId("item-conversion-target-option-af-2")).not.toBeInTheDocument();
  });

  it("uses searchable source and target selection before moving to preview", async () => {
    render(<ItemConversionWorkView items={items} loading={false} onComplete={() => {}} />);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByTestId("item-conversion-memo")).not.toBeInTheDocument();
    expect(screen.queryByTestId("item-conversion-preview")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("item-conversion-source-search"), { target: { value: "Domestic" } });
    fireEvent.click(screen.getByTestId("item-conversion-source-option-af-1"));
    fireEvent.change(screen.getByTestId("item-conversion-target-search"), { target: { value: "Export" } });
    fireEvent.click(screen.getByTestId("item-conversion-target-option-af-2"));
    fireEvent.click(screen.getByTestId("item-conversion-next-button"));

    await waitFor(() => {
      expect(apiMock.getItemConversionPreview).toHaveBeenCalledWith({
        source_item_id: "af-1",
        target_item_id: "af-2",
        quantity: 1,
      });
    });

    expect(await screen.findByTestId("item-conversion-preview")).toHaveTextContent("Cable Set");
    expect(screen.getByTestId("item-conversion-mode-badge")).toHaveTextContent("BOM");
    expect(screen.getByTestId("item-conversion-memo")).toBeInTheDocument();
    expect(screen.getByTestId("item-conversion-memo-field")).toHaveClass("flex");
    expect(screen.getByTestId("item-conversion-execute-next-button")).toHaveTextContent("다음");
    expect(screen.getByTestId("item-conversion-preview")).toHaveTextContent("소스 품목");
    expect(screen.getByTestId("item-conversion-preview")).toHaveTextContent("대상 품목");
    expect(screen.getByTestId("item-conversion-preview")).not.toHaveTextContent(/[←→]/);
    expect(screen.queryByText("소스·대상 다시 선택")).not.toBeInTheDocument();
  });

  it("previews and executes an automatically resolved BOM item conversion", async () => {
    const onComplete = vi.fn();
    render(<ItemConversionWorkView items={items} loading={false} onComplete={onComplete} />);

    fireEvent.click(screen.getByTestId("item-conversion-source-option-af-1"));
    fireEvent.click(screen.getByTestId("item-conversion-target-option-af-2"));
    fireEvent.click(screen.getByTestId("item-conversion-next-button"));

    expect(await screen.findByTestId("item-conversion-preview")).toHaveTextContent("Cable Set");
    fireEvent.change(screen.getByTestId("item-conversion-memo"), {
      target: { value: "BOM conversion" },
    });
    fireEvent.click(screen.getByTestId("item-conversion-execute-next-button"));

    const navItems = screen.getAllByTestId("item-conversion-step-nav-item");
    expect(navItems.map((node) => node.getAttribute("data-state"))).toEqual([
      "done",
      "done",
      "done",
      "active",
    ]);
    expect(screen.getByTestId("item-conversion-execute-step")).toHaveTextContent("Domestic AF");
    expect(screen.getByTestId("item-conversion-execute-step")).toHaveTextContent("Cable Set");
    expect(screen.queryByTestId("item-conversion-mode-badge")).not.toBeInTheDocument();
    expect(screen.getByTestId("item-conversion-final-confirmation")).toHaveClass("ic-execution-bar");
    expect(screen.getByTestId("item-conversion-final-confirmation")).toHaveTextContent("Domestic AF");
    expect(screen.getByTestId("item-conversion-final-confirmation")).toHaveTextContent("Export AF");
    expect(screen.getByTestId("item-conversion-final-confirmation")).toHaveTextContent("BOM conversion");
    expect(screen.queryByText("차이 다시 보기")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("item-conversion-confirm-button"));
    expect(apiMock.executeItemConversion).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("품목 전환을 실행할까요?");
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(apiMock.executeItemConversion).not.toHaveBeenCalled();
    expect(screen.getByTestId("item-conversion-execute-step")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("item-conversion-confirm-button"));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "전환 실행" }));

    await waitFor(() => {
      expect(apiMock.executeItemConversion).toHaveBeenCalledWith({
        source_item_id: "af-1",
        target_item_id: "af-2",
        quantity: 1,
        memo: "BOM conversion",
      });
    });
    expect(onComplete).toHaveBeenCalledWith(result);
  });

  it("does not require memo for an automatically resolved SPEC conversion", async () => {
    const specResult: ItemConversionResult = {
      ...result,
      requested_mode: "SPEC",
      resolved_mode: "SPEC",
      memo: null,
      lines: [],
    };
    apiMock.getItemConversionPreview.mockResolvedValue(specResult);
    apiMock.executeItemConversion.mockResolvedValue(specResult);
    const onComplete = vi.fn();
    render(<ItemConversionWorkView items={items} loading={false} onComplete={onComplete} />);

    fireEvent.click(screen.getByTestId("item-conversion-source-option-af-1"));
    fireEvent.click(screen.getByTestId("item-conversion-target-option-af-2"));
    fireEvent.click(screen.getByTestId("item-conversion-next-button"));

    expect(await screen.findByTestId("item-conversion-mode-badge")).toHaveTextContent("SPEC");
    fireEvent.click(screen.getByTestId("item-conversion-execute-next-button"));
    expect(screen.getByTestId("item-conversion-execute-step")).toHaveTextContent("변경되는 구성품이 없습니다");
    expect(screen.queryByTestId("item-conversion-mode-badge")).not.toBeInTheDocument();
    expect(screen.getByTestId("item-conversion-final-confirmation")).toHaveClass("ic-execution-bar");
    expect(screen.queryByText("차이 다시 보기")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("item-conversion-confirm-button"));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "전환 실행" }));

    await waitFor(() => {
      expect(apiMock.executeItemConversion).toHaveBeenCalledWith({
        source_item_id: "af-1",
        target_item_id: "af-2",
        quantity: 1,
        memo: null,
      });
    });
    expect(onComplete).toHaveBeenCalledWith(specResult);
  });

});
