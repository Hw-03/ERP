import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { TransactionLog, IoBatch } from "@/lib/api";
import type { TransactionDisplayGroup } from "@/lib/api/production";
import { getHistoryGroupSummary, toHistoryLogGroups, getHistoryWorkSelection } from "../historyTableHelpers";
import { HistorySubmissionDetail } from "../HistorySubmissionDetail";
import { applyHistoryCancellation, reconcileHistorySelection } from "../historyCancellation";

const parent = (id: string, unit = "EA") => ({ log_id: id, item_id: id, item_name: id,
  item_unit: unit, quantity_change: 2, transaction_type: "PRODUCE", operation_role: "PRODUCT_OUTPUT",
  operation_id: `op-${id}`, operation_kind: "BUSINESS", operation_display_label: "produce",
  created_at: "2026-09-01T00:00:00Z", cancelled: false } as TransactionLog);
const a = parent("부모A"), b = parent("부모B", "m");
const component = { ...parent("구성품"), operation_role: "COMPONENT_INPUT", transaction_type: "BACKFLUSH" } as TransactionLog;
const wire: TransactionDisplayGroup = { type: "submission", key: "submission:id", logs: [component, a, b],
  workGroups: [{ type: "operation", key: a.operation_id!, logs: [component, a] }, { type: "operation", key: b.operation_id!, logs: [b] }] };

it("제출 대표와 품목 수는 각 작업의 선택한 상위 품목으로 계산한다", () => {
  const group = toHistoryLogGroups([wire])[0];
  expect(group.type).toBe("submission");
  const summary = getHistoryGroupSummary(group);
  expect(summary.primaryLog).toBe(a);
  expect(summary.title).toBe(a.item_name);
  expect(summary.additionalItemCount).toBe(1);
});

it("제출 요약은 전체 취소 없이 원래 작업 상세와 단위별 수량을 연결한다", () => {
  const group = toHistoryLogGroups([wire])[0];
  if (group.type !== "submission") throw new Error("submission expected");
  const select = vi.fn();
  render(<HistorySubmissionDetail group={group} onSelectWork={select} />);
  expect(screen.queryByText(/전체 취소/)).not.toBeInTheDocument();
  expect(screen.getByText("2 EA")).toBeInTheDocument();
  expect(screen.getByText("2 m")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /부모A/ }));
  const selection = getHistoryWorkSelection(select.mock.calls[0][0]);
  expect(selection.kind).toBe("batch");
  if (selection.kind === "batch") {
    expect(selection.batchId).toBe(a.operation_id);
    expect(selection.logs[0]).toBe(a);
    expect(selection.logs).toHaveLength(2);
  }
});

it("알 수 없는 서버 묶음은 개별 읽기 로그로 안전하게 표시한다", () => {
  const group = toHistoryLogGroups([{ ...wire, type: "future" } as unknown as TransactionDisplayGroup]);
  expect(group).toHaveLength(3);
  expect(group.every((value) => value.type === "solo" && value.allowCancellation === false)).toBe(true);
});

it("작업 취소 뒤에도 제출 선택과 다른 작업은 유지한다", () => {
  const group = toHistoryLogGroups([wire])[0];
  if (group.type !== "submission") throw new Error("submission expected");
  const updated = { ...a, cancelled: true, operation_effective_status: "cancelled" } as TransactionLog;
  const state = applyHistoryCancellation({ logs: wire.logs, selection: { kind: "submission", group }, batchCache: new Map() }, updated);
  expect(state.selection?.kind).toBe("submission");
  expect(state.logs.find((log) => log.log_id === b.log_id)?.cancelled).toBe(false);
  const reconciled = reconcileHistorySelection(state.selection, state.logs);
  expect(reconciled?.kind).toBe("submission");
  if (reconciled?.kind === "submission") {
    expect(getHistoryGroupSummary(reconciled.group.workGroups[0]).primaryLog.cancelled).toBe(true);
    expect(getHistoryGroupSummary(reconciled.group.workGroups[1]).primaryLog.cancelled).toBe(false);
  }
});

it("제출 작업 카드에서 사유 기록과 담당자, 검색된 구성품을 확인하고 원래 상세로 이동한다", () => {
  const primary = { ...a, reason_category: "조립 불량", reason_memo: "핀 접촉 확인", requester_name: "김담당(조립)" };
  const group = toHistoryLogGroups([{ ...wire, logs: [component, primary, b], workGroups: [
    { ...wire.workGroups![0], logs: [component, primary], matchedLogIds: [component.log_id] }, wire.workGroups![1],
  ] }])[0];
  if (group.type !== "submission") throw new Error("submission expected");
  const select = vi.fn();
  render(<HistorySubmissionDetail group={group} onSelectWork={select} />);
  const card = screen.getByRole("button", { name: /부모A/ });
  expect(card).toHaveTextContent("조립 불량");
  expect(card).toHaveTextContent("핀 접촉 확인");
  expect(card).toHaveTextContent("김담당");
  expect(card).toHaveTextContent("검색 일치");
  expect(card).toHaveTextContent(component.item_name);
  expect(card).toHaveAttribute("data-history-search-match", "true");
  fireEvent.click(card);
  expect(select).toHaveBeenCalledWith(group.workGroups[0]);
});

