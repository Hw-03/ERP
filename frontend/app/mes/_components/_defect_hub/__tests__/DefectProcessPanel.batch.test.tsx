import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DefectLocation } from "@/lib/api/types/defects";
import { ApiError } from "@/lib/api-core";

const apiMocks = vi.hoisted(() => ({
  unquarantine: vi.fn(),
  unquarantineBulk: vi.fn(),
  createStockRequest: vi.fn(),
}));

vi.mock("@/lib/api/defects", () => ({
  defectsApi: {
    unquarantine: apiMocks.unquarantine,
    unquarantineBulk: apiMocks.unquarantineBulk,
  },
}));

vi.mock("@/lib/api/stock-requests", () => ({
  stockRequestsApi: { createStockRequest: apiMocks.createStockRequest },
}));

vi.mock("../DisassembleTree", () => ({
  DisassembleTree: ({ parentQty, onChange }: { parentQty: number; onChange: (value: unknown[]) => void }) => (
    <div>
      <output aria-label="재작업 합계">{parentQty}</output>
      <button type="button" onClick={() => onChange([{ item_id: "child-1", qty: parentQty }])}>
        결정 추가
      </button>
    </div>
  ),
  toServerDecision: (decision: unknown) => decision,
  validateDecisionTree: () => true,
}));

import { DefectProcessPanel } from "../DefectProcessPanel";

function location(recordId: string, quantity: number): DefectLocation {
  return {
    record_id: recordId,
    item_id: "item-1",
    item_name: "반복 불량 품목",
    mes_code: "DEF-001",
    department: "조립",
    quantity,
    original_quantity: quantity,
    pending_quantity: 0,
    available_quantity: quantity,
    defective_at: "2026-09-01T00:00:00Z",
    reason_category: null,
    reason_memo: null,
    quarantined_by: "작업자",
    quarantined_by_employee_id: "employee-1",
    is_legacy: false,
    legacy_origin: null,
    has_bom: true,
  };
}

const locations = [location("record-1", 2), location("record-2", 3)];
const employee = { employee_id: "employee-1", name: "작업자", department: "조립" };

