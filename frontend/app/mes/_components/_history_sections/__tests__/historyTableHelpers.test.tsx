import { fireEvent, render, screen } from "@testing-library/react";
import { within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TransactionLog } from "@/lib/api/types/production";
import { HistoryTable } from "../HistoryTable";
import type { HistoryRowPresentation } from "../historyPresentation";
import {
  HISTORY_CHILD_ROW_CLASS,
  HISTORY_MAIN_CELL_CLASS,
  HISTORY_MAIN_ROW_CLASS,
  MovementSummaryCell,
  PeopleStatusCell,
  ReferenceBatchDetail,
  TargetSummaryBlock,
  buildGroups,
} from "../historyTableHelpers";

function makeLog(overrides: Partial<TransactionLog> = {}): TransactionLog {
  return {
    log_id: "log-1",
    item_id: "ITEM-1",
    mes_code: "AX-001",
    item_name: "AX-100",
    item_process_type_code: "AF",
    item_unit: "EA",
    transaction_type: "SHIP",
    quantity_change: -1,
    quantity_before: 2,
    quantity_after: 1,
    warehouse_qty_before: null,
    warehouse_qty_after: null,
    transfer_qty: 1,
    reference_no: "SHIP-REQ-1",
    produced_by: null,
    requester_name: null,
    approver_name: null,
    requested_at: "2026-07-02T01:00:00Z",
    approved_at: null,
    department: "조립",
    notes: null,
    operation_batch_id: null,
    created_at: "2026-07-02T01:00:00Z",
    edit_count: 0,
    cancelled: false,
    cancel_reason: null,
    cancelled_by: null,
    cancelled_at: null,
    inventory_effect: null,
    shipping_phase: null,
    ...overrides,
  };
}

