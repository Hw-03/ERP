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
  record_id: "record-1",
  item_id: "item-1",
  item_name: "Defect Item",
  mes_code: "DEF-001",
  department: "Assembly",
  quantity: 3,
  original_quantity: 5,
  pending_quantity: 0,
  available_quantity: 3,
  defective_at: null,
  reason_category: null,
  reason_memo: null,
  quarantined_by: "Kim",
  quarantined_by_employee_id: "emp-1",
  is_legacy: false,
  has_bom: false,
};

describe("DefectProcessPanel normal recovery", () => {
  it.each(["", "   "])("사유가 %j이면 진행을 막고 카테고리나 메모 중 하나만 있어도 허용한다", (memo) => {
    render(<DefectProcessPanel location={location} currentEmployee={{ employee_id: "emp-1", name: "Kim", department: "Assembly" }} onDone={() => {}} onCancel={() => {}} />);
    const submit = screen.getByRole("button", { name: "정상 복귀 →" });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: memo } });
    fireEvent.click(submit);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "검사 완료" } });
    expect(submit).toBeEnabled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: screen.getAllByRole("option")[1].getAttribute("value") } });
    expect(submit).toBeEnabled();
  });

  it.each(["재작업", "반품"])("사유 없이 %s의 다음 단계로 넘어가지 않는다", (action) => {
    render(<DefectProcessPanel location={{ ...location, has_bom: true, department: "창고" }} currentEmployee={{ employee_id: "emp-1", name: "Kim", department: "Assembly" }} onDone={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${action}`) }));
    expect(screen.getByRole("button", { name: action === "재작업" ? "다음 →" : "공급업체 선택 →" })).toBeDisabled();
  });
  it("restoreOnly 모드에서는 정상 복귀 외의 처리 선택을 노출하지 않는다", () => {
    render(
      <DefectProcessPanel
        location={{ ...location, has_bom: true, department: "창고" }}
        restoreOnly
        currentEmployee={{ employee_id: "emp-1", name: "Kim", department: "Assembly" }}
        onDone={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getAllByRole("button", { name: /정상 복귀/ })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /재작업|전체 폐기|반품/ })).not.toBeInTheDocument();
  });

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

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "검사 완료" } });
    fireEvent.click(Array.from(container.querySelectorAll("button")).at(-1)!);

    expect(defectsApi.unquarantine).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(Array.from(dialog.querySelectorAll("button")).at(-1)!);

    await waitFor(() => expect(defectsApi.unquarantine).toHaveBeenCalledTimes(1));
    expect(defectsApi.unquarantine).toHaveBeenCalledWith(
      expect.objectContaining({ record_id: "record-1", qty: 3 }),
    );
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
