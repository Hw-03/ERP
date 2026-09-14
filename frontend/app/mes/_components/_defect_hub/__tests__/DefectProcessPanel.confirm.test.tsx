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

    fireEvent.click(Array.from(container.querySelectorAll("button")).at(-1)!);

    expect(defectsApi.unquarantine).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(Array.from(dialog.querySelectorAll("button")).at(-1)!);

    await waitFor(() => expect(defectsApi.unquarantine).toHaveBeenCalledTimes(1));
    expect(defectsApi.unquarantine).toHaveBeenCalledWith(
      expect.objectContaining({ record_id: "record-1", qty: 3, client_request_id: expect.any(String) }),
    );
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("응답 유실 뒤 재시도해도 최초 정상 복귀 요청 ID와 payload를 보존한다", async () => {
    vi.mocked(defectsApi.unquarantine)
      .mockReset()
      .mockRejectedValueOnce(new Error("연결 실패"))
      .mockResolvedValueOnce(undefined);
    const { container } = render(
      <DefectProcessPanel
        location={location}
        currentEmployee={{ employee_id: "emp-1", name: "Kim", department: "Assembly" }}
        onDone={() => {}}
        onCancel={() => {}}
      />,
    );

    const submit = () => fireEvent.click(Array.from(container.querySelectorAll("button")).at(-1)!);
    submit();
    fireEvent.click(Array.from(screen.getByRole("dialog").querySelectorAll("button")).at(-1)!);
    expect(await screen.findByText("연결 실패")).toBeInTheDocument();
    const firstPayload = vi.mocked(defectsApi.unquarantine).mock.calls[0][0];

    submit();
    fireEvent.click(Array.from(screen.getByRole("dialog").querySelectorAll("button")).at(-1)!);

    await waitFor(() => expect(defectsApi.unquarantine).toHaveBeenCalledTimes(2));
    expect(firstPayload.client_request_id).toEqual(expect.any(String));
    expect(vi.mocked(defectsApi.unquarantine).mock.calls[1][0]).toEqual(firstPayload);
  });
});
