import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { ioApi } from "@/lib/api/io";
import type { IoBatch } from "@/lib/api/types/io";
import { describe, expect, it, vi } from "vitest";
import type { TransactionLog } from "@/lib/api";
import { MobileHistoryList as ActualMobileHistoryList } from "../MobileHistoryList";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { buildGroups, type LogGroup } from "../../../_history_sections/historyTableHelpers";
import { getSingleLogMovement } from "../../../_history_sections/historyBatchInterpreter";

function MobileHistoryList({ filteredLogs, ...props }: Omit<Parameters<typeof ActualMobileHistoryList>[0], "displayGroups" | "batchCache" | "setBatchCache"> & { filteredLogs: TransactionLog[] }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  const [cache, setCache] = useState(new Map<string, IoBatch>());
  return <QueryClientProvider client={client}>
    <ActualMobileHistoryList {...props} displayGroups={buildGroups(filteredLogs)} batchCache={cache} setBatchCache={setCache} />
  </QueryClientProvider>;
}

function log(id: string, phase: string): TransactionLog {
  return {
    log_id: id,
    item_id: `item-${id}`,
    item_name: `Shipping item ${id}`,
    mes_code: `SHIP-${id}`,
    transaction_type: "SHIP",
    quantity_change: -1,
    quantity_before: 2,
    quantity_after: 1,
    warehouse_qty_before: 2,
    warehouse_qty_after: 1,
    production_qty_before: 0,
    production_qty_after: 0,
    defective_qty_before: 0,
    defective_qty_after: 0,
    reference_no: "SHIP-REQ-1",
    shipping_phase: phase,
    produced_by: "operator",
    notes: null,
    created_at: "2026-07-06T00:00:00Z",
    requested_at: "2026-07-06T00:00:00Z",
    cancelled: false,
    cancel_reason: null,
    cancelled_at: null,
    operation_batch_id: null,
    inventory_effect: [{ scope: "warehouse", delta: -1 }],
  } as TransactionLog;
}

