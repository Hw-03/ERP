import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Item, TransactionLog } from "@/lib/api";
import { productionApi, type TransactionDisplayGroupPage } from "@/lib/api/production";
import { queryKeys } from "@/lib/queries/keys";
import { InventoryRecentHistoryPanel } from "../InventoryRecentHistoryPanel";

const clients: QueryClient[] = [];
const getPage = vi.spyOn(productionApi, "getTransactionDisplayGroups");
const realtimeState = vi.hoisted(() => ({ revision: null as number | null }));
vi.mock("@/lib/queries/realtime", () => ({ useRealtimeRevision: () => realtimeState.revision }));

function makeItem(itemId = "item-1"): Item {
  return { item_id: itemId, item_name: "테스트 품목", mes_code: "4-VA-0014", unit: "EA" } as Item;
}

function makeLog(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    log_id: "log-1", item_id: "item-1", mes_code: "4-VA-0014", item_name: "테스트 품목", item_process_type_code: null,
    item_unit: "EA", transaction_type: "RECEIVE", quantity_change: 12, quantity_before: 15, quantity_after: 27,
    warehouse_qty_before: 15, warehouse_qty_after: 27, department_qty_before: 4, department_qty_after: 4,
    transfer_qty: null, reference_no: null, produced_by: "김작업", requester_name: null, approver_name: null,
    department: "조립", notes: null, operation_batch_id: null, operation_id: "operation-1", created_at: "2026-08-14T01:30:00Z",
    cancelled: false, cancel_reason: null, cancelled_by: null, cancelled_at: null, ...overrides,
  };
}

function makePage(logs: TransactionLog[], nextCursor: string | null = null): TransactionDisplayGroupPage {
  return { groups: logs.map((log) => ({ type: "solo", key: log.log_id, logs: [log] })), nextCursor, hasMore: nextCursor !== null };
}

function renderPanel(item = makeItem(), mobilePresentation = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, refetchOnWindowFocus: false } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><InventoryRecentHistoryPanel item={item} mobilePresentation={mobilePresentation} /></QueryClientProvider>);
  return {
    ...view, client,
    changeItem: (nextItem: Item): void => view.rerender(<QueryClientProvider client={client}><InventoryRecentHistoryPanel item={nextItem} mobilePresentation={mobilePresentation} /></QueryClientProvider>),
  };
}

beforeEach(() => { realtimeState.revision = null; getPage.mockReset().mockResolvedValue(makePage([])); });
afterEach(() => { clients.splice(0).forEach((client) => client.clear()); });

