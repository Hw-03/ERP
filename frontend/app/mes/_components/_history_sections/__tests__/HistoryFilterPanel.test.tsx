import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryFilterPanel } from "../HistoryFilterPanel";

describe("HistoryFilterPanel", () => {
  it("shows department names without transaction counts", () => {
    render(
      <HistoryFilterPanel
        open
        departmentCounts={{ 연구소: 2 }}
        selectedDepts={[]}
        toggleDept={vi.fn()}
        clearDepts={vi.fn()}
        models={[]}
        selectedModels={[]}
        toggleModel={vi.fn()}
        clearModels={vi.fn()}
        selectedOps={[]}
        toggleOp={vi.fn()}
        clearOps={vi.fn()}
        onResetAll={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "연구소" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "연구소 · 2건" })).not.toBeInTheDocument();
    expect(screen.queryByText("부서 기록 없음")).not.toBeInTheDocument();
  });

  it("uses five parent work-type filters", () => {
    render(
      <HistoryFilterPanel
        open
        departmentCounts={{}}
        selectedDepts={[]}
        toggleDept={vi.fn()}
        clearDepts={vi.fn()}
        models={[]}
        selectedModels={[]}
        toggleModel={vi.fn()}
        clearModels={vi.fn()}
        selectedOps={[]}
        toggleOp={vi.fn()}
        clearOps={vi.fn()}
        onResetAll={vi.fn()}
      />,
    );

    expect(screen.getByText("작업 종류")).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(expect.arrayContaining([
      "전체", "창고 입출고", "부서 입출고", "불량", "품목 전환", "출하",
    ]));
    expect(screen.queryByRole("button", { name: "원자재 입고" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "출하 준비" })).not.toBeInTheDocument();
  });

  it("sends parent operation API keys when work-type filters are clicked", () => {
    const toggleOp = vi.fn();
    render(
      <HistoryFilterPanel
        open
        departmentCounts={{}}
        selectedDepts={[]}
        toggleDept={vi.fn()}
        clearDepts={vi.fn()}
        models={[]}
        selectedModels={[]}
        toggleModel={vi.fn()}
        clearModels={vi.fn()}
        selectedOps={[]}
        toggleOp={toggleOp}
        clearOps={vi.fn()}
        onResetAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "창고 입출고" }));
    fireEvent.click(screen.getByRole("button", { name: "부서 입출고" }));

    expect(toggleOp).toHaveBeenNthCalledWith(1, "warehouse");
    expect(toggleOp).toHaveBeenNthCalledWith(2, "process");
  });
});
