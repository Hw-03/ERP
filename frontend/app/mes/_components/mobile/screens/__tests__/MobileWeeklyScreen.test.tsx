import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileWeeklyScreen } from "../MobileWeeklyScreen";

const state = vi.hoisted(() => ({
  getWeeklyReport: vi.fn(() => new Promise(() => {})),
}));

const selectedItem = {
  item_id: "item-bom-1",
  mes_code: "8-TF-0001",
  item_name: "DXDR-70 튜브",
  prev_qty: 0,
  produce_qty: 1,
  receive_qty: 0,
  out_qty: 0,
  current_qty: 1,
  delta: 1,
};

vi.mock("@/lib/api", () => ({
  api: {
    getWeeklyReport: state.getWeeklyReport,
  },
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
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    state.getWeeklyReport.mockReset();
    state.getWeeklyReport.mockReturnValue(new Promise(() => {}));
  });

  it("최초 조회 중에도 생산·공정·품목 영역을 유지한다", () => {
    render(<MobileWeeklyScreen weekMon={new Date("2026-08-31T00:00:00+09:00")} />);
    expect(screen.getByRole("status", { name: "주간보고 불러오는 중" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("생산 현황")).toBeInTheDocument();
    expect(screen.getByText("공정 선택")).toBeInTheDocument();
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

  it("keeps week navigation and returns to the More menu", () => {
    const onExit = vi.fn();
    const onWeekChange = vi.fn();

    render(
      <MobileWeeklyScreen
        weekMon={new Date("2026-07-20T00:00:00")}
        onWeekChange={onWeekChange}
        onExit={onExit}
      />,
    );

    fireEvent.click(screen.getByTitle("이전 주"));
    expect(onWeekChange).toHaveBeenCalledWith(new Date("2026-07-13T00:00:00"));
    fireEvent.click(screen.getByTitle("다음 주"));
    expect(onWeekChange).toHaveBeenCalledWith(new Date("2026-07-27T00:00:00"));

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

  it("검증된 보고서는 정상재고 명칭을 품목 상세에 표시한다", async () => {
    state.getWeeklyReport.mockResolvedValue({
      groups: [{ process_code: "TF", dept_name: "튜브", label: "튜브", item_count: 1, prev_qty: 1, increase_qty: 2, decrease_qty: 0, produce_qty: 2, receive_qty: 0, out_qty: 0, current_qty: 3, delta: 2, items: [selectedItem] }],
      summary: { total_produce_qty: 2 },
      production_matrix: [],
      report_status: "verified",
      basis_version: 2,
    });

    render(<MobileWeeklyScreen weekMon={new Date("2026-08-31T00:00:00")} />);

    expect(await screen.findByText("전주 정상")).toBeInTheDocument();
    expect(screen.getByText("현재 정상")).toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole("button", { name: `${selectedItem.item_name} BOM 구성 보기` }));

    expect(screen.getByRole("dialog", { name: "BOM 구성 보기" })).toBeInTheDocument();
    expect(screen.getByTestId("mobile-weekly-bom-tree")).toHaveAttribute("data-item-id", selectedItem.item_id);
    expect(screen.getByTestId("mobile-weekly-bom-tree")).toHaveAttribute("data-mobile-detail", "true");

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog", { name: "BOM 구성 보기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "품목 이름 펼치기" })).not.toBeInTheDocument();
  });

  it("모델별 생산 현황은 모델 순서와 모든 공정 수량을 유지한다", async () => {
    state.getWeeklyReport.mockResolvedValue({
      groups: [], summary: { total_produce_qty: 8 },
      production_matrix: [
        { model_key: "z", model_label: "Z 모델", tf_qty: 0, hf_qty: 0, vf_qty: 0, nf_qty: 0, af_qty: 0, pf_qty: 3, total_qty: 3 },
        { model_key: "a", model_label: "A 모델", tf_qty: 1, hf_qty: 0, vf_qty: 0, nf_qty: 0, af_qty: 0, pf_qty: 0, total_qty: 1 },
      ],
    });
    render(<MobileWeeklyScreen weekMon={new Date("2026-08-31T00:00:00+09:00")} />);
    const production = await screen.findByRole("region", { name: "모델별 공정 생산 현황" });
    const models = within(production).getAllByRole("article");
    expect(models[0]).toHaveAccessibleName("A 모델 생산 현황");
    expect(models[1]).toHaveAccessibleName("Z 모델 생산 현황");
    expect(within(models[0]).getAllByRole("term").map((label) => label.textContent)).toEqual(["튜브", "고압", "진공", "튜닝", "조립", "출하 완료"]);
    expect(within(models[0]).getAllByRole("definition").map((value) => value.textContent)).toEqual(["1", "—", "—", "—", "—", "—"]);
    expect(within(models[1]).getAllByRole("definition").map((value) => value.textContent)).toEqual(["—", "—", "—", "—", "—", "3"]);
    expect(screen.getByText("총 8개")).toBeInTheDocument();
  });

  it("공정 선택 후 해당 품목의 여섯 수량과 독립적인 이름 펼치기 동작을 제공한다", async () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(60);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(40);
    const item = { ...selectedItem, item_name: "아주 긴 품목 이름 아주 긴 품목 이름", prev_qty: 11, produce_qty: 2, receive_qty: 3, out_qty: 4, defect_qty: 1, current_qty: 12, delta: 1 };
    const group = (process_code: string, items: typeof item[]) => ({ process_code, dept_name: process_code === "HF" ? "고압" : "튜브", label: process_code, item_count: items.length, prev_qty: 11, increase_qty: 5, decrease_qty: 4, produce_qty: 2, receive_qty: 3, out_qty: 4, defect_qty: 1, current_qty: 12, delta: 1, items });
    state.getWeeklyReport.mockResolvedValue({ groups: [group("HF", [item]), group("TF", [])], summary: { total_produce_qty: 2 }, production_matrix: [] });
    render(<MobileWeeklyScreen weekMon={new Date("2026-08-31T00:00:00+09:00")} />);
    const choices = await screen.findByRole("group", { name: "공정 선택" });
    expect(within(choices).getAllByRole("button").map((button) => button.textContent)).toEqual(["튜브TF", "고압HF"]);
    fireEvent.click(await screen.findByRole("button", { name: /고압 HF/ }));
    expect(screen.getByRole("button", { name: "고압 HF" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "튜브 TF" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("고압 품목 상세")).toBeInTheDocument();
    const detail = screen.getByTestId("mobile-weekly-detail-item-bom-1");
    expect(detail).toHaveTextContent("11");
    expect(detail).toHaveTextContent("2");
    expect(detail).toHaveTextContent("3");
    expect(detail).toHaveTextContent("4");
    expect(detail).toHaveTextContent("1");
    expect(detail).toHaveTextContent("12");
    const expand = screen.getByRole("button", { name: "품목 이름 펼치기" });
    expect(expand.parentElement).toBe(detail);
    fireEvent.click(expand);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `${item.item_name} BOM 구성 보기` }));
    expect(screen.getByRole("dialog", { name: "BOM 구성 보기" })).toBeInTheDocument();
  });

  it("문자열 0도 대시로 표시하고 큰 수량과 레거시 재고 명칭을 유지한다", async () => {
    const item = { ...selectedItem, item_name: "매우 긴 부품 이름 ABCDEFG 1234567890 매우 긴 부품 이름", prev_qty: 123456, produce_qty: 0, receive_qty: 0, out_qty: 0, defect_qty: 0, current_qty: 123456, delta: 0 };
    state.getWeeklyReport.mockResolvedValue({
      groups: [{ process_code: "TF", dept_name: "튜브", label: "튜브", item_count: 1, prev_qty: 123456, increase_qty: "0", decrease_qty: "0", produce_qty: "0", receive_qty: 0, out_qty: 0, defect_qty: 0, current_qty: 123456, delta: 0, items: [item] }],
      summary: { total_produce_qty: 0 }, production_matrix: [], report_status: "legacy", basis_version: 1,
    });
    render(<MobileWeeklyScreen weekMon={new Date("2026-08-31T00:00:00+09:00")} />);
    const card = await screen.findByRole("button", { name: /튜브 TF/ });
    expect(card).toHaveAccessibleName("튜브 TF");
    expect(card).toHaveAttribute("aria-pressed", "true");
    expect(card).not.toHaveTextContent("123,456");
    const summary = screen.getByTestId("weekly-detail-summary");
    expect(summary).toHaveTextContent("재고123,456");
    expect(summary).toHaveTextContent("증감±0");
    expect(summary).toHaveTextContent("품목1/1");
    expect(summary).not.toHaveTextContent("튜브");
    expect(summary).not.toHaveTextContent("TF");
    const detail = screen.getByTestId("mobile-weekly-detail-item-bom-1");
    expect(detail).toHaveTextContent("123,456");
    expect(within(detail).getByText("전주")).toBeInTheDocument();
    expect(within(detail).getByText("현재")).toBeInTheDocument();
    expect(screen.queryByText("현재 정상")).not.toBeInTheDocument();
  });

  it("모든 수량이 0인 품목만 숨기고 증감 0의 거래·재고 품목은 남긴다", async () => {
    const zero = { ...selectedItem, item_id: "zero", item_name: "모두 0 품목", prev_qty: "0", produce_qty: 0, receive_qty: 0, out_qty: 0, defect_qty: 0, current_qty: 0, delta: 0 };
    const moved = { ...zero, item_id: "moved", item_name: "증감 0 거래 품목", produce_qty: 4, out_qty: 4 };
    const stocked = { ...zero, item_id: "stocked", item_name: "증감 0 재고 품목", prev_qty: 2, current_qty: 2 };
    state.getWeeklyReport.mockResolvedValue({ groups: [{ process_code: "TF", dept_name: "튜브", current_qty: 2, delta: 0, items: [zero, moved, stocked] }], production_matrix: [] });
    render(<MobileWeeklyScreen weekMon={new Date("2026-08-31T00:00:00+09:00")} />);
    expect(await screen.findByRole("button", { name: "증감 0 거래 품목 BOM 구성 보기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "증감 0 재고 품목 BOM 구성 보기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "모두 0 품목 BOM 구성 보기" })).not.toBeInTheDocument();
    expect(screen.getByTestId("weekly-detail-summary")).toHaveTextContent("품목2/3");
  });

  it("필터 뒤 표시할 품목이 없어도 요약과 안내를 표시한다", async () => {
    state.getWeeklyReport.mockResolvedValue({ groups: [{ process_code: "TF", dept_name: "튜브", current_qty: 0, delta: 0, items: [{ ...selectedItem, prev_qty: 0, produce_qty: 0, receive_qty: 0, out_qty: 0, defect_qty: 0, current_qty: 0, delta: 0 }] }], production_matrix: [] });
    render(<MobileWeeklyScreen weekMon={new Date("2026-08-31T00:00:00+09:00")} />);
    expect(await screen.findByText("이번 주 수량이 있는 품목이 없습니다.")).toBeInTheDocument();
    expect(screen.getByTestId("weekly-detail-summary")).toHaveTextContent("품목0/1");
  });

  it("공정과 품목이 모두 비면 각 영역에 빈 상태를 표시한다", async () => {
    state.getWeeklyReport.mockResolvedValue({ groups: [], summary: { total_produce_qty: 0 }, production_matrix: [] });
    render(<MobileWeeklyScreen weekMon={new Date("2026-08-31T00:00:00+09:00")} />);
    expect(await screen.findByText("선택할 공정이 없습니다.")).toBeInTheDocument();
    expect(screen.getByText("해당 공정완료품 데이터가 없습니다.")).toBeInTheDocument();
    expect(screen.getByText("이번 주 생산 실적이 없습니다.")).toBeInTheDocument();
  });
});
