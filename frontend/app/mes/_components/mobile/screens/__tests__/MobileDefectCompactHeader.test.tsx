import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
          })
        }
      >
        mock add
      </button>
    </div>
  ),
}));

vi.mock("../../../_defect_hub/ReasonFormFields", () => ({
  ReasonFormFields: () => <div data-testid="reason-form-fields" />,
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
  mes_code: "MES-001",
  current_stock: 10,
  has_bom: true,
};

const location: DefectLocation = {
  item_id: "item-1",
  item_name: "Long item",
  mes_code: "MES-001",
  department: "Assembly",
  quantity: 3,
  defective_at: null,
  reason_category: null,
  reason_memo: null,
  has_bom: true,
};

describe("mobile defect compact headers", () => {
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
      lines: [expect.objectContaining({ item_id: "item-1", quantity: 3, from_bucket: "defective" })],
    });
    expect(JSON.parse(payload.notes ?? "{}")).toEqual({
      child_decisions: [{ child_item_id: "child-1", action: "recover" }],
    });
  });
});
