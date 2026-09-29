import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileWeeklyScreen } from "../MobileWeeklyScreen";

const state = vi.hoisted(() => ({
  getWeeklyReport: vi.fn(() => new Promise(() => {})),
}));

const selectedItem = {
  item_id: "item-bom-1",
  mes_code: "8-TF-0001",
  item_name: "DXDR-70 튜브",
  prev_qty: 0,
  produce_qty: 0,
  receive_qty: 0,
  out_qty: 0,
  current_qty: 0,
  delta: 0,
};

vi.mock("@/lib/api", () => ({
  api: {
    getWeeklyReport: state.getWeeklyReport,
  },
}));

vi.mock("../../../_weekly_sections/WeeklyDetailTable", () => ({
  WeeklyDetailTable: ({ stockBasis, onItemSelect }: { stockBasis: string; onItemSelect?: (item: typeof selectedItem) => void }) => (
    <div data-testid="mobile-weekly-detail" data-stock-basis={stockBasis}>
      <button type="button" onClick={() => onItemSelect?.(selectedItem)}>BOM 열기</button>
    </div>
  ),
}));

vi.mock("@/lib/ui/BottomSheet", () => ({
  BottomSheet: ({ open, title, onClose, children }: { open: boolean; title?: string; onClose: () => void; children: React.ReactNode }) => open ? (
    <div role="dialog" aria-label={title}>
      <button type="button" onClick={onClose}>닫기</button>
      {children}
    </div>
  ) : null,
}));

vi.mock("../../../_warehouse_v2/BomSubExpander", () => ({
  BomSubExpander: ({ itemId, mobileDetail }: { itemId: string; mobileDetail?: boolean }) => (
    <div data-testid="mobile-weekly-bom-tree" data-item-id={itemId} data-mobile-detail={String(mobileDetail)} />
  ),
}));

vi.mock("../../../DepartmentsContext", () => ({
  useDeptColorLookup: () => () => "#3b82f6",
}));

