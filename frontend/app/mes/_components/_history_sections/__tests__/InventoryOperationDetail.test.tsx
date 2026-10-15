import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryOperation, InventoryOperationLine, TransactionLog } from "@/lib/api/types/production";
import { InventoryOperationDetail } from "../InventoryOperationDetail";

const state = vi.hoisted(() => ({ detail: vi.fn() }));
vi.mock("@/lib/api/production", () => ({ productionApi: { getInventoryOperation: state.detail } }));

function line(overrides: Partial<InventoryOperationLine> = {}): InventoryOperationLine {
  return { logId: "output", itemId: "product", itemName: "생산 결과품", mesCode: "P1", transactionType: "PRODUCE", quantityChange: 9, quantityBefore: 1, quantityAfter: 10, transferQty: null, department: "튜브", operationRole: "PRODUCT_OUTPUT", reversesLogId: null, referenceNo: null, notes: null, createdAt: "2026-10-13T02:44:00Z", ...overrides };
}

function operation(overrides: Partial<InventoryOperation> = {}): InventoryOperation {
  return { operationId: "op", kind: "BUSINESS", domain: "inventory_io", action: "produce", displayLabel: "produce", effectiveStatus: "active", actorEmployeeId: "e1", actorName: "김작업", department: "튜브", reason: null, effectiveAt: "2026-10-13T02:44:00Z", reversesOperationId: null, reversalOperationId: null, canCancel: false, cancelBlockers: [], lines: [line(), line({ logId: "input", itemId: "material", itemName: "사용 자재", mesCode: "M1", transactionType: "BACKFLUSH", quantityChange: -9, quantityBefore: 186, quantityAfter: 177, operationRole: "COMPONENT_INPUT" })], matchingLines: [], effects: [], ...overrides };
}

function mount(value: InventoryOperation): void {
  state.detail.mockResolvedValue(value);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><InventoryOperationDetail operationId="op" onBack={vi.fn()} onNavigate={vi.fn()} /></QueryClientProvider>);
}

