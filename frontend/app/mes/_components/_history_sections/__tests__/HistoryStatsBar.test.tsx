import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HistoryStatsBar } from "../HistoryStatsBar";

describe("HistoryStatsBar", () => {
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