describe("MobileHistoryList", () => {
  it("제출 부모의 대표 품목 수만 품목 단위로 표시한다", () => {
    const first = { ...log("one", ""), transaction_type: "MARK_DEFECTIVE" } as TransactionLog;
    const second = { ...log("two", ""), transaction_type: "MARK_DEFECTIVE" } as TransactionLog;
    const group: LogGroup = { type: "submission", key: "submission:items", logs: [first, second],
      workGroups: [{ type: "solo", log: first }, { type: "solo", log: second }] };
    render(<QueryClientProvider client={new QueryClient()}><ActualMobileHistoryList loading={false} error={null}
      displayGroups={[group]} batchCache={new Map()} setBatchCache={vi.fn()} selectedKey={null}
      onSelectLog={vi.fn()} onSelectBatch={vi.fn()} onRetry={vi.fn()}
      canLoadMore={false} loadingMore={false} onLoadMore={vi.fn()} /></QueryClientProvider>);
    expect(screen.getByRole("button")).toHaveTextContent(`${first.item_name} 외 1품목`);
  });
  it("제출 안의 레거시 배치도 조회하여 작업 분류를 확정한다", async () => {
    const getBatch = vi.spyOn(ioApi, "getBatch").mockResolvedValue({ batch_id: "nested-batch",
      work_type: "process", sub_type: "disassemble", bundles: [] } as unknown as IoBatch);
    const entry = { ...log("nested", ""), transaction_type: "BACKFLUSH", operation_batch_id: "nested-batch" } as TransactionLog;
    const groups: LogGroup[] = [{ type: "submission", key: "submission:nested", logs: [entry],
      workGroups: [{ type: "op_batch", batchId: "nested-batch", refNo: null, logs: [entry] }] }];
    function SubmissionList() {
      const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
      const [cache, setCache] = useState(new Map<string, IoBatch>());
      return <QueryClientProvider client={client}><ActualMobileHistoryList loading={false} error={null}
        displayGroups={groups} batchCache={cache} setBatchCache={setCache} selectedKey={null}
        onSelectLog={vi.fn()} onSelectBatch={vi.fn()} onRetry={vi.fn()}
        canLoadMore={false} loadingMore={false} onLoadMore={vi.fn()} /></QueryClientProvider>;
    }
    render(<SubmissionList />);
    await waitFor(() => expect(getBatch).toHaveBeenCalledWith("nested-batch", expect.objectContaining({ signal: expect.any(AbortSignal) })));
    await waitFor(() => expect(screen.getByText("분해 출고")).toBeInTheDocument());
    expect(screen.queryByText("작업 정보 확인 중")).not.toBeInTheDocument();
    getBatch.mockRestore();
  });
  it("회수된 관전류 BD로 검색한 불량 재작업도 부모 품목과 작업 분류로 표시한다", () => {
    const onSelectLog = vi.fn();
    const onSelectBatch = vi.fn();
    const parent = { ...log("parent", ""), transaction_type: "DISASSEMBLE", item_name: "ADX6000FB BODY RIGHT ASS'Y",
      operation_id: "rework", operation_role: "REWORK_PARENT_DEFECTIVE", reference_no: "defect-disassemble:record" } as TransactionLog;
    const child = { ...parent, log_id: "child", item_id: "child", item_name: "ADX6000 관전류 BD",
      transaction_type: "RECEIVE", operation_role: "REWORK_CHILD_NORMAL" } as TransactionLog;
    render(<MobileHistoryList loading={false} error={null} filteredLogs={[child, parent]}
      selectedKey={null} onSelectLog={onSelectLog} onSelectBatch={onSelectBatch} onRetry={vi.fn()}
      canLoadMore={false} loadingMore={false} onLoadMore={vi.fn()} />);
    expect(screen.getByText("재작업")).toBeInTheDocument();
    expect(screen.queryByText("원자재 입고")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveTextContent("ADX6000FB BODY RIGHT ASS'Y 외 1건");
    fireEvent.click(screen.getByRole("button"));
    expect(onSelectBatch).toHaveBeenCalledWith("rework", [parent, child]);
    expect(onSelectLog).not.toHaveBeenCalled();
  });

  it("서버가 분리한 묶음 경계를 모바일에서 다시 합치지 않는다", () => {
    const first = { ...log("first", ""), operation_id: "same-operation" };
    const second = { ...log("second", ""), operation_id: "same-operation" };
    render(<QueryClientProvider client={new QueryClient()}>
      <ActualMobileHistoryList loading={false} error={null}
        displayGroups={[{ type: "solo", log: first }, { type: "solo", log: second }]}
        batchCache={new Map()} setBatchCache={vi.fn()} selectedKey={null}
        onSelectLog={vi.fn()} onSelectBatch={vi.fn()} onRetry={vi.fn()}
        canLoadMore={false} loadingMore={false} onLoadMore={vi.fn()} />
    </QueryClientProvider>);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("배치 조회 실패를 재시도하고 정확한 작업 분류로 복구한다", async () => {
    const getBatch = vi.spyOn(ioApi, "getBatch").mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ batch_id: "batch", work_type: "defect", sub_type: "add", bundles: [] } as unknown as IoBatch);
    const entry = { ...log("batch-entry", ""), transaction_type: "MARK_DEFECTIVE", operation_batch_id: "batch" } as TransactionLog;
    render(<MobileHistoryList loading={false} error={null} filteredLogs={[entry]}
      selectedKey={null} onSelectLog={vi.fn()} onSelectBatch={vi.fn()} onRetry={vi.fn()}
      canLoadMore={false} loadingMore={false} onLoadMore={vi.fn()} />);
    expect(screen.getByText("작업 정보 확인 중")).toBeInTheDocument();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(screen.getByText("불량 격리")).toBeInTheDocument());
    expect(getBatch).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    getBatch.mockRestore();
  });

  it("취소된 원 거래에는 취소 표시와 무효화 스타일을 적용하고 상세 진입을 유지한다", () => {
    const entry = { ...log("cancelled", ""), transaction_type: "RECEIVE", reference_no: null, cancelled: true } as TransactionLog;
    const onSelectLog = vi.fn();
    render(<MobileHistoryList loading={false} error={null} filteredLogs={[entry]}
      selectedKey={null} onSelectLog={onSelectLog} onSelectBatch={vi.fn()} onRetry={vi.fn()}
      canLoadMore={false} loadingMore={false} onLoadMore={vi.fn()} />);
    const row = screen.getByRole("button");
    expect(row).toHaveAttribute("data-history-cancelled", "true");
    expect(screen.getByText("취소됨")).toBeInTheDocument();
    expect(screen.getByText(entry.item_name)).toHaveClass(/affected/);
    fireEvent.click(row);
    expect(onSelectLog).toHaveBeenCalledWith(entry);
  });

  it("취소를 수행한 기록은 원 거래와 구별되는 취소 작업으로 표시한다", () => {
    const entry = { ...log("reversal", ""), reference_no: null, transaction_type: "RECEIVE", operation_kind: "CANCELLATION" } as TransactionLog;
    render(<MobileHistoryList loading={false} error={null} filteredLogs={[entry]}
      selectedKey={null} onSelectLog={vi.fn()} onSelectBatch={vi.fn()} onRetry={vi.fn()}
      canLoadMore={false} loadingMore={false} onLoadMore={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveAttribute("data-history-cancellation", "true");
    expect(screen.getByText("원자재 입고 취소")).toBeInTheDocument();
    expect(screen.queryByText("취소됨")).not.toBeInTheDocument();
  });
  it("캐시 재검증 실패는 기존 행을 유지하며 실패와 재시도를 표시한다", () => {
    const retry = vi.fn();
    const entry = { ...log("cached", ""), reference_no: null };
    render(<MobileHistoryList loading={false} error="network failure" filteredLogs={[entry]}
      selectedKey={null} onSelectLog={vi.fn()} onSelectBatch={vi.fn()} onRetry={retry}
      canLoadMore={false} loadingMore={false} onLoadMore={vi.fn()} />);
    expect(screen.getByText(entry.item_name)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("기존 내용을 표시합니다");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it("단일 행은 증감 요약 없이 표시하고 전체 로그의 상세 이동을 유지한다", () => {
    const entry = { ...log("solo", ""), reference_no: null };
    const onSelectLog = vi.fn();
    render(<MobileHistoryList loading={false} error={null} filteredLogs={[entry]}
      selectedKey="log:solo" onSelectLog={onSelectLog} onSelectBatch={vi.fn()} onRetry={vi.fn()}
      canLoadMore={false} loadingMore={false} onLoadMore={vi.fn()} />);

    const row = screen.getByRole("button");
    expect(screen.queryByText(getSingleLogMovement(entry).label)).not.toBeInTheDocument();
    expect(row).toHaveTextContent(entry.item_name);
    expect(row).toHaveTextContent("operator");
    const actor = screen.getByText("operator");
    expect(actor.parentElement).toHaveClass("ml-auto", "gap-2");
    expect(actor.nextElementSibling).toHaveClass("shrink-0");
    expect(row).toHaveClass("h-[98px]");
    expect(screen.getByText(entry.item_name)).toHaveClass("line-clamp-2");
    expect(row).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(row);
    expect(onSelectLog).toHaveBeenCalledWith(entry);
  });

  it.each([false, true])("원자재 입출고의 반대 방향 화살표를 표시한다 (묶음: %s)", (grouped) => {
    const entries: TransactionLog[] = ["RECEIVE", "MATERIAL_OUT"].flatMap((type) =>
      Array.from({ length: grouped ? 2 : 1 }, (_, index) => ({
        ...log(`${type}-${index}`, ""),
        transaction_type: type as TransactionLog["transaction_type"],
        reference_no: null,
        operation_id: grouped ? `operation-${type}` : null,
      })),
    );
    render(<MobileHistoryList loading={false} error={null} filteredLogs={entries}
      selectedKey={null} onSelectLog={vi.fn()} onSelectBatch={vi.fn()} onRetry={vi.fn()}
      canLoadMore={false} loadingMore={false} onLoadMore={vi.fn()} />);
    expect(screen.getByText("원자재 입고").parentElement?.querySelector(".lucide-arrow-down-to-line")).toBeInTheDocument();
    expect(screen.getByText("원자재 출고").parentElement?.querySelector(".lucide-arrow-up-from-line")).toBeInTheDocument();
  });

  it("keeps a successful empty result visible after refresh failure", () => {
    const retry = vi.fn();
    render(<MobileHistoryList loading={false} error={null} refreshError="조회 실패"
      filteredLogs={[]} selectedKey={null} onSelectLog={vi.fn()} onSelectBatch={vi.fn()}
      onRetry={retry} canLoadMore={false} loadingMore={false} onLoadMore={vi.fn()} />);
    expect(screen.getByText("표시할 데이터가 없습니다")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("기존 내용을 표시합니다");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("opens a complete new-ledger operation group with its operation id", () => {
    const onSelectBatch = vi.fn();
    const onSelectLog = vi.fn();
    const first = { ...log("operation-1", ""), operation_id: "operation-id" };
    const second = { ...log("operation-2", ""), operation_id: "operation-id" };

    render(
      <MobileHistoryList
        loading={false}
        error={null}
        filteredLogs={[first, second]}
        selectedKey={null}
        onSelectLog={onSelectLog}
        onSelectBatch={onSelectBatch}
        onRetry={vi.fn()}
        canLoadMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(onSelectBatch).toHaveBeenCalledWith("operation-id", [first, second]);
    expect(onSelectLog).not.toHaveBeenCalled();
    expect(screen.getByText("operator").parentElement?.previousElementSibling?.firstElementChild).toHaveClass("h-6", "w-32");
    expect(screen.queryByText(/묶음 2건/)).not.toBeInTheDocument();
  });

  it("opens both the original defect mark and its followup in a lifecycle group", () => {
    const onSelectLog = vi.fn();
    const onSelectBatch = vi.fn();
    const marked = {
      ...log("marked", ""),
      item_id: "same-item",
      transaction_type: "MARK_DEFECTIVE",
      quantity_change: -1,
      reference_no: null,
      shipping_phase: null,
      department: "\uC870\uB9BD",
      reason_category: "\uD30C\uC190",
      produced_by: "operator",
      created_at: "2026-07-10T08:00:00Z",
    } as TransactionLog;
    const processed = {
      ...marked,
      log_id: "processed",
      transaction_type: "DEFECT_SCRAP",
      created_at: "2026-07-10T08:00:30Z",
    } as TransactionLog;

    render(
      <MobileHistoryList
        loading={false}
        error={null}
        filteredLogs={[marked, processed]}
        selectedKey={null}
        onSelectLog={onSelectLog}
        onSelectBatch={onSelectBatch}
        onRetry={vi.fn()}
        canLoadMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(onSelectLog).not.toHaveBeenCalled();
    expect(onSelectBatch).toHaveBeenCalledWith(expect.any(String), [marked, processed]);
    expect(screen.queryByText(getSingleLogMovement(processed).label)).not.toBeInTheDocument();
  });

  it("uses the phase-aware batch key when duplicate shipping reference numbers exist", () => {
    const onSelectBatch = vi.fn();

    render(
      <MobileHistoryList
        loading={false}
        error={null}
        filteredLogs={[
          log("prepare-1", "PREPARE"),
          log("prepare-2", "PREPARE"),
          log("pickup-1", "PICKUP"),
          log("pickup-2", "PICKUP"),
        ]}
        selectedKey={null}
        onSelectLog={vi.fn()}
        onSelectBatch={onSelectBatch}
        onRetry={vi.fn()}
        canLoadMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
      />,
    );

    const batchCards = screen.getAllByRole("button");
    expect(batchCards).toHaveLength(2);

    fireEvent.click(batchCards[0]);
    fireEvent.click(batchCards[1]);

    expect(onSelectBatch.mock.calls.map((call) => call[0])).toEqual([
      "SHIP-REQ-1::PREPARE",
      "SHIP-REQ-1::PICKUP",
    ]);
  });

  it("shows a dedicated failure card and retries instead of rendering the empty state", () => {
    const onRetry = vi.fn();

    render(
      <MobileHistoryList
        loading={false}
        error="transactions unavailable"
        filteredLogs={[]}
        selectedKey={null}
        onSelectLog={vi.fn()}
        onSelectBatch={vi.fn()}
        onRetry={onRetry}
        canLoadMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("transactions unavailable");
    expect(screen.queryByText("표시할 데이터가 없습니다.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("keeps existing rows visible when an initial-page error coexists with cached data", () => {
    render(
      <MobileHistoryList
        loading={false}
        error="background refresh failed"
        filteredLogs={[log("cached", "PREPARE")]}
        selectedKey={null}
        onSelectLog={vi.fn()}
        onSelectBatch={vi.fn()}
        onRetry={vi.fn()}
        canLoadMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("기존 내용을 표시합니다");
    expect(screen.getByText("Shipping item cached")).toBeInTheDocument();
  });

  it("keeps existing cards visible and retries from a non-blocking refresh failure", () => {
    const retryRefresh = vi.fn();

    render(
      <MobileHistoryList
        loading={false}
        error={null}
        refreshError="동기화 실패"
        filteredLogs={[log("cached", "PREPARE")]}
        selectedKey={null}
        onSelectLog={vi.fn()}
        onSelectBatch={vi.fn()}
        onRetry={vi.fn()}
        onRetryRefresh={retryRefresh}
        canLoadMore={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
      />,
    );

    expect(screen.getByText("Shipping item cached")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("기존 내용을 표시합니다");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retryRefresh).toHaveBeenCalledOnce();
  });
});
