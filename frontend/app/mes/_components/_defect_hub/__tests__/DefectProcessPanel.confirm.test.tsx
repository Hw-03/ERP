import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DefectProcessPanel } from "../DefectProcessPanel";
import type { DefectLocation } from "@/lib/api/types/defects";
import { defectsApi } from "@/lib/api/defects";

vi.mock("../DisassembleTree", () => ({
  DisassembleTree: () => null,
  toServerDecision: (decision: unknown) => decision,
  validateDecisionTree: () => true,
}));

vi.mock("@/lib/api/defects", () => ({
  defectsApi: { unquarantine: vi.fn() },
}));

vi.mock("@/lib/api/stock-requests", () => ({
  stockRequestsApi: { createStockRequest: vi.fn() },
}));

const location: DefectLocation = {
  item_id: "item-1",
  item_name: "Defect Item",
  mes_code: "DEF-001",
  department: "Assembly",
  quantity: 3,
  defective_at: null,
  reason_category: null,
  reason_memo: null,
  has_bom: false,
};

describe("DefectProcessPanel normal recovery", () => {
  it("opens confirmation before invoking unquarantine and invokes it once after confirmation", async () => {
    vi.mocked(defectsApi.unquarantine).mockResolvedValueOnce(undefined);
    const onDone = vi.fn();
    const { container } = render(
      <DefectProcessPanel
        location={location}
        currentEmployee={{ employee_id: "emp-1", name: "Kim", department: "Assembly" }}
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
});
