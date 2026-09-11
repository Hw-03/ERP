import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileDefectCartFlow } from "../MobileDefectCartFlow";
import { MobileDefectProcessPanel } from "../MobileDefectProcessPanel";
import type { DefectLocation } from "@/lib/api/types/defects";
import { defectsApi } from "@/lib/api/defects";
import { stockRequestsApi } from "@/lib/api/stock-requests";

vi.mock("../../../_defect_hub/DisassembleTree", () => ({
  DisassembleTree: ({ onChange }: { onChange: (decisions: unknown[]) => void }) => (
    <div data-testid="disassemble-tree">
      <button type="button" onClick={() => onChange([{ child_item_id: "child-1", action: "recover" }])}>
        set tree decision
      </button>
    </div>
  ),
  toServerDecision: (decision: unknown) => decision,
  validateDecisionTree: () => true,
}));

vi.mock("../../../_defect_hub/DefectItemPicker", () => ({
  DefectItemPicker: ({ onAdd }: { onAdd?: (item: unknown) => void }) => (
    <div data-testid="defect-item-picker">
      <button
        type="button"
        onClick={() =>
          onAdd?.({
            item_id: "mock-item-1",
            item_name: "Mock item",
            mes_code: "MOCK-001",
            quantity: 10,
            has_bom: true,
            process_type_code: "TR",
          })
        }
      >
        mock add
      </button>
      <button
        type="button"
        onClick={() =>
          onAdd?.({
            item_id: "mock-item-2",
            item_name: "Mock second item",
            mes_code: "MOCK-002",
            quantity: 10,
            has_bom: false,
            process_type_code: "AF",
          })
        }
      >
        mock add second
      </button>
    </div>
  ),
}));

vi.mock("../../../_defect_hub/ReasonFormFields", () => ({
  ReasonFormFields: ({ onCategoryChange }: { onCategoryChange: (category: string) => void }) => (
    <button type="button" onClick={() => onCategoryChange("기타")}>사유 선택</button>
  ),
}));

vi.mock("@/lib/api/defects", () => ({
  defectsApi: {
    quarantine: vi.fn(),
    unquarantine: vi.fn(),
  },
}));

vi.mock("@/lib/api/stock-requests", () => ({
  stockRequestsApi: {
    createStockRequest: vi.fn(),
  },
}));

const employee = { employee_id: "emp-1", name: "Kim", department: "Assembly" };

const item = {
  item_id: "item-1",
  item_name: "Long item",
  unit: "EA",
  quantity: 10,
  warehouse_qty: 10,
  production_total: 0,
  defective_total: 0,
  pending_quantity: 0,
  available_quantity: 10,
  last_reserver_name: null,
  location: null,
  locations: [],
  legacy_part: null,
  legacy_item_type: null,
  supplier: null,
  mes_code: "MES-001",
  min_stock: null,
  model_symbol: null,
  model_slots: [],
  process_type_code: null,
  serial_no: null,
  bom_completed_at: null,
  deleted_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  department: null,
  current_stock: 10,
  has_bom: true,
  supplier_item_code: null,
  standard_purchase_price: null,
  purchase_price_effective_date: null,
  reorder_point: null,
  procurement_lead_time_days: null,
  minimum_order_quantity: null,
  purchase_memo: null,
};

const location: DefectLocation = {
  record_id: "record-1",
  item_id: "item-1",
  item_name: "Long item",
  mes_code: "MES-001",
  department: "Assembly",
  quantity: 3,
  original_quantity: 3,
  pending_quantity: 0,
  available_quantity: 3,
  defective_at: null,
  reason_category: null,
  reason_memo: null,
  quarantined_by: "Kim",
  quarantined_by_employee_id: "emp-1",
  is_legacy: false,
  has_bom: true,
};

beforeEach(() => {
  window.history.replaceState({}, "");
});