describe("MobileWeeklyScreen", () => {
  beforeEach(() => {
    state.getWeeklyReport.mockReset();
    state.getWeeklyReport.mockReturnValue(new Promise(() => {}));
  });

  it("최초 조회 중에도 생산·공정·품목 영역을 유지한다", () => {
    render(<MobileWeeklyScreen weekMon={new Date("2026-08-31T00:00:00+09:00")} />);
    expect(screen.getByRole("status", { name: "주간보고 불러오는 중" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("생산 현황")).toBeInTheDocument();
    expect(screen.getByText("공정별 변화")).toBeInTheDocument();
    expect(screen.getByText("품목 상세")).toBeInTheDocument();
    expect(screen.queryByText(/생산 실적이 없습니다/)).not.toBeInTheDocument();
  });

  it("새 주 조회 중에는 이전 주 수량을 숨기고 늦은 응답도 무시한다", async () => {
    let resolveOld!: (value: unknown) => void;
    state.getWeeklyReport.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    const { rerender } = render(<MobileWeeklyScreen weekMon={new Date("2026-08-31T00:00:00+09:00")} />);
    state.getWeeklyReport.mockResolvedValueOnce({ groups: [], summary: { total_produce_qty: 9 }, production_matrix: [] });
    rerender(<MobileWeeklyScreen weekMon={new Date("2026-09-07T00:00:00+09:00")} />);
    expect(await screen.findByText("전체 생산 9개")).toBeInTheDocument();
    await act(async () => { resolveOld({ groups: [], summary: { total_produce_qty: 5 }, production_matrix: [] }); });
    expect(screen.queryByText("전체 생산 5개")).not.toBeInTheDocument();
    state.getWeeklyReport.mockReturnValueOnce(new Promise(() => {}));
    rerender(<MobileWeeklyScreen weekMon={new Date("2026-09-14T00:00:00+09:00")} />);
    expect(screen.queryByText("전체 생산 9개")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "주간보고 불러오는 중" })).toBeInTheDocument();
  });

  it("같은 주로 돌아온 재조회가 실패해도 기존 값과 재시도 중 본문을 유지한다", async () => {
    state.getWeeklyReport.mockResolvedValueOnce({ groups: [], summary: { total_produce_qty: 7 }, production_matrix: [] });
    const weekMon = new Date("2026-08-31T00:00:00+09:00");
    const { rerender } = render(<MobileWeeklyScreen weekMon={weekMon} />);
    expect(await screen.findByText("전체 생산 7개")).toBeInTheDocument();
    state.getWeeklyReport.mockReturnValueOnce(new Promise(() => {}));
    rerender(<MobileWeeklyScreen weekMon={new Date("2026-09-07T00:00:00+09:00")} />);
    state.getWeeklyReport.mockRejectedValueOnce(new Error("refresh failed"));
    rerender(<MobileWeeklyScreen weekMon={weekMon} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("주간보고 데이터를 불러오지 못했습니다.");
    expect(screen.getByText("전체 생산 7개")).toBeInTheDocument();
    state.getWeeklyReport.mockReturnValueOnce(new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByText("전체 생산 7개")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "주간보고 불러오는 중" })).not.toBeInTheDocument();
  });

  it("centers the week picker and returns to the More menu", () => {
    const onExit = vi.fn();

    render(
      <MobileWeeklyScreen
        weekMon={new Date("2026-07-20T00:00:00")}
        onWeekChange={() => {}}
        onExit={onExit}
      />,
    );

    expect(screen.getByTestId("mobile-weekly-header")).toHaveClass("justify-center");

    fireEvent.click(screen.getByRole("button", { name: "더보기 메뉴로 돌아가기" }));

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("requests the selected KST Monday through Sunday", () => {
    render(<MobileWeeklyScreen weekMon={new Date("2026-08-31T00:00:00+09:00")} />);

    expect(state.getWeeklyReport).toHaveBeenLastCalledWith({
      week_start: "2026-08-31",
      week_end: "2026-09-06",
    });
  });

  it("passes the normal-stock basis to verified weekly details", async () => {
    state.getWeeklyReport.mockResolvedValue({
      groups: [],
      production_matrix: [],
      report_status: "verified",
      basis_version: 2,
    });

    render(<MobileWeeklyScreen weekMon={new Date("2026-08-31T00:00:00")} />);

    expect(await screen.findByTestId("mobile-weekly-detail")).toHaveAttribute(
      "data-stock-basis",
      "normal",
    );
  });

  it("8.21-05 전체 생산은 있지만 모델별 집계가 0이면 생산 없음으로 표시하지 않는다", async () => {
    state.getWeeklyReport.mockResolvedValue({
      groups: [],
      summary: { total_produce_qty: 8 },
      production_matrix: [],
    });

    render(<MobileWeeklyScreen weekMon={new Date("2026-08-31T00:00:00")} />);

    expect(await screen.findByText("전체 생산 8개")).toBeInTheDocument();
    expect(screen.getByText("모델별 집계 0")).toBeInTheDocument();
    expect(screen.getByText(/모델 정보가 없거나 공용인 품목은 모델별 집계에서 제외/)).toBeInTheDocument();
    expect(screen.queryByText(/생산 실적이 없습니다/)).not.toBeInTheDocument();
  });

  it("모바일 전체 생산 합계는 모델별 매트릭스 합계와 별도로 표시한다", async () => {
    state.getWeeklyReport.mockResolvedValue({
      groups: [],
      summary: { total_produce_qty: 8 },
      production_matrix: [{
        model_key: "DX3000",
        model_label: "DX3000",
        tf_qty: 0,
        hf_qty: 0,
        vf_qty: 0,
        nf_qty: 0,
        af_qty: 0,
        pf_qty: 4,
        total_qty: 4,
      }],
    });

    render(<MobileWeeklyScreen weekMon={new Date("2026-08-31T00:00:00")} />);

    expect(await screen.findByText("총 8개")).toBeInTheDocument();
    expect(screen.queryByText("총 4개")).not.toBeInTheDocument();
  });

  it("opens the selected item BOM in a mobile sheet", async () => {
    state.getWeeklyReport.mockResolvedValue({
      groups: [{
        process_code: "TF",
        dept_name: "튜브",
        label: "튜브",
        item_count: 1,
        prev_qty: 0,
        increase_qty: 0,
        decrease_qty: 0,
        produce_qty: 0,
        receive_qty: 0,
        out_qty: 0,
        current_qty: 0,
        delta: 0,
        items: [selectedItem],
      }],
      production_matrix: [],
    });

    render(<MobileWeeklyScreen weekMon={new Date("2026-08-31T00:00:00")} />);
    fireEvent.click(await screen.findByRole("button", { name: "BOM 열기" }));

    expect(screen.getByRole("dialog", { name: "BOM 구성 보기" })).toBeInTheDocument();
    expect(screen.getByTestId("mobile-weekly-bom-tree")).toHaveAttribute("data-item-id", selectedItem.item_id);
    expect(screen.getByTestId("mobile-weekly-bom-tree")).toHaveAttribute("data-mobile-detail", "true");

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog", { name: "BOM 구성 보기" })).not.toBeInTheDocument();
  });
});
