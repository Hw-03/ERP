import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryFilterPanel } from "../HistoryFilterPanel";

describe("HistoryFilterPanel", () => {
  it("keeps a concrete department name instead of replacing it with a legacy unknown label", () => {
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

    expect(screen.getByRole("button", { name: "연구소 · 2건" })).toBeInTheDocument();
    expect(screen.queryByText("부서 기록 없음")).not.toBeInTheDocument();
  });
});