describe("mobile defect compact headers", () => {
  it("keeps the direct action cards flush with the flow bottom for the common shell gap", () => {
    render(
      <MobileDefectCartFlow
        mode="scrap"
        items={[item]}
        productModels={[]}
        currentEmployee={employee}
        onDone={() => {}}
        onCancel={() => {}}
      />,
    );

    const reworkButton = screen.getByRole("button", { name: /재작업/ });
    const scrollPane = reworkButton.parentElement?.parentElement;

    expect(scrollPane).toHaveClass("overflow-y-auto");
    expect(scrollPane).not.toHaveClass("pb-3");
  });

  it("uses a compact step header after choosing a direct defect action", () => {
    const { container } = render(
      <MobileDefectCartFlow
        mode="scrap"
        items={[item]}
        productModels={[]}
        currentEmployee={employee}
        onDone={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.queryByText("STEP 1 / 2")).not.toBeInTheDocument();

    fireEvent.click(container.querySelectorAll("button")[1]);

    expect(screen.getByText("STEP 1 / 2")).toBeInTheDocument();
  });

  it("opens rework directly at the item picker without a department source step", () => {
    render(
      <MobileDefectCartFlow
        mode="scrap"
        items={[item]}
        productModels={[]}
        currentEmployee={employee}
        onDone={() => {}}
        onCancel={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /재작업/ }));

    expect(screen.getByTestId("defect-item-picker")).toBeInTheDocument();
    expect(screen.getByText("STEP 2 / 3")).toBeInTheDocument();
    expect(screen.queryByText("출처·격리 부서")).not.toBeInTheDocument();
  });

  it("역할 기본값이 전달되어도 모바일 격리는 생산 출처로 시작한다", () => {
    const legacySource = { defaultSource: "warehouse" } as unknown as Record<string, never>;
    render(
      <MobileDefectCartFlow {...legacySource} mode="add" items={[{ ...item, warehouse_qty: 0 }]} productModels={[]} currentEmployee={employee} onDone={() => {}} onCancel={() => {}} />,
    );

    expect(screen.getByRole("button", { name: /부서 재고/ })).toHaveStyle({ borderWidth: "2px" });
  });

  it("모바일 최종 격리 확인에 두 품목의 수량·관리 분류·자동 부서를 각각 표시한다", async () => {
    render(
      <MobileDefectCartFlow mode="add" items={[item]} productModels={[]} currentEmployee={employee} onDone={() => {}} onCancel={() => {}} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: "mock add" }));
    fireEvent.click(screen.getByRole("button", { name: "mock add second" }));
    const quantities = screen.getAllByRole("spinbutton");
    fireEvent.change(quantities[0], { target: { value: "3" } });
    fireEvent.change(quantities[1], { target: { value: "8" } });
    const classifications = screen.getAllByRole("group", { name: "보관 분류" });
    fireEvent.click(within(classifications[0]).getByRole("button", { name: "B급" }));
    fireEvent.click(within(classifications[1]).getByRole("button", { name: "구형" }));
    fireEvent.click(screen.getByRole("button", { name: /격리하기 \(2건\)/ }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Mock item · 수량 3 · 관리 분류 B급 · 자동 부서 · 튜브");
    expect(dialog).toHaveTextContent("Mock second item · 수량 8 · 관리 분류 구형 · 자동 부서 · 조립");
  });

  it("모바일 즉시 폐기 확인에는 관리 분류 없이 수량과 자동 부서만 표시한다", async () => {
    render(
      <MobileDefectCartFlow mode="scrap" items={[item]} productModels={[]} currentEmployee={employee} onDone={() => {}} onCancel={() => {}} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^폐기/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: "mock add" }));
    fireEvent.click(screen.getByRole("button", { name: /즉시 폐기 \(1건\)/ }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Mock item · 수량 1 · 자동 부서 · 튜브");
    expect(dialog).not.toHaveTextContent("관리 분류");
  });

  it("모바일 즉시 재작업 확인에는 관리 분류 없이 수량과 자동 부서만 표시한다", async () => {
    render(
      <MobileDefectCartFlow mode="scrap" items={[item]} productModels={[]} currentEmployee={employee} onDone={() => {}} onCancel={() => {}} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^재작업/ }));
    fireEvent.click(screen.getByRole("button", { name: "mock add" }));
    fireEvent.click(screen.getByRole("button", { name: "사유 선택" }));
    fireEvent.click(screen.getByRole("button", { name: /BOM 확인/ }));
    fireEvent.click(await screen.findByRole("button", { name: "set tree decision" }));
    fireEvent.click(screen.getByRole("button", { name: /즉시 재작업 \(1건\)/ }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Mock item · 수량 1 · 자동 부서 · 튜브");
    expect(dialog).not.toHaveTextContent("관리 분류");
  });

  it("restores direct action selection instead of the removed department step on browser back", () => {
    render(
      <MobileDefectCartFlow
        mode="scrap"
        items={[item]}
        productModels={[]}
        currentEmployee={employee}
        onDone={() => {}}
        onCancel={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^폐기/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent(window, new PopStateEvent("popstate", { state: { defect: "cart", mode: "scrap", step: 1 } }));

    expect(screen.getByRole("heading", { name: "바로 처리" })).toBeInTheDocument();
  });

  it("restores a rework BOM history entry to the rework item picker when its cart line is unavailable", () => {
    window.history.replaceState({ defect: "cart", mode: "scrap", directAction: "rework", source: "production", step: 3 }, "");
    render(
      <MobileDefectCartFlow mode="scrap" items={[item]} productModels={[]} currentEmployee={employee} onDone={() => {}} onCancel={() => {}} />,
    );

    expect(screen.getByTestId("defect-item-picker")).toBeInTheDocument();
    expect(window.history.state).toMatchObject({ directAction: "rework", source: "production", step: 2 });
  });

  it("uses a compact process header on the BOM confirmation step", () => {
    const { container } = render(
      <MobileDefectProcessPanel
        location={location}
        currentEmployee={employee}
        onDone={() => {}}
        onCancel={() => {}}
      />,
    );

    fireEvent.click(container.querySelectorAll("button")[6]);
    fireEvent.click(Array.from(container.querySelectorAll("button")).at(-1)!);

    expect(screen.getByText("STEP 2 / 2")).toBeInTheDocument();
  });

  it("keeps the item picker usable after a cart item is added", () => {
    render(
      <MobileDefectCartFlow
        mode="add"
        items={[item]}
        productModels={[]}
        currentEmployee={employee}
        onDone={() => {}}
        onCancel={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /다음|Next/ }));
    fireEvent.click(screen.getByRole("button", { name: "mock add" }));

    expect(screen.getByTestId("mobile-defect-picker-pane")).toHaveClass("min-h-[300px]", "flex-[1_1_300px]");
    expect(screen.getByTestId("mobile-defect-cart-scroll")).toHaveClass("max-h-[min(26dvh,220px)]", "overflow-y-auto");
  });

  it("opens confirmation before mobile normal recovery and calls unquarantine once after confirmation", async () => {
    vi.mocked(defectsApi.unquarantine).mockResolvedValueOnce(undefined);
    const onDone = vi.fn();
    const { container } = render(
      <MobileDefectProcessPanel
        location={location}
        currentEmployee={employee}
        onDone={onDone}
        onCancel={() => {}}
      />,
    );

    fireEvent.click(Array.from(container.querySelectorAll("button")).at(-1)!);

    expect(defectsApi.unquarantine).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(Array.from(dialog.querySelectorAll("button")).at(-1)!);

    await waitFor(() => expect(defectsApi.unquarantine).toHaveBeenCalledTimes(1));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("sends the defect_disassemble payload after a BOM rework tree is confirmed", async () => {
    vi.mocked(stockRequestsApi.createStockRequest).mockResolvedValueOnce({} as never);
    const { container } = render(
      <MobileDefectProcessPanel
        location={location}
        currentEmployee={employee}
        onDone={() => {}}
        onCancel={() => {}}
      />,
    );

    fireEvent.click(container.querySelectorAll("button")[6]);
    fireEvent.click(Array.from(container.querySelectorAll("button")).at(-1)!);
    fireEvent.click(screen.getByRole("button", { name: "set tree decision" }));
    fireEvent.click(Array.from(container.querySelectorAll("button")).at(-1)!);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(Array.from(dialog.querySelectorAll("button")).at(-1)!);

    await waitFor(() => expect(stockRequestsApi.createStockRequest).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(stockRequestsApi.createStockRequest).mock.calls[0][0];
    expect(payload).toMatchObject({
      request_type: "defect_disassemble",
      lines: [expect.objectContaining({ record_id: "record-1", item_id: "item-1", quantity: 3, from_bucket: "defective" })],
    });
    expect(JSON.parse(payload.notes ?? "{}")).toEqual({
      child_decisions: [{ child_item_id: "child-1", action: "recover" }],
    });
  });
});