describe("직원용 작업 상세", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(["available", "unavailable"] as const)("요청 순 계산 상태와 관계없이 실제 처리 전후 재고만 표시한다: %s", async (status) => {
    const historyLog = { log_id: "out", item_id: "material", item_name: "처리 품목", item_unit: "EA", transaction_type: "BACKFLUSH",
      quantity_change: -6, quantity_before: 40, quantity_after: 34, warehouse_qty_before: 0, warehouse_qty_after: 0,
      department_qty_before: 40, department_qty_after: 34, department: "튜브", inventory_effect: [],
      request_order_stock: { status, reason: status === "unavailable" ? "ambiguous_order" : null, warehouse_qty_before: 0, warehouse_qty_after: 0, department_qty_before: 60, department_qty_after: 54 },
      created_at: "2026-10-13T02:44:00Z" } as TransactionLog;
    mount(operation({ action: "adjust_out", lines: [line({ historyLog })] }));
    expect(await screen.findByLabelText("튜브 40 −6→34")).toBeVisible();
    expect(screen.queryByLabelText("튜브 60 −6→54")).not.toBeInTheDocument();
    expect(screen.queryByText("요청 순 재고")).not.toBeInTheDocument();
    expect(screen.queryByText(/계산 불가/)).not.toBeInTheDocument();
  });

  it("실제 전후 기록이 없으면 요청 순 계산 수량으로 대체하지 않는다", async () => {
    const historyLog = { log_id: "out", item_id: "material", item_name: "처리 품목", item_unit: "EA", transaction_type: "BACKFLUSH",
      quantity_change: -6, quantity_before: null, quantity_after: null, warehouse_qty_before: null, warehouse_qty_after: null,
      department_qty_before: null, department_qty_after: null, inventory_effect: [],
      request_order_stock: { status: "available", reason: null, warehouse_qty_before: 0, warehouse_qty_after: 0, department_qty_before: 60, department_qty_after: 54 },
      created_at: "2026-10-13T02:44:00Z" } as TransactionLog;
    mount(operation({ action: "adjust_out", lines: [line({ historyLog })] }));
    expect(await screen.findByText("기록 없음")).toBeVisible();
    expect(screen.queryByLabelText("부서 60 −6→54")).not.toBeInTheDocument();
  });

  it("결과를 먼저 표시하고 처리 상태·취소 제한은 접힌 영역에서 확인한다", async () => {
    mount(operation({ cancelBlockers: ["취소 제한 확인"], effects: [{ effectId: "status", effectKind: "WORKFLOW", subjectType: "IoBatch", subjectId: "batch", role: "EXECUTION_STATUS", beforeState: { status: "submitted" }, afterState: { status: "completed" }, reversesEffectId: null }] }));
    const result = await screen.findByRole("region", { name: "생산된 품목" });
    const disclosure = screen.getByText("처리 정보 보기");
    expect(result.compareDocumentPosition(disclosure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(disclosure.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("제출 → 완료")).not.toBeVisible();
    expect(screen.getByText("2026년 10월 13일 11시 44분")).not.toBeVisible();
    fireEvent.click(disclosure);
    expect(screen.getByText("제출 → 완료")).toBeVisible();
    expect(screen.getByText("2026년 10월 13일 11시 44분")).toBeVisible();
    expect(screen.getByText("취소 제한 확인")).toBeVisible();
  });

  it("공통 사유는 공백을 정규화해 한 번 표시하고 품목별 다른 메모는 보존한다", async () => {
    mount(operation({ reason: "튜브  불량", lines: [line({ notes: "튜브\n불량" }), line({ logId: "input", itemName: "사용 자재", notes: "별도 자재 확인" })] }));
    const result = await screen.findByRole("region", { name: "생산된 품목" });
    expect(screen.getAllByText(/튜브\s+불량/)).toHaveLength(1);
    const reason = screen.getByText(/튜브\s+불량/);
    expect(result.compareDocumentPosition(reason) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("사유")).toBeVisible();
    expect(screen.getByText("별도 자재 확인")).toBeVisible();
    expect(screen.queryByText("이 작업에 포함된 전체 품목입니다. 재고는 작업 당시의 기록입니다.")).not.toBeInTheDocument();
  });

  it("다른 작업 상세로 이동하면 펼친 처리 정보를 다시 접는다", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    state.detail.mockImplementation(async (id: string) => operation({ operationId: id, displayLabel: id === "op" ? "첫 작업" : "다음 작업", cancelBlockers: ["취소 제한 확인"] }));
    const view = render(<QueryClientProvider client={client}><InventoryOperationDetail operationId="op" onBack={vi.fn()} onNavigate={vi.fn()} /></QueryClientProvider>);
    await screen.findByText("첫 작업");
    fireEvent.click(screen.getByText("처리 정보 보기"));
    expect(screen.getByText("취소 제한 확인")).toBeVisible();
    view.rerender(<QueryClientProvider client={client}><InventoryOperationDetail operationId="next" onBack={vi.fn()} onNavigate={vi.fn()} /></QueryClientProvider>);
    await screen.findByText("다음 작업");
    expect(screen.getByText("처리 정보 보기").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("취소 제한 확인")).not.toBeVisible();
  });

  it("생산 결과와 사용 자재를 구분하고 입출고 내역의 요약 카드를 공유한다", async () => {
    mount(operation({ effects: [{ effectId: "status", effectKind: "WORKFLOW", subjectType: "IoBatch", subjectId: "batch", role: "EXECUTION_STATUS", beforeState: { status: "submitted" }, afterState: { status: "completed" }, reversesEffectId: null }] }));
    expect(await screen.findByTestId("history-operation-summary")).toHaveTextContent("생산");
    expect(screen.getByTestId("history-key-point-summary")).toHaveTextContent("김작업");
    expect(within(screen.getByRole("region", { name: "생산된 품목" })).getByText("생산 결과품")).toBeVisible();
    const inputs = within(screen.getByRole("region", { name: "사용한 자재" }));
    expect(inputs.getByText("사용 자재")).toBeVisible();
    expect(inputs.getByText("9 사용")).toBeVisible();
    expect(inputs.getByText("186 → 177")).toBeVisible();
    fireEvent.click(screen.getByText("처리 정보 보기"));
    expect(screen.getByText("입출고 작업")).toBeVisible();
    expect(screen.getByText("제출 → 완료")).toBeVisible();
    expect(screen.queryByText("produce")).not.toBeInTheDocument();
  });

  it("생산 취소는 반환 자재와 생산 취소 품목을 역할대로 표시한다", async () => {
    const original = operation();
    mount(operation({ kind: "CANCELLATION", effectiveStatus: "cancellation", displayLabel: "produce 취소", lines: original.lines.map(value => ({ ...value, quantityChange: -value.quantityChange })) }));
    expect(await screen.findByTestId("history-operation-summary")).toHaveTextContent("생산 취소");
    expect(within(screen.getByRole("region", { name: "생산 취소 품목" })).getByText("생산 결과품")).toBeVisible();
    expect(within(screen.getByRole("region", { name: "반환된 자재" })).getByText("사용 자재")).toBeVisible();
    expect(screen.queryByRole("region", { name: "생산된 품목" })).not.toBeInTheDocument();
  });

  it.each(["disassemble", "disassembly"])("분해는 차감 대상과 회수 자재를 나눈다 %s", async (action) => {
    mount(operation({ action, displayLabel: "분해", lines: [line({ transactionType: "DISASSEMBLE", operationRole: "PRIMARY", quantityChange: -1 }), line({ logId: "recovery", itemName: "회수 자재", operationRole: "PRODUCT_OUTPUT", quantityChange: 3 })] }));
    expect(await screen.findByTestId("history-operation-summary")).toHaveTextContent("분해");
    expect(screen.getByRole("region", { name: "분해한 품목" })).toHaveTextContent("생산 결과품");
    expect(screen.getByRole("region", { name: "회수한 자재" })).toHaveTextContent("회수 자재");
  });

  it("이동의 합계 변화가 0이어도 실제 이동 수량을 표시한다", async () => {
    mount(operation({ action: "warehouse_to_dept", displayLabel: "warehouse_to_dept", lines: [line({ transactionType: "TRANSFER_TO_PROD", operationRole: "TRANSFER", quantityChange: 0, transferQty: 5 })] }));
    await screen.findByText("창고 → 부서");
    expect(screen.getByRole("region", { name: "이동한 품목" })).toHaveTextContent("5 이동");
    expect(screen.queryByText("0 이동")).not.toBeInTheDocument();
  });

  it("재작업 회수 전 폐기를 입고 재고처럼 표시하지 않는다", async () => {
    const historyLog = { log_id: "scrap", item_id: "material", item_name: "폐기 자재", mes_code: "M1", item_unit: "EA", transaction_type: "DEFECT_SCRAP", operation_role: "REWORK_CHILD_SCRAP", quantity_change: -2, quantity_before: 2, quantity_after: 0, warehouse_qty_before: 0, warehouse_qty_after: 0, department_qty_before: 0, department_qty_after: 0, created_at: "2026-10-13T02:44:00Z", cancelled: false, inventory_effect: [] } as TransactionLog;
    mount(operation({ action: "rework_defective", displayLabel: "재작업", lines: [line({ logId: "scrap", itemName: "폐기 자재", operationRole: "REWORK_CHILD_SCRAP", transactionType: "DEFECT_SCRAP", quantityChange: -2, historyLog })] }));
    await screen.findByText("재작업");
    expect(screen.getByRole("region", { name: "폐기한 자재" })).toHaveTextContent("재입고 하지 않고 폐기");
  });

  it("품목 전환은 생산 대신 전환 전후 품목을 구분한다", async () => {
    mount(operation({ action: "component_change", displayLabel: "품목 전환" }));
    await screen.findByText("품목 전환");
    expect(screen.getByRole("region", { name: "전환 전 품목" })).toHaveTextContent("사용 자재");
    expect(screen.getByRole("region", { name: "전환 후 품목" })).toHaveTextContent("생산 결과품");
    expect(screen.queryByRole("region", { name: "생산된 품목" })).not.toBeInTheDocument();
  });

  it("내부 재작업 태그를 숨기고 직원이 입력한 메모를 보존한다", async () => {
    mount(operation({ lines: [line({ notes: "[rework:normal_child]" }), line({ logId: "memo", notes: "[dept_adj:production] 생산: 직원 확인 메모" })] }));
    await screen.findByTestId("history-operation-summary");
    expect(screen.queryByText(/\[rework:/)).not.toBeInTheDocument();
    expect(screen.getByText("직원 확인 메모")).toBeVisible();
  });

  it.each(["PRODUCE", "RECEIVE"] as const)("V2 분해의 PRIMARY 회수 행도 회수 자재로 표시한다 %s", async (transactionType) => {
    mount(operation({ action: "disassemble", displayLabel: "분해", lines: [line({ transactionType: "BACKFLUSH", operationRole: "PRIMARY", quantityChange: -1 }), line({ logId: "recovered", itemName: "회수 자재", transactionType, operationRole: "PRIMARY", quantityChange: 3 })] }));
    await screen.findByTestId("history-operation-summary");
    expect(screen.getByRole("region", { name: "분해한 품목" })).not.toHaveTextContent("회수 자재");
    expect(screen.getByRole("region", { name: "회수한 자재" })).toHaveTextContent("회수 자재");
  });

  it("출하 픽업 상태를 한글로 표시한다", async () => {
    mount(operation({ action: "pickup", displayLabel: "출하 픽업", lines: [], effects: [{ effectId: "status", effectKind: "WORKFLOW", subjectType: "ShippingRequest", subjectId: "shipping", role: "PICKUP_STATUS", beforeState: { status: "PREPARED" }, afterState: { status: "PICKED_UP" }, reversesEffectId: null }] }));
    await screen.findByTestId("history-operation-summary");
    fireEvent.click(screen.getByText("처리 정보 보기"));
    expect(screen.getByText("준비 완료 → 픽업 완료")).toBeVisible();
  });

  it.each([["tube_receive_supplier", "PRODUCE", 3, "입고된 품목"], ["adjust_out", "BACKFLUSH", -3, "출고된 품목"]] as const)("입출고 거래 유형을 생산으로 오인하지 않는다 %s", async (action, transactionType, quantityChange, group) => {
    mount(operation({ action, displayLabel: action, lines: [line({ transactionType, quantityChange, operationRole: "PRIMARY" })] }));
    await screen.findByTestId("history-operation-summary");
    expect(screen.getByRole("region", { name: group })).toHaveTextContent("생산 결과품");
    expect(screen.queryByRole("region", { name: "생산된 품목" })).not.toBeInTheDocument();
  });

  it.each([["raw_receive", "원자재 입고", "RECEIVE", 3, "입고된 품목"], ["internal_use", "AS·연구 사용출고", "INTERNAL_USE", -3, "사용 출고한 품목"], ["quantity_correction", "수량 보정", "ADJUST", -3, "수량을 보정한 품목"]] as const)("다른 작업도 한글 작업명과 품목 의미를 표시한다 %s", async (action, label, transactionType, quantityChange, group) => {
    mount(operation({ action, displayLabel: action, lines: [line({ transactionType, operationRole: "PRIMARY", quantityChange })] }));
    expect(await screen.findByText(label)).toBeVisible();
    expect(screen.getByRole("region", { name: group })).toHaveTextContent("생산 결과품");
  });

  it("알 수 없는 내부 작업명과 상태값은 영어 대신 확인 안내를 표시한다", async () => {
    mount(operation({ action: "future_work", displayLabel: "future_work", lines: [], effects: [{ effectId: "state", effectKind: "WORKFLOW", subjectType: "FutureDoc", subjectId: "doc", role: "STATUS", beforeState: { status: "future_state" }, afterState: { status: "COMPLETED" }, reversesEffectId: null }] }));
    expect(await screen.findByText("재고 작업")).toBeVisible();
    fireEvent.click(screen.getByText("처리 정보 보기"));
    expect(screen.getByText("상태 확인 필요 → 완료")).toBeVisible();
    expect(screen.queryByText(/future_/)).not.toBeInTheDocument();
  });
});
