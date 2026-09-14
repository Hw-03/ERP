import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DefectCategoryFilters } from "../DefectCategoryFilters";

describe("DefectCategoryFilters", () => {
  it("uses dashboard department order and keeps unknown departments at the end", () => {
    render(<DefectCategoryFilters departments={["기타", "조립", "튜닝", "고압", "창고", "출하", "진공", "튜브"]} models={["DX3000", "COCOON", "ADX4000W"]} currentDept="조립" selectedDepartments={[]} selectedModels={[]} selectedProcessSteps={[]} onDepartmentsChange={vi.fn()} onModelsChange={vi.fn()} onProcessStepsChange={vi.fn()} onResetCategoryFilters={vi.fn()} />);
    expect(within(screen.getByRole("group", { name: "부서 구분" })).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "전체", "창고", "튜브", "고압", "진공", "튜닝", "조립", "출하", "기타", "내 부서",
    ]);
    expect(within(screen.getByRole("group", { name: "모델 구분" })).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "전체", "DX3000", "COCOON", "ADX4000W",
    ]);
  });

  it("keeps the dashboard process filters in two columns", () => {
    render(<DefectCategoryFilters departments={[]} models={[]} currentDept="조립" selectedDepartments={[]} selectedModels={[]} selectedProcessSteps={[]} onDepartmentsChange={vi.fn()} onModelsChange={vi.fn()} onProcessStepsChange={vi.fn()} onResetCategoryFilters={vi.fn()} />);
    const grid = within(screen.getByRole("group", { name: "공정 구분" })).getByRole("button", { name: "원자재" }).parentElement;
    expect(grid).toHaveClass("grid-cols-2");
    expect(grid).not.toHaveClass("sm:grid-cols-3", "xl:grid-cols-3");
    expect(screen.queryByRole("button", { name: "미분류" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "불용" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "전체 초기화" })).not.toBeInTheDocument();
  });

  it("is reusable without the list-only auxiliary row and reports category changes", () => {
    const onDepartmentsChange = vi.fn();
    const onModelsChange = vi.fn();
    const onProcessStepsChange = vi.fn();
    const onResetCategoryFilters = vi.fn();
    render(<DefectCategoryFilters departments={["조립"]} models={["DX-1"]} currentDept="조립" selectedDepartments={[]} selectedModels={[]} selectedProcessSteps={[]} onDepartmentsChange={onDepartmentsChange} onModelsChange={onModelsChange} onProcessStepsChange={onProcessStepsChange} onResetCategoryFilters={onResetCategoryFilters} />);
    fireEvent.click(within(screen.getByRole("group", { name: "부서 구분" })).getByRole("button", { name: "조립" }));
    fireEvent.click(within(screen.getByRole("group", { name: "모델 구분" })).getByRole("button", { name: "DX-1" }));
    fireEvent.click(within(screen.getByRole("group", { name: "공정 구분" })).getByRole("button", { name: "원자재" }));
    expect(screen.queryByRole("button", { name: "전체 초기화" })).not.toBeInTheDocument();
    expect(onDepartmentsChange).toHaveBeenCalledWith(["조립"]);
    expect(onModelsChange).toHaveBeenCalledWith(["DX-1"]);
    expect(onProcessStepsChange).toHaveBeenCalledWith(["R"]);
    expect(onResetCategoryFilters).not.toHaveBeenCalled();
    expect(screen.queryByText("격리자")).not.toBeInTheDocument();
  });
});
