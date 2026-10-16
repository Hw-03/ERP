import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryOperation, Item, TransactionLog } from "@/lib/api";
import { productionApi, type TransactionDisplayGroupPage } from "@/lib/api/production";
import { queryKeys } from "@/lib/queries/keys";
import { InventoryRecentHistoryPanel } from "../InventoryRecentHistoryPanel";

const clients: QueryClient[] = [];
const getPage = vi.spyOn(productionApi, "getTransactionDisplayGroups");
const getDetail = vi.spyOn(productionApi, "getInventoryOperation");
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

beforeEach(() => { realtimeState.revision = null; getPage.mockReset().mockResolvedValue(makePage([])); getDetail.mockReset(); });
afterEach(() => { clients.splice(0).forEach((client) => client.clear()); });

describe("InventoryRecentHistoryPanel", () => {
  it.each([false, true])("통합 조회에서도 실제 위치 전후와 취소된 원거래 수량을 보존한다 mobile=%s", async (mobile) => {
    getPage.mockResolvedValue(makePage([
      makeLog({ cancelled: true }),
      makeLog({ log_id: "location", transaction_type: "TRANSFER_DEPT", warehouse_qty_before: 27, warehouse_qty_after: 27,
        department_qty_before: 14, department_qty_after: 19,
        inventory_effect: [{ scope: "location", department: "조립", status: "PRODUCTION", delta: 5, quantity_before: 4, quantity_after: 9 }],
      }),
    ]));
    renderPanel(makeItem(), mobile);
    expect(await screen.findByText("취소된 작업")).toBeVisible();
    expect(screen.getByLabelText("창고 15 +12→27")).toBeInTheDocument();
    expect(screen.getByLabelText("조립 4 +5→9")).toBeInTheDocument();
    expect(screen.queryByLabelText("조립 14 +5→19")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("통합 페이지의 원장 미연결 기록도 중복 없이 실제 합계 표시로 남긴다", async () => {
    const legacy = makeLog({ log_id: "legacy", operation_id: null, transaction_type: "BACKFLUSH", quantity_change: -60,
      warehouse_qty_before: 40, warehouse_qty_after: 40, department_qty_before: 60, department_qty_after: 0 });
    getPage.mockResolvedValue(makePage([makeLog(), legacy, legacy]));
    renderPanel();
    expect(await screen.findByLabelText("부서 합계 60 −60→0")).toBeInTheDocument();
    expect(screen.queryByLabelText("조립 60 −60→0")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("이력 표와 같은 메뉴명으로 이동·불량·출하·취소·분해를 표시한다", async () => {
    getPage.mockResolvedValue(makePage([
      makeLog({ log_id: "transfer", transaction_type: "TRANSFER_TO_PROD" }),
      makeLog({ log_id: "defect", transaction_type: "MARK_DEFECTIVE" }),
      makeLog({ log_id: "ship", transaction_type: "SHIP" }),
      makeLog({ log_id: "cancel", transaction_type: "TRANSFER_TO_WH", operation_kind: "CANCELLATION" }),
      makeLog({ log_id: "disassemble", transaction_type: "PRODUCE", history_batch: { work_type: "process", sub_type: "disassemble", to_department: "조립" } }),
    ]));
    renderPanel();
    expect(await screen.findByText("창고 입출고")).toBeInTheDocument();
    expect(screen.getByText("불량")).toBeInTheDocument();
    expect(screen.getByText("출하")).toBeInTheDocument();
    expect(screen.getByText("창고 입출고 취소")).toBeInTheDocument();
    expect(screen.getByText("분해 출고")).toBeInTheDocument();
    expect(screen.queryByText("TRANSFER_TO_PROD")).not.toBeInTheDocument();
  });

  it.each([false, true])("다품목 묶음의 최근 목록은 현재 품목만 표시하고 상세는 전체 작업을 유지한다 mobile=%s", async (mobile) => {
    const quantities = { normal: 7, defect: 0, b_grade: 0, obsolete: 0 };
    const observations = ["item-1", "item-2"].map((itemId, index) => ({
      rowType: "STOCKTAKE_OBSERVATION" as const, applicationId: "application", countId: `count-${index}`, confirmationRevisionId: `revision-${index}`,
      itemId, itemName: index === 0 ? "현재 관측 품목" : "다른 관측 품목", mesCode: `M${index}`, scopeKey: "warehouse", beforeQuantities: quantities,
      afterQuantities: quantities, reservations: { ...quantities, normal: 0 }, observationEpochBefore: 1, observationEpochAfter: 2, unit: "EA",
    }));
    const logs = [makeLog({ produced_by: "현재 거래", operation_id: "batch-operation" }), makeLog({ log_id: "other-log", item_id: "item-2", produced_by: "다른 거래", operation_id: "batch-operation" })];
    getPage.mockResolvedValue({ groups: [
      { type: "operation", key: "observation", logs: [], stocktake: { operationId: "observation", createdAt: "2026-10-06T00:00:00Z", actorName: "실사 담당", department: "창고", itemCount: 2, matchedItemCount: 1, matchedItemIds: ["item-1"], changedItemCount: 0, unchangedItemCount: 2, observations } },
      { type: "batch", key: "batch", logs },
    ], nextCursor: null, hasMore: false });
    const base = { operationId: "observation", kind: "BUSINESS", domain: "inventory", action: "apply", displayLabel: "전체 작업", effectiveStatus: "active", actorEmployeeId: null, actorName: "실사 담당", department: "창고", reason: null, effectiveAt: "2026-10-06T00:00:00Z", reversesOperationId: null, reversalOperationId: null, canCancel: false, cancelBlockers: [], lines: [], matchingLines: [], effects: [] } as InventoryOperation;
    getDetail.mockImplementation(async (id) => id === "observation" ? { ...base, observationLines: observations } : {
      ...base, operationId: id, lines: logs.map((log, index) => ({ logId: log.log_id, itemId: log.item_id, itemName: index === 0 ? "현재 거래 품목" : "다른 거래 품목", quantityBefore: 1, quantityAfter: 2, quantityChange: 1 } as InventoryOperation["lines"][number])),
    });
    renderPanel(makeItem(), mobile);
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    expect(screen.getByText("조립 · 현재 거래")).toBeVisible();
    expect(screen.queryByText("조립 · 다른 거래")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "작업 상세 보기" })[0]);
    expect(await screen.findByRole("table", { name: "현재 관측 품목 실사 관측" })).toBeVisible();
    expect(screen.getByRole("table", { name: "다른 관측 품목 실사 관측" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "작업 상세 보기" })[1]);
    expect(await screen.findByText("현재 거래 품목")).toBeVisible();
    expect(screen.getByText("다른 거래 품목")).toBeVisible();
    expect(getDetail).toHaveBeenCalledWith("batch-operation", expect.anything());
  });

  it.each([false, true])("상세에서 돌아오면 읽은 페이지를 보존한다 mobile=%s", async (mobile) => {
    getPage.mockResolvedValueOnce(makePage([makeLog()], "next"))
      .mockResolvedValueOnce(makePage([makeLog({ log_id: "second", operation_id: "op-second" })]));
    getDetail.mockRejectedValueOnce(new Error("상세 조회 실패"));
    const { container } = renderPanel(makeItem(), mobile);
    await screen.findByRole("button", { name: "작업 상세 보기" });
    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("button", { name: "작업 상세 보기" })[1]);
    expect(await screen.findByRole("alert")).toHaveTextContent("상세 조회 실패");
    expect(container.firstChild).toHaveClass("inventory-recent-panel");
    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(getPage).toHaveBeenCalledTimes(2);
  });

  it("품목 A에서 B를 거쳐 A로 돌아와도 실제 상세 선택을 초기화한다", async () => {
    getPage.mockImplementation(async (params) => makePage([makeLog({ item_id: params?.itemId })]));
    getDetail.mockRejectedValue(new Error("상세 오류"));
    const view = renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "작업 상세 보기" }));
    await screen.findByRole("alert");
    view.changeItem(makeItem("item-2"));
    await screen.findByRole("button", { name: "작업 상세 보기" });
    view.changeItem(makeItem());
    expect(await screen.findByRole("button", { name: "작업 상세 보기" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "통합 작업 상세" })).not.toBeInTheDocument();
  });

  it("작업 전용 정정을 목록에 표시하고 실제 작업 ID로 상세를 연다", async () => {
    const operation = { operationId: "correction", displayLabel: "업무 정정", effectiveAt: "2026-10-06T00:00:00Z", actorName: "김작업", department: "조립", effectiveStatus: "active", lines: [], matchingLines: [], effects: [], businessCorrection: { correctionId: "c", sourceType: "InventoryOperation", sourceId: "original", sourceOperationIds: ["original"] } } as unknown as InventoryOperation;
    getPage.mockResolvedValue({ groups: [{ type: "operation", key: "correction", logs: [], operation }], hasMore: false, nextCursor: null });
    getDetail.mockRejectedValue(new Error("정정 상세 오류"));
    renderPanel();
    expect(await screen.findByText("업무 정정 · 수량 변동 없음")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "작업 상세 보기" }));
    await screen.findByRole("alert");
    expect(getDetail).toHaveBeenCalledWith("correction", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("거래 없는 실사 관측도 관측 작업 ID로 상세를 연다", async () => {
    const quantities = { normal: 7, defect: 0, b_grade: 0, obsolete: 0 };
    getPage.mockResolvedValue({ groups: [{ type: "operation", key: "observation", logs: [], stocktake: {
      operationId: "observation", createdAt: "2026-10-06T00:00:00Z", actorName: "실사 담당", department: "창고",
      itemCount: 1, matchedItemCount: 1, matchedItemIds: ["item-1"], changedItemCount: 0, unchangedItemCount: 1,
      observations: [{ rowType: "STOCKTAKE_OBSERVATION", applicationId: "a", countId: "c", confirmationRevisionId: "r", itemId: "item-1", itemName: "실사 품목", mesCode: "M1", scopeKey: "warehouse", beforeQuantities: quantities, afterQuantities: quantities, reservations: { ...quantities, normal: 0 }, observationEpochBefore: 1, observationEpochAfter: 2, unit: "EA" }],
    } }], hasMore: false, nextCursor: null });
    getDetail.mockRejectedValue(new Error("관측 상세"));
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "작업 상세 보기" }));
    await screen.findByRole("alert");
    expect(getDetail).toHaveBeenCalledWith("observation", expect.anything());
  });

  it("상세를 보는 동안에도 목록 쿼리 관측자를 유지해 갱신 결과로 돌아온다", async () => {
    getPage.mockResolvedValue(makePage([makeLog()]));
    getDetail.mockRejectedValue(new Error("상세 오류"));
    const { client } = renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "작업 상세 보기" }));
    await screen.findByRole("alert");
    getPage.mockResolvedValue(makePage([makeLog({ produced_by: "상세 중 갱신" })]));
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.transactions.all }); });
    fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
    expect(await screen.findByText("조립 · 상세 중 갱신")).toBeVisible();
    expect(getPage).toHaveBeenCalledTimes(2);
  });
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

  it.each([false, true])("승인 작업도 실행자 대신 요청자를 표시한다 mobile=%s", async (mobile) => {
    getPage.mockResolvedValue(makePage([makeLog({ executor_name: "실행 담당자", requester_name: "요청 담당자", approver_name: "승인 담당자", produced_by: "기록 담당자" })]));
    renderPanel(makeItem(), mobile);
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(screen.getByText("조립 · 요청 담당자")).toBeVisible();
    expect(screen.queryByText(/실행 담당자|승인 담당자|기록 담당자/)).not.toBeInTheDocument();
  });

  it.each([false, true])("요청자 기록이 없는 승인 작업은 승인자로 대체하지 않는다 mobile=%s", async (mobile) => {
    getPage.mockResolvedValue(makePage([makeLog({ executor_name: "승인 담당자", requester_name: "  ", approver_name: "승인 담당자", produced_by: "승인 담당자", operation_batch_id: "batch-1" })]));
    renderPanel(makeItem(), mobile);
    expect(await screen.findByText("조립 · 요청자 기록 없음")).toBeVisible();
    expect(screen.queryByText(/승인 담당자/)).not.toBeInTheDocument();
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
    expect(getPage.mock.calls[0][0]).toEqual({ itemId: "item-1", includeOperationOnly: true, limit: 10, cursor: null });
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
    expect(getPage.mock.calls[2][0]).toEqual({ itemId: "item-2", includeOperationOnly: true, limit: 10, cursor: null });
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

  it.each([false, true])("생산 작업의 자재 최근 내역도 생산 입고와 취소를 구분한다 mobile=%s", async (mobile) => {
    getPage.mockResolvedValue(makePage([
      makeLog({ log_id: "production-input", transaction_type: "BACKFLUSH", history_batch: { work_type: "process", sub_type: "produce" } }),
      makeLog({ log_id: "production-cancel", transaction_type: "BACKFLUSH", operation_kind: "CANCELLATION", history_batch: { work_type: "process", sub_type: "produce" } }),
      makeLog({ log_id: "quantity-adjustment", transaction_type: "BACKFLUSH", history_batch: { work_type: "process", sub_type: "produce", display_transaction_type: "ADJUST" } }),
    ]));
    renderPanel(makeItem(), mobile);
    expect(await screen.findByText("생산 입고")).toBeVisible();
    expect(screen.getByText("생산 입고 취소")).toBeVisible();
    expect(screen.getByText("부서 입출고")).toBeVisible();
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