describe("InventoryRecentHistoryPanel", () => {
  it("첫 조회 중 실시간 변경이 발생하면 변경 전 응답을 최신 내역으로 확정하지 않는다", async () => {
    let finish!: (page: TransactionDisplayGroupPage) => void;
    getPage.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const view = renderPanel();
    await waitFor(() => expect(getPage).toHaveBeenCalledTimes(1));
    getPage.mockResolvedValue(makePage([makeLog({ produced_by: "갱신된 작업" })]));
    const invalidation = view.client.invalidateQueries({ queryKey: queryKeys.transactions.all });
    realtimeState.revision = 1;
    view.changeItem(makeItem());
    await act(async () => { finish(makePage([makeLog({ produced_by: "변경 전 기록" })])); await invalidation; });
    expect(await screen.findByText("조립 · 갱신된 작업")).toBeVisible();
    expect(screen.queryByText("조립 · 변경 전 기록")).not.toBeInTheDocument();
  });

  it("승인 작업의 담당자는 기존처럼 실행자를 표시한다", async () => {
    getPage.mockResolvedValue(makePage([makeLog({ executor_name: "실행 담당자", requester_name: "요청 담당자", produced_by: "기록 담당자" })]));
    renderPanel();
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(screen.getByText("조립 · 실행 담당자")).toBeVisible();
  });

  it("실시간 변경과 최초 응답 완료가 같은 화면 갱신에 겹쳐도 변경 후 이력을 다시 조회한다", async () => {
    let finish!: (page: TransactionDisplayGroupPage) => void;
    getPage.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const view = renderPanel();
    await waitFor(() => expect(getPage).toHaveBeenCalledTimes(1));
    getPage.mockResolvedValue(makePage([makeLog({ produced_by: "갱신된 작업" })]));
    await act(async () => {
      realtimeState.revision = 1;
      view.changeItem(makeItem());
      const invalidation = view.client.invalidateQueries({ queryKey: queryKeys.transactions.all });
      finish(makePage([makeLog({ produced_by: "변경 전 기록" })]));
      await invalidation;
    });
    expect(await screen.findByText("조립 · 갱신된 작업")).toBeVisible();
    expect(screen.queryByText("조립 · 변경 전 기록")).not.toBeInTheDocument();
  });

  it.each([false, true])("작업 11건과 기존 5건을 10건부터 16건까지 중복 없이 표시한다 mobile=%s", async (mobile) => {
    const logs = Array.from({ length: 16 }, (_, index) => makeLog({
      log_id: `log-${index}`, operation_id: index < 11 ? `operation-${index}` : null,
      produced_by: `담당${index}`, created_at: new Date(Date.UTC(2026, 7, 14, 1, 30 - index)).toISOString(),
    }));
    getPage.mockImplementation(async (params) => params?.cursor ? makePage(logs.slice(10)) : makePage(logs.slice(0, 10), "next-six"));
    renderPanel(makeItem(), mobile);
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(10));
    expect(screen.queryByText(/^(현재|전체) \d+건 표시$/)).not.toBeInTheDocument();
    expect(getPage.mock.calls[0][0]).toEqual({ itemId: "item-1", limit: 10, cursor: null });
    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(16));
    expect(screen.queryByRole("button", { name: "더 보기" })).not.toBeInTheDocument();
    logs.forEach((log) => expect(screen.getByText(`조립 · ${log.produced_by}`)).toBeVisible());
    expect(getPage.mock.calls[1][0]?.cursor).toBe("next-six");
  });

  it.each([null, "operation"])("기존 기록만 또는 연결 기록만 있어도 세 페이지 끝까지 조회한다 (%s)", async (operationId) => {
    getPage.mockImplementation(async (params) => {
      const start = Number(params?.cursor ?? 0);
      return makePage(Array.from({ length: start === 20 ? 1 : 10 }, (_, index) => makeLog({ log_id: `log-${start + index}`, operation_id: operationId })), start === 20 ? null : String(start + 10));
    });
    renderPanel();
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(10));
    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(20));
    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(21));
  });

  it("같은 작업의 모든 행을 보존하고 중복을 제거해 요청 시각·생성 시각·ID 순으로 표시한다", async () => {
    const old = makeLog({ log_id: "old", produced_by: "오래된 기록", operation_id: null, created_at: "2026-08-10T01:00:00Z" });
    const newer = makeLog({ log_id: "newer", produced_by: "새 기록", requested_at: "2026-08-11T01:00:00Z", created_at: "2026-08-14T01:00:00Z" });
    const tieA = makeLog({ log_id: "tie-a", produced_by: "동시 A", created_at: "2026-08-14T01:00:00" });
    const tieB = makeLog({ log_id: "tie-b", produced_by: "동시 B", created_at: "2026-08-14T10:00:00+09:00" });
    const tieLater = makeLog({ log_id: "tie-c", produced_by: "생성 나중", requested_at: tieA.created_at, created_at: "2026-08-15T01:00:00Z" });
    getPage.mockResolvedValue({ groups: [{ type: "submission", key: "group", logs: [old, newer, tieA, tieB, tieLater, old], workGroups: [{ type: "solo", key: "old", logs: [old] }] }], nextCursor: null, hasMore: false });
    const { container } = renderPanel();
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(5));
    expect(screen.getAllByRole("listitem").map((row) => row.querySelector(".inventory-recent-meta")?.textContent)).toEqual(["조립 · 생성 나중", "조립 · 동시 B", "조립 · 동시 A", "조립 · 새 기록", "조립 · 오래된 기록"]);
    expect(container.querySelector(".inventory-recent-divider")).toBeNull();
  });

  it("추가 조회 실패 시 기존 목록을 유지하고 동일 커서로 재시도한다", async () => {
    getPage.mockResolvedValueOnce(makePage([makeLog()], "next"))
      .mockRejectedValueOnce(new Error("통신 실패"))
      .mockResolvedValueOnce(makePage([makeLog({ log_id: "log-2" })]));
    renderPanel();
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("다음 내역을 불러오지 못했습니다");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    expect(getPage.mock.calls.slice(1).map(([params]) => params?.cursor)).toEqual(["next", "next"]);
  });

  it("추가 조회 중 연속 클릭으로 같은 페이지를 중복 요청하지 않는다", async () => {
    let finish!: (page: TransactionDisplayGroupPage) => void;
    getPage.mockResolvedValueOnce(makePage([makeLog()], "next"))
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    renderPanel();
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    const button = screen.getByRole("button", { name: "더 보기" });
    fireEvent.click(button); fireEvent.click(button);
    expect(await screen.findByRole("button", { name: "불러오는 중..." })).toBeDisabled();
    expect(getPage).toHaveBeenCalledTimes(2);
    await act(async () => finish(makePage([makeLog({ log_id: "log-2" })])));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
  });

  it("조회 중 품목을 변경하면 첫 페이지부터 조회하고 이전 품목의 늦은 응답을 무시한다", async () => {
    let finish!: (page: TransactionDisplayGroupPage) => void;
    getPage.mockResolvedValueOnce(makePage([makeLog({ produced_by: "이전 품목" })], "old-next"))
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce(makePage([makeLog({ log_id: "new", item_id: "item-2", produced_by: "새 품목" })]));
    const view = renderPanel();
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    view.changeItem(makeItem("item-2"));
    expect(await screen.findByText("조립 · 새 품목")).toBeVisible();
    await act(async () => finish(makePage([makeLog({ log_id: "late", produced_by: "늦은 응답" })])));
    expect(screen.queryByText("조립 · 이전 품목")).not.toBeInTheDocument();
    expect(screen.queryByText("조립 · 늦은 응답")).not.toBeInTheDocument();
    expect(getPage.mock.calls[2][0]).toEqual({ itemId: "item-2", limit: 10, cursor: null });
  });

  it("신규 작업 무효화 후 조회한 페이지를 새 커서로 갱신하고 실패 시 기존 이력을 유지한다", async () => {
    getPage.mockResolvedValueOnce(makePage([makeLog()], "old-next"))
      .mockResolvedValueOnce(makePage([makeLog({ log_id: "log-2" })]));
    const { client } = renderPanel();
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    getPage.mockResolvedValueOnce(makePage([makeLog({ log_id: "new", produced_by: "새 작업" }), makeLog()], "new-next"))
      .mockResolvedValueOnce(makePage([makeLog({ log_id: "log-2" })]));
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.transactions.all }); });
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(3));
    expect(getPage.mock.calls.at(-1)?.[0]?.cursor).toBe("new-next");
    expect(screen.getByText("조립 · 새 작업")).toBeVisible();
    getPage.mockRejectedValueOnce(new Error("갱신 실패"));
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.transactions.all }); });
    expect(await screen.findByRole("alert")).toHaveTextContent("내역을 새로고침하지 못했습니다");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    getPage.mockResolvedValueOnce(makePage([makeLog({ log_id: "new" }), makeLog()], "retry-next"))
      .mockResolvedValueOnce(makePage([makeLog({ log_id: "log-2" })]));
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(getPage.mock.calls.at(-1)?.[0]?.cursor).toBe("retry-next");
  });

  it("취소된 원거래와 취소 기록을 각각 유지하고 배지와 재고 수치를 보존한다", async () => {
    getPage.mockResolvedValue(makePage([
      makeLog({ cancelled: true, operation_effective_status: "cancelled" }),
      makeLog({ log_id: "cancel", transaction_type: "TRANSFER_TO_WH", operation_kind: "CANCELLATION", operation_effective_status: "cancellation" }),
    ]));
    renderPanel();
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    expect(screen.getByText("취소된 작업")).toBeVisible();
    expect(screen.getByText("창고 입출고 취소")).toBeVisible();
    expect(screen.getAllByLabelText("창고 15 +12→27")).toHaveLength(2);
  });

  it("이력 표와 같은 작업 분류·분해 라벨·계산 불가·변동 없음 표시를 유지한다", async () => {
    getPage.mockResolvedValue(makePage([
      makeLog({ log_id: "transfer", transaction_type: "TRANSFER_TO_PROD" }),
      makeLog({ log_id: "defect", transaction_type: "MARK_DEFECTIVE" }),
      makeLog({ log_id: "shipping", transaction_type: "SHIP" }),
      makeLog({ log_id: "disassemble", transaction_type: "PRODUCE", history_batch: { work_type: "process", sub_type: "disassemble", to_department: "조립" } }),
      makeLog({ log_id: "unknown", transaction_type: "UNMAPPED" as TransactionLog["transaction_type"] }),
      makeLog({ log_id: "unavailable", request_order_stock: { status: "unavailable", reason: "ambiguous_order", warehouse_qty_before: null, warehouse_qty_after: null, department_qty_before: null, department_qty_after: null } }),
      makeLog({ log_id: "unchanged", warehouse_qty_after: 15, department_qty_after: 4 }),
    ]));
    renderPanel(makeItem(), true);
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(7));
    ["창고 입출고", "불량", "출하", "분해 출고", "기타 작업", "변동 없음"].forEach((label) => expect(screen.getByText(label)).toBeVisible());
    expect(screen.getByText("계산 불가 · 사유 보기")).toBeVisible();
    expect(screen.queryByText("UNMAPPED")).not.toBeInTheDocument();
  });

  it("최초 조회 실패는 재시도하고 빈 목록은 별도 빈 상태를 표시한다", async () => {
    getPage.mockRejectedValueOnce(new Error("통신 실패")).mockResolvedValueOnce(makePage([]));
    renderPanel();
    expect(await screen.findByRole("alert")).toHaveTextContent("최근 입출고 내역을 불러오지 못했습니다");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("최근 입출고 내역이 없습니다.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "더 보기" })).not.toBeInTheDocument();
  });
});