it("캐시가 있는 하위 레거시 배치는 제출 대표와 작업 분류에 반영된다", () => {
  const group = toHistoryLogGroups([{ ...wire, workGroups: [
    { type: "op_batch", key: "legacy-batch", logs: [component, a] }, wire.workGroups![1],
  ] }])[0];
  if (group.type !== "submission") throw new Error("submission expected");
  const batch = { batch_id: "legacy-batch", work_type: "process", sub_type: "produce", bundles: [{
    bundle_id: "legacy-bundle", source_kind: "bom_parent", source_item_id: a.item_id,
    title: a.item_name, lines: [],
  }] } as unknown as IoBatch;
  const cache = new Map([[batch.batch_id, batch]]);
  const summary = getHistoryGroupSummary(group, undefined, cache);
  expect(summary.primaryLog).toBe(a);
  expect(summary.title).toBe(a.item_name);
  expect(summary.pending).toBe(false);
  render(<HistorySubmissionDetail group={group} batchCache={cache} onSelectWork={vi.fn()} />);
  expect(screen.queryByText("작업 정보 확인 중")).not.toBeInTheDocument();
});

it("불량 제출과 하위 작업을 모두 불량 격리로 표시한다", () => {
  const marked = [a, b].map((log) => ({ ...log, transaction_type: "MARK_DEFECTIVE", operation_display_label: null } as TransactionLog));
  const group = toHistoryLogGroups([{ ...wire, logs: marked, workGroups: marked.map((log) => ({ type: "operation", key: log.operation_id!, logs: [log] })) }])[0];
  expect(getHistoryGroupSummary(group).label).toBe("불량 격리");
  if (group.type !== "submission") throw new Error("submission expected");
  expect(getHistoryGroupSummary(group.workGroups[0]).label).toBe("불량 격리");
});

it.each([1, null])("격리 앵커의 순변동이 0이어도 실제 이동량을 구성품 합산 없이 표시한다 (transfer_qty: %s)", (transferQty) => {
  const primary = { ...a, transaction_type: "MARK_DEFECTIVE", operation_role: "PRIMARY", operation_display_label: "불량 격리",
    quantity_change: 0, transfer_qty: transferQty, inventory_effect: [
      { scope: "location", department: "튜브", status: "PRODUCTION", delta: -1 },
      { scope: "location", department: "튜브", status: "DEFECTIVE", delta: 1 },
    ] } as TransactionLog;
  const sameUnitComponent = { ...component, quantity_change: -50, item_unit: "EA" };
  const otherUnitComponent = { ...component, log_id: "component-m", item_id: "component-m", quantity_change: -100, item_unit: "m" };
  const workLogs = [sameUnitComponent, otherUnitComponent, primary];
  const group = toHistoryLogGroups([{ ...wire, logs: [...workLogs, b], workGroups: [
    { type: "operation", key: primary.operation_id!, logs: workLogs }, wire.workGroups![1],
  ] }])[0];
  if (group.type !== "submission") throw new Error("submission expected");
  render(<HistorySubmissionDetail group={group} onSelectWork={vi.fn()} />);
  const card = screen.getByRole("button", { name: /부모A/ });
  expect(card).toHaveTextContent("1 EA");
  expect(card).not.toHaveTextContent("0 EA");
  expect(card).not.toHaveTextContent("2 EA");
  expect(screen.getByText("2 m")).toBeInTheDocument();
});

it("창고 총량과 박스 효과가 함께 있어도 격리 이동량을 두 번 세지 않는다", () => {
  const primary = { ...a, transaction_type: "MARK_DEFECTIVE", operation_role: "PRIMARY", operation_display_label: "불량 격리",
    quantity_change: 0, transfer_qty: null, inventory_effect: [
      { scope: "warehouse", delta: -3 },
      { scope: "warehouse_box", box_id: "box-a", delta: -3 },
      { scope: "location", department: "튜브", status: "DEFECTIVE", delta: 3 },
    ] } as TransactionLog;
  const group = toHistoryLogGroups([{ ...wire, logs: [primary, b], workGroups: [
    { type: "operation", key: primary.operation_id!, logs: [primary] }, wire.workGroups![1],
  ] }])[0];
  if (group.type !== "submission") throw new Error("submission expected");
  render(<HistorySubmissionDetail group={group} onSelectWork={vi.fn()} />);
  expect(screen.getByRole("button", { name: /부모A/ })).toHaveTextContent("3 EA");
});
