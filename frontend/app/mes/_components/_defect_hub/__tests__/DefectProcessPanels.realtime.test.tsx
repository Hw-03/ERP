import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import type { DefectLocation } from "@/lib/api/types/defects";
import { REASON_CATEGORIES } from "../reasonCategories";

const apiMocks = vi.hoisted(() => ({
  unquarantine: vi.fn(),
  createStockRequest: vi.fn(),
}));

vi.mock("@/lib/api/defects", () => ({
  defectsApi: { unquarantine: apiMocks.unquarantine },
}));

vi.mock("@/lib/api/stock-requests", () => ({
  stockRequestsApi: { createStockRequest: apiMocks.createStockRequest },
}));

vi.mock("../DisassembleTree", () => ({
  DisassembleTree: ({
    parentQty,
    decisions,
    onChange,
  }: {
    parentQty: number;
    decisions: unknown[];
    onChange: (next: unknown[]) => void;
  }) => (
    <div data-testid="decision-tree">
      <output data-testid="decision-parent-qty">{parentQty}</output>
      <output data-testid="decision-count">{decisions.length}</output>
      <button type="button" onClick={() => onChange([{ item_id: "child-1", qty: parentQty }])}>
        Add decision
      </button>
    </div>
  ),
  toServerDecision: (decision: unknown) => decision,
  validateDecisionTree: () => true,
}));

import { DefectProcessPanel } from "../DefectProcessPanel";
import { MobileDefectProcessPanel } from "../../mobile/screens/MobileDefectProcessPanel";

type PanelProps = {
  location: DefectLocation;
  currentEmployee: { employee_id: string; name: string; department: string };
  onDone: () => void;
  onCancel: () => void;
};

const employee = { employee_id: "employee-1", name: "Operator", department: "Assembly" };
const location = {
  record_id: "record-1",
  item_id: "item-1",
  item_name: "Defect item",
  mes_code: "D-001",
  department: "Assembly",
  quantity: 10,
  original_quantity: 10,
  pending_quantity: 0,
  available_quantity: 10,
  defective_at: null,
  reason_category: null,
  reason_memo: null,
  quarantined_by: "Operator",
  quarantined_by_employee_id: "employee-1",
  is_legacy: false,
  has_bom: true,
} satisfies DefectLocation;

const panels: Array<[string, ComponentType<PanelProps>]> = [
  ["desktop", DefectProcessPanel],
  ["mobile", MobileDefectProcessPanel],
];

