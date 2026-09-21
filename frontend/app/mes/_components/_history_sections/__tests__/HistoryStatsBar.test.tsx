import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HistoryStatsBar } from "../HistoryStatsBar";

describe("HistoryStatsBar", () => {
  it("keeps the unfiltered period heading while the totals are pending", () => {
    render(<HistoryStatsBar baseline={null} currentCount={null} loading loadingDisplay="skeleton" periodLabel="이번달" hasListFilters={false} />);
    expect(screen.queryByText("목록 조건")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("집계 중")).toHaveLength(4);
  });
  it("uses fixed neutral placeholders instead of ellipsis during desktop loading", () => {
    render(
      <HistoryStatsBar
        baseline={null}
        currentCount={null}
        loading
        loadingDisplay="skeleton"
        periodLabel="이번달"
      />,
    );

    expect(screen.queryByText(/…/)).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("집계 중")).toHaveLength(5);
    expect(screen.getByText("창고")).toBeInTheDocument();
    expect(screen.getByText("부서")).toBeInTheDocument();
    expect(screen.getByText("수량조정")).toBeInTheDocument();
    for (const label of ["창고", "부서", "수량조정"]) {
      const card = screen.getByText(label).parentElement!;
      expect(card.querySelector('[aria-label="집계 중"]')).toHaveClass("h-6", "motion-safe:animate-pulse");
      expect(card.querySelector("svg")).toBeInTheDocument();
    }
    expect(screen.getByText("창고 재고가 움직인 작업")).toBeInTheDocument();
    expect(screen.getByText("부서 재고가 움직인 작업")).toBeInTheDocument();
    expect(screen.getByText("재고 수량을 직접 조정한 거래")).toBeInTheDocument();
  });

  it("separates current list conditions from period summary counts", () => {
    render(
      <HistoryStatsBar
        baseline={{
          total: 437,
          warehouseCount: 67,
          deptCount: 336,
          adjustCount: 12,
          departmentCounts: {},
        }}
        currentCount={100}
        loading={false}
        periodLabel="이번달"
      />,
    );

    expect(screen.getByText("목록 조건")).toBeInTheDocument();
    expect(screen.getByText("100건")).toBeInTheDocument();
    expect(screen.getByText("전체 437건")).toBeInTheDocument();
    expect(screen.queryByText("표시 전용")).not.toBeInTheDocument();
  });

  it("uses a flat surface without a card elevation", () => {
    const { container } = render(
      <HistoryStatsBar
        baseline={null}
        currentCount={null}
        loading={false}
        periodLabel="이번 달"
      />,
    );

    expect(container.querySelector("section")).toHaveClass("desktop-flat-surface");
  });
});
