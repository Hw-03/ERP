import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { StocktakeHistoryDetail } from "../StocktakeHistoryDetail";
import { stocktakeHistoryRows, observationSummary, stocktakeWorkSelection } from "../stocktakeHistory";
import type { StocktakeHistoryWork } from "@/lib/api/production";
import { StockSnapshotContent } from "../historyTableHelpers";

const work = {
  operationId: "op", createdAt: "2026-10-12T02:00:00Z", actorName: "작업자", department: "조립",
  itemCount: 2, matchedItemCount: 1, matchedItemIds: ["b"], changedItemCount: 1, unchangedItemCount: 1,
  observations: [{ itemId: "b", itemName: "검색 품목", mesCode: "B", countId: "b", unit: "EA", beforeQuantities: { normal: 1, defect: 0, b_grade: 0, obsolete: 0 }, afterQuantities: { normal: 0, defect: 1, b_grade: 0, obsolete: 0 } },
    { itemId: "a", itemName: "무변동 품목", mesCode: "A", countId: "a", unit: "SET", beforeQuantities: { normal: 2, defect: 0, b_grade: 0, obsolete: 0 }, afterQuantities: { normal: 2, defect: 0, b_grade: 0, obsolete: 0 } }],
} as StocktakeHistoryWork;

describe("stocktake work projection", () => {
  it.each(["table", "panel"] as const)("%s 분류 이동은 봉인된 두 분류의 증감과 색상을 각각 표시한다", variant => {
    const row = { ...stocktakeHistoryRows(work)[0], quantity_before: 999, quantity_after: 999,
      request_order_stock: { status: "unavailable", reason: "inconsistent_history" } } as ReturnType<typeof stocktakeHistoryRows>[number];
    render(<StockSnapshotContent log={row} variant={variant} />);
    expect(screen.getByLabelText("정상 1 −1→0")).toBeInTheDocument();
    expect(screen.getByLabelText("불량 0 +1→1")).toBeInTheDocument();
    expect(screen.getByText("−1").style.color).toBe("var(--c-red)");
    expect(screen.getByText("+1").style.color).toBe("var(--c-blue)");
    expect(screen.queryByText("999")).not.toBeInTheDocument();
    expect(screen.queryByText("계산 불가")).not.toBeInTheDocument();
  });
  it("B급·구형과 큰 수량·소수 수량도 독립된 증감으로 표시한다", () => {
    const observed = { ...work, observations: [{ ...work.observations[0],
      beforeQuantities: { normal: 9_999_990, defect: 1.25, b_grade: 0, obsolete: 50 },
      afterQuantities: { normal: 9_999_999, defect: 0.75, b_grade: 50, obsolete: 0 } }] };
    render(<StockSnapshotContent log={stocktakeHistoryRows(observed)[0]} showUnit />);
    expect(screen.getByLabelText("정상 9,999,990 +9→9,999,999 EA")).toBeInTheDocument();
    expect(screen.getByLabelText("불량 1.25 −0.5→0.75 EA")).toBeInTheDocument();
    expect(screen.getByLabelText("B급 0 +50→50 EA")).toBeInTheDocument();
    expect(screen.getByLabelText("구형 50 −50→0 EA")).toBeInTheDocument();
  });
  it("묶음 요약은 유지하고 미변동과 증빙 누락을 구분한다", () => {
    const { rerender } = render(<StockSnapshotContent log={stocktakeWorkSelection(stocktakeHistoryRows(work)[0])} />);
    expect(screen.getByText("변경 1품목 · 변동 없음 1품목")).toBeInTheDocument();
    rerender(<StockSnapshotContent log={stocktakeHistoryRows(work)[1]} />);
    expect(screen.getByText("변동 없음")).toBeInTheDocument();
    const missing = { ...work, observations: [{ ...work.observations[0], beforeQuantities: null }] } as unknown as StocktakeHistoryWork;
    rerender(<StockSnapshotContent log={stocktakeHistoryRows(missing)[0]} />);
    expect(screen.getByText("당시 수량 기록 없음")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
  it("shows all sealed categories including unchanged quantities and units", () => {
    render(<StocktakeHistoryDetail log={stocktakeHistoryRows(work)[1]} />);
    const table = within(screen.getAllByRole("region")[0]).getByRole("table");
    expect(table).toHaveAccessibleName("무변동 품목 당시 반영 수량 (SET)");
    expect(within(table).getAllByRole("row")).toHaveLength(5);
    expect(within(table).getByRole("row", { name: "정상 2 2 0" })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: "구형 0 0 0" })).toBeInTheDocument();
  });
  it("opens the only unchanged member directly for work selection", () => {
    const single = { ...work, itemCount: 1, changedItemCount: 0, unchangedItemCount: 1, observations: [work.observations[1]] };
    render(<StocktakeHistoryDetail log={stocktakeWorkSelection(stocktakeHistoryRows(single)[0])} />);
    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.queryByText("변동 없는 1품목")).not.toBeInTheDocument();
  });
  it("does not invent zero quantities when sealed evidence is missing", () => {
    const missing = { ...work, observations: [{ ...work.observations[0], beforeQuantities: null }] } as unknown as StocktakeHistoryWork;
    render(<StocktakeHistoryDetail log={stocktakeHistoryRows(missing)[0]} />);
    expect(screen.getByText("당시 수량 기록 없음")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  it("keeps every observation including unchanged members and the server search representative", () => {
    const rows = stocktakeHistoryRows(work);
    expect(rows.map(row => row.item_name)).toEqual(["검색 품목", "무변동 품목"]);
    expect(rows[1].item_unit).toBe("SET");
    expect(rows.every(row => row.stocktake_history?.work === work)).toBe(true);
  });
  it("shows classification movement without collapsing it to net zero", () => {
    expect(observationSummary(work.observations[0])).toBe("정상 1 → 0 · 불량 0 → 1");
    expect(observationSummary(work.observations[1])).toBe("변동 없음");
  });
  it("shows the selected item first and folds companions without labelling it stock movement", () => {
    render(<StocktakeHistoryDetail log={stocktakeHistoryRows(work)[0]} />);
    expect(screen.getAllByRole("region")[0]).toHaveAccessibleName("검색 품목 · 조립");
    expect(screen.getByText("함께 반영한 1품목").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("처리 위치")).toBeInTheDocument();
    expect(screen.queryByText("재고 이동")).not.toBeInTheDocument();
  });
});
