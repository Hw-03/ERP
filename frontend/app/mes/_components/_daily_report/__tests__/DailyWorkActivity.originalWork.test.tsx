import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DailyWorkActivity } from "../DailyWorkActivity";
import type { TransactionLog } from "@/lib/api";

const productionApi = vi.hoisted(() => ({ getTransactions: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: {} }));
vi.mock("@/lib/api/production", () => ({ productionApi }));
vi.mock("../../_history_sections/HistoryDetailPanel", () => ({ HistoryDetailPanel: ({ selected, allowCancellation }: { selected: TransactionLog; allowCancellation: boolean }) => <article aria-label="기존 원작업 상세">{selected.item_name} · {selected.notes} · {allowCancellation ? "취소 가능" : "읽기 전용"}</article> }));

const original = { log_id: "original-log", item_id: "item-1", item_name: "원래 입고품", notes: "원래 입고 근거", transaction_type: "RECEIVE", quantity_change: 2, created_at: "2026-08-01T01:00:00Z" } as TransactionLog;
const reversal = { ...original, log_id: "reverse-log", quantity_change: -2, operation_kind: "CANCELLATION", operation_effective_status: "cancellation", reverses_log_id: original.log_id } as TransactionLog;
function open(log = reversal) {
  const view = render(<DailyWorkActivity activity={{ work_date: "2026-08-03", employee_id: "employee-1", cancelled_count: 1, summary: [], details: [{ type: "solo", key: "reverse", logs: [log] }] }} />);
  fireEvent.click(screen.getByRole("button", { name: "창고 거래 상세 펼치기" }));
  return view;
}

describe("8.20-08 일보 취소에서 원래 작업 보기", () => {
  beforeEach(() => { vi.mocked(productionApi.getTransactions).mockReset(); });
  it("한 번의 정확조회로 연결된 원행을 기존 상세로 연다", async () => {
    vi.mocked(productionApi.getTransactions).mockResolvedValueOnce([original]);
    open(); fireEvent.click(screen.getByRole("button", { name: "원래 작업 보기" }));
    await expect(screen.findByRole("article", { name: "기존 원작업 상세" })).resolves.toHaveTextContent("원래 입고 근거 · 읽기 전용");
    expect(productionApi.getTransactions).toHaveBeenCalledTimes(1);
    expect(productionApi.getTransactions).toHaveBeenCalledWith({ logId: "original-log", includeArchived: true }, { signal: expect.any(AbortSignal) });
    expect(screen.queryByText("original-log")).not.toBeInTheDocument();
  });
  it("원행이 없으면 임의 거래를 보여주지 않는다", async () => {
    vi.mocked(productionApi.getTransactions).mockResolvedValue([{ ...original, log_id: "unrelated" }]);
    open(); fireEvent.click(screen.getByRole("button", { name: "원래 작업 보기" }));
    expect(await screen.findByText("원래 작업을 찾을 수 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "기존 원작업 상세" })).not.toBeInTheDocument();
  });
  it("조회 실패는 명확하게 표시하고 같은 원작업을 재시도한다", async () => {
    vi.mocked(productionApi.getTransactions).mockRejectedValueOnce(new Error("연결 끊김")).mockResolvedValueOnce([original]);
    open(); fireEvent.click(screen.getByRole("button", { name: "원래 작업 보기" }));
    expect(await screen.findByText("원래 작업을 불러오지 못했습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "원래 작업 다시 시도" }));
    expect(await screen.findByRole("article", { name: "기존 원작업 상세" })).toHaveTextContent("원래 입고 근거");
    expect(productionApi.getTransactions).toHaveBeenCalledTimes(2);
  });
  it("조회 중 닫으면 응답이 늦게 와도 원작업을 다시 열지 않는다", async () => {
    let resolve!: (logs: TransactionLog[]) => void;
    vi.mocked(productionApi.getTransactions).mockImplementation(() => new Promise((done) => { resolve = done; }));
    open(); fireEvent.click(screen.getByRole("button", { name: "원래 작업 보기" }));
    await waitFor(() => expect(productionApi.getTransactions).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(productionApi.getTransactions).mock.calls[0][1]?.signal;
    fireEvent.click(screen.getByRole("button", { name: "원래 작업 접기" }));
    expect(signal?.aborted).toBe(true); resolve([original]);
    await waitFor(() => expect(screen.queryByRole("article", { name: "기존 원작업 상세" })).not.toBeInTheDocument());
  });
  it("원행 연결이 없는 기존 취소에서는 없는 연결을 만들지 않는다", () => {
    open({ ...reversal, reverses_log_id: null });
    expect(screen.queryByRole("button", { name: "원래 작업 보기" })).not.toBeInTheDocument();
    expect(productionApi.getTransactions).not.toHaveBeenCalled();
  });
  it("다른 품목으로 바뀌면 늦은 이전 원작업 응답을 표시하지 않는다", async () => {
    let resolve!: (logs: TransactionLog[]) => void;
    const nextOriginal = { ...original, log_id: "next-original", item_id: "item-2", notes: "새 품목 원래 근거" };
    vi.mocked(productionApi.getTransactions).mockImplementationOnce(() => new Promise((done) => { resolve = done; })).mockResolvedValueOnce([nextOriginal]);
    const view = open(); fireEvent.click(screen.getByRole("button", { name: "원래 작업 보기" }));
    const previousSignal = productionApi.getTransactions.mock.calls[0][1]?.signal;
    view.rerender(<DailyWorkActivity activity={{ work_date: "2026-08-03", employee_id: "employee-1", cancelled_count: 1, summary: [], details: [{ type: "solo", key: "reverse", logs: [{ ...reversal, log_id: "next-reversal", item_id: "item-2", reverses_log_id: nextOriginal.log_id }] }] }} />);
    expect(await screen.findByRole("article", { name: "기존 원작업 상세" })).toHaveTextContent("새 품목 원래 근거");
    expect(previousSignal.aborted).toBe(true);
    await act(async () => { resolve([original]); });
    expect(screen.getByRole("article", { name: "기존 원작업 상세" })).toHaveTextContent("새 품목 원래 근거");
    expect(screen.getByRole("article", { name: "기존 원작업 상세" })).not.toHaveTextContent("원래 입고 근거");
  });
});