describe.each(panels)("%s defect process panel realtime location updates", (_name, Panel) => {
  beforeEach(() => {
    apiMocks.unquarantine.mockReset().mockResolvedValue(undefined);
    apiMocks.createStockRequest.mockReset().mockResolvedValue(undefined);
  });

  it("preserves valid drafts, clamps only above the fresh max, and submits the fresh quantity", async () => {
    const props = { currentEmployee: employee, onDone: vi.fn(), onCancel: vi.fn() };
    const { rerender } = render(<Panel {...props} location={location} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "4" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: REASON_CATEGORIES[0] } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Unsaved memo" } });

    rerender(<Panel {...props} location={{ ...location, quantity: 12, available_quantity: 12 }} />);
    expect(screen.getByRole("spinbutton")).toHaveValue(4);
    expect(screen.getByRole("combobox")).toHaveValue(REASON_CATEGORIES[0]);
    expect(screen.getByRole("textbox")).toHaveValue("Unsaved memo");

    rerender(<Panel {...props} location={{ ...location, quantity: 3, available_quantity: 3 }} />);
    await waitFor(() => expect(screen.getByRole("spinbutton")).toHaveValue(3));
    expect(screen.getByRole("combobox")).toHaveValue(REASON_CATEGORIES[0]);
    expect(screen.getByRole("textbox")).toHaveValue("Unsaved memo");

    const submitButtons = screen.getAllByRole("button", { name: /정상 복귀/ });
    fireEvent.click(submitButtons[submitButtons.length - 1]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(Array.from(dialog.querySelectorAll("button")).at(-1)!);
    await waitFor(() => {
      expect(apiMocks.unquarantine).toHaveBeenCalledWith(expect.objectContaining({
        record_id: "record-1",
        item_id: "item-1",
        qty: 3,
        reason_category: REASON_CATEGORIES[0],
        reason_memo: "Unsaved memo",
      }));
    });
  });

  it("preserves the decision draft when realtime quantity changes but effective parent quantity does not", async () => {
    const props = { currentEmployee: employee, onDone: vi.fn(), onCancel: vi.fn() };
    const { container, rerender } = render(<Panel {...props} location={location} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "4" } });
    const rework = screen.getByRole("button", { name: /재작업/ });
    fireEvent.click(rework);
    fireEvent.click(Array.from(container.querySelectorAll("button")).at(-1)!);
    fireEvent.click(await screen.findByRole("button", { name: "Add decision" }));
    expect(screen.getByTestId("decision-count")).toHaveTextContent("1");

    rerender(<Panel {...props} location={{ ...location, quantity: 12, available_quantity: 12 }} />);
    expect(screen.getByTestId("decision-tree")).toBeInTheDocument();
    expect(screen.getByTestId("decision-parent-qty")).toHaveTextContent("4");
    expect(screen.getByTestId("decision-count")).toHaveTextContent("1");
  });

  it("invalidates the decision draft when realtime clamping changes the effective parent quantity", async () => {
    const props = { currentEmployee: employee, onDone: vi.fn(), onCancel: vi.fn() };
    const { container, rerender } = render(<Panel {...props} location={location} />);
    fireEvent.click(screen.getByRole("button", { name: /재작업/ }));
    fireEvent.click(Array.from(container.querySelectorAll("button")).at(-1)!);
    fireEvent.click(await screen.findByRole("button", { name: "Add decision" }));
    expect(screen.getByTestId("decision-count")).toHaveTextContent("1");

    rerender(<Panel {...props} location={{ ...location, quantity: 8, available_quantity: 8 }} />);

    await waitFor(() => expect(screen.getByTestId("decision-parent-qty")).toHaveTextContent("8"));
    expect(screen.getByTestId("decision-count")).toHaveTextContent("0");
    expect(screen.getByRole("button", { name: /최종 처리/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /최종 처리/ }));
    expect(apiMocks.createStockRequest).not.toHaveBeenCalled();
  });

  it("fully resets drafts when the quarantine record identity changes", async () => {
    const props = { currentEmployee: employee, onDone: vi.fn(), onCancel: vi.fn() };
    const { rerender } = render(<Panel {...props} location={location} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "4" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: REASON_CATEGORIES[0] } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Old draft" } });

    rerender(
      <Panel
        {...props}
        location={{ ...location, record_id: "record-2", quantity: 7, available_quantity: 7 }}
      />,
    );

    await waitFor(() => expect(screen.getByRole("spinbutton")).toHaveValue(7));
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("limits processing to the unreserved quantity and links approval requests to the record", async () => {
    const props = { currentEmployee: employee, onDone: vi.fn(), onCancel: vi.fn() };
    const { container } = render(
      <Panel
        {...props}
        location={{ ...location, quantity: 10, pending_quantity: 4, available_quantity: 6 }}
      />,
    );

    expect(screen.getByRole("spinbutton")).toHaveValue(6);
    fireEvent.click(screen.getByRole("button", { name: /전체 폐기/ }));
    fireEvent.click(Array.from(container.querySelectorAll("button")).at(-1)!);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("승인 완료 후 재고에 반영됩니다.");
    fireEvent.click(Array.from(dialog.querySelectorAll("button")).at(-1)!);

    await waitFor(() => {
      expect(apiMocks.createStockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          request_type: "defect_scrap",
          lines: [expect.objectContaining({ record_id: "record-1", quantity: 6 })],
        }),
      );
    });
  });
});
