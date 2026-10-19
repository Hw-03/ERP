import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DefectLocation } from "@/lib/api/types/defects";
import { ApiError } from "@/lib/api-core";
vi.mock("../ReasonFormFields", async () => ({ ReasonFormFields: (await import("./reasonFormFieldsStub")).ReasonFormFieldsStub }));

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
  it("격리 처리 단계 바는 현재 단계를 표시하고 완료 단계와 격리 목록으로 돌아간다", () => {
    const onCancel = vi.fn();
    render(<DefectProcessPanel locations={locations} currentEmployee={employee} onDone={vi.fn()} onCancel={onCancel} />);
    const stepper = within(screen.getByRole("navigation", { name: "불량 처리 단계" }));
    expect(stepper.getByRole("button", { name: "처리 선택", exact: true })).toHaveAttribute("aria-current", "step");
    expect(stepper.queryByRole("button", { name: "BOM 확인", exact: true })).not.toBeInTheDocument();
    const bomButton = stepper.getByRole("button", { name: "BOM 확인", exact: true, hidden: true });
    fireEvent.click(screen.getByRole("button", { name: /^재작업/ }));
    expect(stepper.getByRole("button", { name: "BOM 확인", exact: true })).toBe(bomButton);
    expect(stepper.getByRole("button", { name: "BOM 확인", exact: true })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /^전체 폐기/ }));
    expect(stepper.queryByRole("button", { name: "BOM 확인", exact: true })).not.toBeInTheDocument();
    expect(bomButton).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^재작업/ }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "외관 불량" } });
    fireEvent.click(screen.getByRole("button", { name: "다음 →", exact: true }));
    const bomStepper = within(screen.getByRole("navigation", { name: "불량 처리 단계" }));
    expect(bomStepper.getByRole("button", { name: "BOM 확인", exact: true })).toHaveAttribute("aria-current", "step");
    fireEvent.click(bomStepper.getByRole("button", { name: "처리 선택", exact: true }));
    expect(screen.getByRole("button", { name: "다음 →", exact: true })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("navigation", { name: "불량 처리 단계" })).getByRole("button", { name: "격리 목록", exact: true }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it.each([false, true])("기존 격리 처리와 정상 복귀에 격리 재고 요약을 표시한다 (restoreOnly=%s)", (restoreOnly) => {
    render(<DefectProcessPanel locations={locations} restoreOnly={restoreOnly} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />);
    const summary = screen.getByLabelText("품목 수량 요약");
    expect(within(summary).getByText("격리 가용 재고")).toBeInTheDocument();
    expect(within(summary).getByText("격리 기록")).toBeInTheDocument();
    expect(within(summary).getAllByRole("definition").map((node) => node.textContent)).toEqual(["5개", "5개", "2건"]);
  });

  it("단일 격리 처리 수량을 바꾸면 요약에도 즉시 반영한다", () => {
    render(<DefectProcessPanel location={locations[0]} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "1" } });
    expect(within(screen.getByLabelText("품목 수량 요약")).getAllByRole("definition").map((node) => node.textContent)).toEqual(["2개", "1개", "1건"]);
  });

  beforeEach(() => {
    apiMocks.unquarantine.mockReset().mockResolvedValue(undefined);
    apiMocks.unquarantineBulk.mockReset().mockResolvedValue({ processed_records: 2, total_quantity: 5, message: "완료" });
    apiMocks.createStockRequest.mockReset().mockResolvedValue(undefined);
  });

  it("reviews each selected origin's own timestamp, actor, memo and full remainder before confirming", async () => {
    const selected = [
      { ...locations[0], quarantined_by: "첫 격리자", reason_memo: "첫 기록 메모" },
      { ...locations[1], defective_at: "2026-09-02T03:04:00Z", quarantined_by: "둘째 격리자", reason_memo: "둘째 기록 메모" },
    ];
    render(<DefectProcessPanel locations={selected} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />);
    const origins = within(screen.getByRole("region", { name: "선택 원건 재확인" })).getAllByRole("article");
    expect(origins).toHaveLength(2);
    expect(origins[0]).toHaveAttribute("data-record-id", "record-1");
    expect(origins[0]).toHaveTextContent("첫 격리자");
    expect(origins[0]).toHaveTextContent("첫 기록 메모");
    expect(origins[0]).toHaveTextContent("2026년 09월 01일 09시 00분");
    expect(origins[0]).toHaveTextContent("잔량 전체 2개");
    expect(origins[1]).toHaveAttribute("data-record-id", "record-2");
    expect(origins[1]).toHaveTextContent("둘째 격리자");
    expect(origins[1]).toHaveTextContent("둘째 기록 메모");
    expect(origins[1]).toHaveTextContent("2026년 09월 02일 12시 04분");
    expect(origins[1]).toHaveTextContent("잔량 전체 3개");
    fireEvent.click(screen.getByRole("button", { name: "정상 복귀 →" }));
    const dialog = await screen.findByRole("dialog");
    const confirmed = within(dialog).getByRole("region", { name: "선택 원건 재확인" });
    expect(confirmed).toHaveTextContent("첫 기록 메모");
    expect(confirmed).toHaveTextContent("둘째 기록 메모");
    expect(within(confirmed).getAllByRole("article")).toHaveLength(2);
    expect(apiMocks.unquarantineBulk).not.toHaveBeenCalled();
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
    expect(screen.getByText("일괄 처리는 각 원건의 남은 수량 전체를 처리합니다. 일부 수량은 개별 처리에서 입력하세요.")).toBeVisible();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "공통 메모" } });
    fireEvent.click(screen.getByRole("button", { name: "정상 복귀 →" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "즉시 복귀" }));

    await waitFor(() => expect(apiMocks.unquarantineBulk).toHaveBeenCalledTimes(1));
    expect(apiMocks.unquarantine).not.toHaveBeenCalled();
    expect(apiMocks.unquarantineBulk).toHaveBeenCalledWith({
      actor_employee_id: "employee-1",
      reason_category: null,
      reason_category_id: null,
      reason_memo: "공통 메모",
      lines: [
        { record_id: "record-1", item_id: "item-1", department: "조립", quantity: 2 },
        { record_id: "record-2", item_id: "item-1", department: "조립", quantity: 3 },
      ],
    });
    expect(dialog).not.toBeInTheDocument();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("restores selected POOL rows by their distinct pool ids", async () => {
    const pools = locations.map((row, index) => ({ ...row, record_id: null, pool_id: `pool-${index + 1}`, source_kind: "POOL" as const, version: 1, original_quantity: null }));
    render(<DefectProcessPanel locations={pools} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "정상 복귀 →" }));
    fireEvent.click(await screen.findByRole("button", { name: "즉시 복귀" }));
    await waitFor(() => expect(apiMocks.unquarantineBulk).toHaveBeenCalledTimes(1));
    expect(apiMocks.unquarantineBulk.mock.calls[0][0].lines).toEqual([
      expect.objectContaining({ pool_id: "pool-1", quantity: 2 }),
      expect.objectContaining({ pool_id: "pool-2", quantity: 3 }),
    ]);
  });

  it("sends the selected POOL source for scrap requests", async () => {
    const pool = { ...locations[0], record_id: null, pool_id: "pool-1", source_kind: "POOL" as const, version: 1, original_quantity: null };
    render(<DefectProcessPanel location={pool} currentEmployee={employee} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /전체 폐기/ }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "외관 불량" } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "폐기 사유" } });
    fireEvent.click(screen.getByRole("button", { name: "즉시 폐기 →" }));
    fireEvent.click(await screen.findByRole("button", { name: "즉시 폐기" }));
    await waitFor(() => expect(apiMocks.createStockRequest).toHaveBeenCalledTimes(1));
    expect(apiMocks.createStockRequest.mock.calls[0][0].lines[0]).toEqual(expect.objectContaining({ pool_id: "pool-1", quantity: 2 }));
  });

  it("invalidates the batch after server validation changes without reporting success", async () => {
    const onInvalidated = vi.fn();
    const onDone = vi.fn();
    apiMocks.unquarantineBulk.mockRejectedValue(new ApiError("수량이 변경되었습니다", 422));
    render(<DefectProcessPanel locations={locations} currentEmployee={employee}
      onDone={onDone} onCancel={vi.fn()} onInvalidated={onInvalidated} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "검사 완료" } });
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
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "외관 불량" } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "폐기 사유" } });
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
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "외관 불량" } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "폐기 사유" } });
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
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "외관 불량" } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "재작업 사유" } });
    fireEvent.click(screen.getByRole("button", { name: "다음 →" }));
    expect(screen.getByLabelText("재작업 합계")).toHaveTextContent("5");
    expect(within(screen.getByLabelText("품목 수량 요약")).getAllByRole("definition").map((node) => node.textContent)).toEqual(["5개", "5개", "2건"]);
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
