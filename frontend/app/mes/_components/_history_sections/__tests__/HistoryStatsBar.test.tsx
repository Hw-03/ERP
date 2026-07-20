import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HistoryStatsBar } from "../HistoryStatsBar";

describe("HistoryStatsBar", () => {
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
});