describe("buildGroups shipping phase grouping", () => {
  it("separates prepare and pickup logs that share a shipping request reference", () => {
    const groups = buildGroups([
      makeLog({ log_id: "prep-pa", transaction_type: "BACKFLUSH", shipping_phase: "PREPARE", item_id: "PA" }),
      makeLog({ log_id: "prep-pf", transaction_type: "PRODUCE", shipping_phase: "PREPARE", item_id: "PF" }),
      makeLog({ log_id: "pickup-pf", transaction_type: "SHIP", shipping_phase: "PICKUP", item_id: "PF" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ type: "batch", refNo: "SHIP-REQ-1", refKey: "SHIP-REQ-1::PREPARE" });
    expect(groups[1]).toMatchObject({ type: "solo" });
    if (groups[0].type === "batch") {
      expect(groups[0].logs.map((log) => log.shipping_phase)).toEqual(["PREPARE", "PREPARE"]);
    }
    if (groups[1].type === "solo") {
      expect(groups[1].log.shipping_phase).toBe("PICKUP");
    }
  });
});

describe("history table helper rendering policies", () => {
  it("lets the compact table shrink inside the left pane when the right detail panel is open", () => {
    const log = makeLog();
    const { container } = render(
      <HistoryTable
        loading={false}
        filteredLogs={[log]}
        totalCount={1}
        selection={{ kind: "log", log }}
        onSelectLog={() => {}}
        onSelectBatch={() => {}}
        batchCache={new Map()}
        setBatchCache={() => {}}
        canLoadMore={false}
        loadingMore={false}
        onLoadMore={() => {}}
      />,
    );

    const tableCard = container.querySelector("section.card");
    const tableScroller = container.querySelector("section.card > div.overflow-x-hidden");
    const table = tableScroller?.querySelector("table");

    expect(tableCard).toHaveClass("min-w-0");
    expect(tableScroller).toHaveClass("min-w-0");
    expect(tableScroller).toHaveClass("-mr-5");
    expect(table).toHaveClass("w-full");
    expect(table).toHaveClass("table-fixed");
    expect(table).toHaveClass("[&_tbody_td:nth-child(3)]:px-2");
    expect(table).toHaveClass("[&_tbody_td:nth-child(4)]:px-1");
    expect(table).toHaveClass("[&_tbody_td:nth-child(6)]:px-2");
    expect(table).toHaveClass("[&_tbody_td:nth-child(7)]:px-2");
    expect(table).toHaveClass("[&_tbody_td:nth-child(8)]:px-2");
  });

  it("defines a single fixed rhythm for main history rows", () => {
    expect(HISTORY_MAIN_ROW_CLASS).toBe("h-[64px]");
    expect(HISTORY_CHILD_ROW_CLASS).toBe("h-[40px]");
    expect(HISTORY_MAIN_CELL_CLASS).toContain("py-2");
    expect(HISTORY_MAIN_CELL_CLASS).toContain("align-middle");
  });

  it("keeps every loaded selectable row in the exact 64px slot after appending more logs", () => {
    const first = makeLog({ log_id: "first" });
    const second = makeLog({ log_id: "second", reference_no: "SHIP-REQ-2" });
    const props = {
      loading: false,
      totalCount: 2,
      selection: null,
      onSelectLog: () => {},
      onSelectBatch: () => {},
      batchCache: new Map(),
      setBatchCache: () => {},
      canLoadMore: false,
      loadingMore: false,
      onLoadMore: () => {},
    };
    const { container, rerender } = render(<HistoryTable {...props} filteredLogs={[first]} />);

    expect(container.querySelectorAll("tbody tr[role='button']")).toHaveLength(1);
    expect(container.querySelector("tbody tr[role='button']")).toHaveClass("h-[64px]");

    rerender(<HistoryTable {...props} filteredLogs={[first, second]} />);
    const rows = Array.from(container.querySelectorAll("tbody tr[role='button']"));
    expect(rows).toHaveLength(2);
    rows.forEach((row) => expect(row).toHaveClass("h-[64px]"));
  });

  it("lets the compact target column absorb remaining width while preserving judgment columns", () => {
    const log = makeLog();
    render(
      <HistoryTable
        loading={false}
        filteredLogs={[log]}
        selection={{ kind: "log", log }}
        onSelectLog={() => {}}
        onSelectBatch={() => {}}
        batchCache={new Map()}
        setBatchCache={() => {}}
        canLoadMore={false}
        loadingMore={false}
        onLoadMore={() => {}}
      />,
    );

    const target = screen.getByRole("columnheader", { name: "대상" });
    expect(target.style.width).toBe("");
    expect(target.style.minWidth).toBe("");
    expect(screen.getByRole("columnheader", { name: "흐름" }).style.width).not.toBe("");
    expect(screen.getByRole("columnheader", { name: "수량 · 재고" }).style.width).not.toBe("");
    expect(screen.getByRole("columnheader", { name: "상태 · 처리" }).style.width).not.toBe("");
  });

  it("uses the same thin pill height for single and paired movement summaries", () => {
    render(
      <div>
        <MovementSummaryCell summary={{ parts: [{ label: "이동 2품목 · 22 EA", tone: "info" }] }} />
        <MovementSummaryCell
          summary={{
            parts: [
              { label: "완제품 +5 EA", tone: "primary" },
              { label: "부품 -10 EA", tone: "danger" },
            ],
          }}
        />
      </div>,
    );

    expect(screen.getByText("이동 2품목 · 22 EA")).toHaveClass("h-6");
    expect(screen.getByText("이동 2품목 · 22 EA")).toHaveClass("min-w-[10.25rem]");
    expect(screen.getByText("완제품 +5 EA")).toHaveClass("h-6");
    expect(screen.getByText("완제품 +5 EA")).toHaveClass("min-w-[5rem]");
    expect(screen.getByText("부품 -10 EA")).toHaveClass("h-6");
    expect(screen.getByText("부품 -10 EA")).toHaveClass("min-w-[5rem]");
  });

  it("lets compact movement pills shrink and truncate inside the preserved quantity column", () => {
    render(
      <MovementSummaryCell
        compact
        summary={{ parts: [{ label: "아주 긴 수량 변화 요약 100 EA", tone: "info" }] }}
      />,
    );

    const pill = screen.getByText("아주 긴 수량 변화 요약 100 EA");
    expect(pill).toHaveClass("max-w-full");
    expect(pill).toHaveClass("min-w-0");
    expect(pill).toHaveClass("truncate");
    expect(pill).not.toHaveClass("min-w-[10.25rem]");
  });

  it("uses the real conversion item as each collapsible parent instead of an empty section row", () => {
    const source = makeLog({
      log_id: "conversion-source",
      item_name: "기존품",
      mes_code: "3-AA-0001",
      transaction_type: "BACKFLUSH",
      quantity_change: -1,
      shipping_phase: "COMPONENT_CHANGE",
      notes: "품목 전환 소스 PA 사용",
    });
    const additional = makeLog({
      log_id: "conversion-additional",
      item_name: "추가 차감품",
      mes_code: "3-AR-0006",
      transaction_type: "BACKFLUSH",
      quantity_change: -1,
      shipping_phase: "COMPONENT_CHANGE",
      notes: "품목 전환 추가 차감",
    });
    const target = makeLog({
      log_id: "conversion-target",
      item_name: "변경품",
      mes_code: "3-AR-0027",
      transaction_type: "PRODUCE",
      quantity_change: 1,
      shipping_phase: "COMPONENT_CHANGE",
      notes: "품목 전환 대상 PA 입고",
    });

    render(
      <table>
        <tbody>
          <ReferenceBatchDetail logs={[source, additional, target]} />
        </tbody>
      </table>,
    );

    const sourceRow = screen.getByText("기존품").closest("tr");
    expect(sourceRow).toHaveTextContent("기존품 차감");
    expect(sourceRow).toHaveTextContent("3-AA-0001");
    expect(sourceRow).toHaveClass("h-[40px]");
    expect(screen.getByText("추가 차감품")).toBeInTheDocument();

    fireEvent.click(within(sourceRow!).getByRole("button", { name: "묶음 접기" }));
    expect(screen.queryByText("추가 차감품")).not.toBeInTheDocument();
    expect(screen.getByText("기존품")).toBeInTheDocument();
  });

  it("reserves compact flow width for the full production result label", () => {
    render(
      <HistoryTable
        loading={false}
        filteredLogs={[makeLog()]}
        selection={{ kind: "log", log: makeLog() }}
        onSelectLog={() => {}}
        onSelectBatch={() => {}}
        batchCache={new Map()}
        setBatchCache={() => {}}
        canLoadMore={false}
        loadingMore={false}
        onLoadMore={() => {}}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "흐름" }).style.width).toBe("152px");
  });

  it("does not prefix system actors with human requester wording", () => {
    const presentation = {
      people: { requester: "시스템 처리 · 구성품 변경", approver: "" },
      statusChips: [{ label: "자동 처리", tone: "info" }],
    } as HistoryRowPresentation;

    render(<PeopleStatusCell presentation={presentation} />);

    expect(screen.getByText("시스템 처리 · 구성품 변경")).toBeInTheDocument();
    expect(screen.queryByText("요청 시스템 처리 · 구성품 변경")).not.toBeInTheDocument();
    expect(screen.getByText("자동 처리")).toBeInTheDocument();
    expect(screen.getByText("자동 처리").parentElement).toHaveClass("flex-nowrap");
  });

  it("lets a target title use two lines while keeping the main row slot fixed", () => {
    const presentation = {
      target: {
        title: "발생부 고압B/D+튜브 최종 작업판 [COCOON] 매우 긴 품목명",
        code: "7-HF-0007",
        meta: ["7종 처리", "긴 보조 설명"],
      },
    } as HistoryRowPresentation;

    render(
      <TargetSummaryBlock
        presentation={presentation}
        icon={<span aria-hidden />}
      />,
    );

    expect(screen.getByText(presentation.target.title)).toHaveClass("line-clamp-2");
    expect(screen.getByText("7종 처리")).toHaveClass("truncate");
  });

  it("lets expanded reference child rows select their own log", () => {
    const onSelectLog = vi.fn();
    const Detail = ReferenceBatchDetail as React.ComponentType<{
      logs: TransactionLog[];
      onSelectLog: (log: TransactionLog) => void;
    }>;
    const child = makeLog({
      log_id: "child-log",
      item_name: "구성품 라인",
      transaction_type: "BACKFLUSH",
      shipping_phase: "PREPARE",
    });

    render(
      <table>
        <tbody>
          <Detail logs={[child]} onSelectLog={onSelectLog} />
        </tbody>
      </table>,
    );

    fireEvent.click(screen.getByText("구성품 라인"));
    expect(onSelectLog).toHaveBeenCalledWith(expect.objectContaining({ log_id: "child-log" }));
    expect(screen.getByText("구성품 라인").closest("tr")).toHaveClass("h-[40px]");
  });

  it("shortens the compact additional component badge but preserves its full title and accessible name", () => {
    const child = makeLog({
      log_id: "additional-component",
      item_name: "추가 구성품",
      transaction_type: "BACKFLUSH",
      shipping_phase: "COMPONENT_CHANGE",
      notes: "품목 전환 추가 차감",
    });

    render(
      <table>
        <tbody>
          <ReferenceBatchDetail logs={[child]} compact />
        </tbody>
      </table>,
    );

    const badge = screen.getByLabelText("추가 구성품 차감");
    expect(badge).toHaveTextContent("추가 차감");
    expect(badge).toHaveAttribute("title", "추가 구성품 차감");
    expect(badge).toHaveClass("max-w-full");
    expect(badge).toHaveClass("min-w-0");
  });

  it.each(["Enter", " "])("uses %s on a batch chevron without selecting the parent row", (key) => {
    const onSelectLog = vi.fn();
    const logs = [
      makeLog({ log_id: "component", transaction_type: "BACKFLUSH", shipping_phase: "PREPARE" }),
      makeLog({ log_id: "product", item_id: "ITEM-2", transaction_type: "PRODUCE", shipping_phase: "PREPARE" }),
    ];
    render(
      <HistoryTable
        loading={false}
        filteredLogs={logs}
        selection={null}
        onSelectLog={onSelectLog}
        onSelectBatch={() => {}}
        batchCache={new Map()}
        setBatchCache={() => {}}
        canLoadMore={false}
        loadingMore={false}
        onLoadMore={() => {}}
      />,
    );

    const toggle = screen.getByRole("button", { name: "묶음 펼치기" });
    const parentRow = toggle.closest("tr");
    const controlsId = toggle.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    expect(parentRow).not.toHaveAttribute("role", "button");
    expect(parentRow).toHaveAttribute("aria-selected", "false");

    fireEvent.keyDown(toggle, { key });

    expect(onSelectLog).not.toHaveBeenCalled();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(controlsId!)).toBeInTheDocument();
  });

  it("renders an initial failure instead of the normal empty state and retries", () => {
    const onRetry = vi.fn();
    render(
      <HistoryTable
        loading={false}
        filteredLogs={[]}
        error="서버 연결 실패"
        onRetry={onRetry}
        selection={null}
        onSelectLog={() => {}}
        onSelectBatch={() => {}}
        batchCache={new Map()}
        setBatchCache={() => {}}
        canLoadMore={false}
        loadingMore={false}
        onLoadMore={() => {}}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("서버 연결 실패");
    expect(screen.queryByText("거래 이력이 없습니다.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("keeps loaded rows visible when load-more fails and offers inline retry", () => {
    const onLoadMore = vi.fn();
    const log = makeLog();
    render(
      <HistoryTable
        loading={false}
        filteredLogs={[log]}
        loadMoreError="추가 내역 조회 실패"
        selection={null}
        onSelectLog={() => {}}
        onSelectBatch={() => {}}
        batchCache={new Map()}
        setBatchCache={() => {}}
        canLoadMore
        loadingMore={false}
        onLoadMore={onLoadMore}
      />,
    );

    expect(screen.getByText("AX-100")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("추가 내역 조회 실패");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });
});
