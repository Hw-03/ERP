import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileDefectCartFlow } from "../MobileDefectCartFlow";
import { MobileDefectProcessPanel } from "../MobileDefectProcessPanel";
import type { DefectLocation } from "@/lib/api/types/defects";

vi.mock("../../../_defect_hub/DisassembleTree", () => ({
  DisassembleTree: () => <div data-testid="disassemble-tree" />,
  toServerDecision: (decision: unknown) => decision,
  validateDecisionTree: () => true,
}));

vi.mock("../../../_defect_hub/DefectItemPicker", () => ({
  DefectItemPicker: () => <div data-testid="defect-item-picker" />,
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
});