describe("DefectProcessPanel batch processing", () => {
  beforeEach(() => {
    apiMocks.unquarantine.mockReset().mockResolvedValue(undefined);
    apiMocks.unquarantineBulk.mockReset().mockResolvedValue({ processed_records: 2, total_quantity: 5, message: "완료" });
    apiMocks.createStockRequest.mockReset().mockResolvedValue(undefined);
  });

  it("restores every selected record with one atomic bulk request", async () => {
    const onDone = vi.fn();
    render(
      <DefectProcessPanel
        locations={locations}
        currentEmployee={employee}
        onDone={onDone}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.getByText("선택한 격리 기록 2건")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "기타" } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "공통 메모" } });
    fireEvent.click(screen.getByRole("button", { name: "정상 복귀 →" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "즉시 복귀" }));

    await waitFor(() => expect(apiMocks.unquarantineBulk).toHaveBeenCalledTimes(1));
    expect(apiMocks.unquarantine).not.toHaveBeenCalled();
    expect(apiMocks.unquarantineBulk).toHaveBeenCalledWith({
      actor_employee_id: "employee-1",
      reason_category: "기타",
      reason_memo: "공통 메모",
      lines: [
        { record_id: "record-1", item_id: "item-1", department: "조립", quantity: 2 },
        { record_id: "record-2", item_id: "item-1", department: "조립", quantity: 3 },
      ],
    });
    expect(dialog).not.toBeInTheDocument();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("invalidates the batch after server validation changes without reporting success", async () => {
    const onInvalidated = vi.fn();
    const onDone = vi.fn();
    apiMocks.unquarantineBulk.mockRejectedValue(new ApiError("수량이 변경되었습니다", 422));
    render(<DefectProcessPanel locations={locations} currentEmployee={employee}
      onDone={onDone} onCancel={vi.fn()} onInvalidated={onInvalidated} />);
    fireEvent.click(screen.getByRole("button", { name: "정상 복귀 →" }));
    fireEvent.click(await screen.findByRole("button", { name: "즉시 복귀" }));
    await waitFor(() => expect(onInvalidated).toHaveBeenCalledWith("수량이 변경되었습니다"));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each([
    { available_quantity: 1 },
    { pending_quantity: 1 },
  ])("invalidates a selected snapshot on a realtime quantity or pending change: %j", async (change) => {
    const onInvalidated = vi.fn();
    const props = { locations, currentEmployee: employee, onDone: vi.fn(), onCancel: vi.fn(), onInvalidated };
    const { rerender } = render(<DefectProcessPanel {...props} />);
    rerender(<DefectProcessPanel {...props} locations={[{ ...locations[0], ...change }, locations[1]]} />);
    await waitFor(() => expect(onInvalidated).toHaveBeenCalledTimes(1));
    expect(apiMocks.createStockRequest).not.toHaveBeenCalled();
    expect(apiMocks.unquarantineBulk).not.toHaveBeenCalled();
  });

  it("creates one scrap request containing only the selected record lines", async () => {
    render(
      <DefectProcessPanel
        locations={locations}
        currentEmployee={employee}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /전체 폐기/ }));
    fireEvent.click(screen.getByRole("button", { name: "즉시 폐기 →" }));
    await screen.findByRole("dialog");
    expect(screen.getByText("확인하면 즉시 재고에 반영됩니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "즉시 폐기" }));

    await waitFor(() => expect(apiMocks.createStockRequest).toHaveBeenCalledTimes(1));
    expect(apiMocks.createStockRequest).toHaveBeenCalledWith(expect.objectContaining({
      request_type: "defect_scrap",
      client_request_id: expect.stringMatching(/^defect-batch:/),
      lines: [
        expect.objectContaining({ record_id: "record-1", quantity: 2 }),
        expect.objectContaining({ record_id: "record-2", quantity: 3 }),
      ],
    }));
  });

  it("marks a one-record selection as an exact batch request", async () => {
    render(
      <DefectProcessPanel
        locations={[locations[0]]}
        batchMode
        currentEmployee={employee}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /전체 폐기/ }));
    fireEvent.click(screen.getByRole("button", { name: "즉시 폐기 →" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "즉시 폐기" }));

    await waitFor(() => expect(apiMocks.createStockRequest).toHaveBeenCalledTimes(1));
    expect(apiMocks.createStockRequest).toHaveBeenCalledWith(expect.objectContaining({
      request_type: "defect_scrap",
      client_request_id: expect.stringMatching(/^defect-batch:/),
      lines: [expect.objectContaining({ record_id: "record-1", quantity: 2 })],
    }));
  });

  it("uses the selected quantity total once for rework and preserves each source record line", async () => {
    render(
      <DefectProcessPanel
        locations={locations}
        currentEmployee={employee}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /재작업/ }));
    fireEvent.click(screen.getByRole("button", { name: "다음 →" }));
    expect(screen.getByLabelText("재작업 합계")).toHaveTextContent("5");
    fireEvent.click(screen.getByRole("button", { name: "결정 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "최종 처리 →" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "즉시 재작업" }));

    await waitFor(() => expect(apiMocks.createStockRequest).toHaveBeenCalledTimes(1));
    expect(apiMocks.createStockRequest).toHaveBeenCalledWith(expect.objectContaining({
      request_type: "defect_disassemble",
      client_request_id: expect.stringMatching(/^defect-batch:/),
      notes: JSON.stringify({ child_decisions: [{ item_id: "child-1", qty: 5 }] }),
      lines: [
        expect.objectContaining({ record_id: "record-1", quantity: 2 }),
        expect.objectContaining({ record_id: "record-2", quantity: 3 }),
      ],
    }));
  });
});
