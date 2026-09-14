import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DefectFilterBar } from "../DefectFilterBar";

describe("DefectFilterBar", () => {
  const baseProps = {
    scope: "my" as const,
    actorScope: "all" as const,
    sort: "newest" as const,
    filterLocked: false,
    onScopeChange: vi.fn(),
    onActorScopeChange: vi.fn(),
    onSortChange: vi.fn(),
    onFilterLockedChange: vi.fn(),
    currentDept: "조립",
  };

  it("renders category cards and exposes same-group OR selection callbacks", () => {
    const onDepartmentsChange = vi.fn();
    const onModelsChange = vi.fn();
    const onProcessStepsChange = vi.fn();
    render(
      <DefectFilterBar
        {...baseProps}
        departments={["튜브", "조립"]}
        selectedDepartments={["튜브"]}
        onDepartmentsChange={onDepartmentsChange}
        models={["DX-1"]}
        selectedModels={[]}
        onModelsChange={onModelsChange}
        selectedProcessSteps={["R"]}
        onProcessStepsChange={onProcessStepsChange}
      />,
    );

    const departmentCard = screen.getByRole("group", { name: "부서 구분" });
    const modelCard = screen.getByRole("group", { name: "모델 구분" });
    const processCard = screen.getByRole("group", { name: "공정 구분" });
    expect(within(departmentCard).getByRole("button", { name: "내 부서" })).toBeInTheDocument();
    expect(within(modelCard).queryByRole("button", { name: "미분류" })).not.toBeInTheDocument();
    expect(within(processCard).getByRole("button", { name: "공정완료" })).toBeInTheDocument();

    fireEvent.click(within(departmentCard).getByRole("button", { name: "조립" }));
    fireEvent.click(within(modelCard).getByRole("button", { name: "DX-1" }));
    fireEvent.click(within(processCard).getByRole("button", { name: "중간공정" }));

    expect(onDepartmentsChange).toHaveBeenCalledWith(["튜브", "조립"]);
    expect(onModelsChange).toHaveBeenCalledWith(["DX-1"]);
    expect(onProcessStepsChange).toHaveBeenCalledWith(["R", "A"]);
  });

  it("resets only the three category selections and keeps search out of the filter bar", () => {
    const onDepartmentsChange = vi.fn();
    const onModelsChange = vi.fn();
    const onProcessStepsChange = vi.fn();
    const { container } = render(
      <DefectFilterBar
        {...baseProps}
        departments={["조립"]}
        selectedDepartments={["조립"]}
        onDepartmentsChange={onDepartmentsChange}
        models={["DX-1"]}
        selectedModels={["DX-1", "미분류"]}
        onModelsChange={onModelsChange}
        selectedProcessSteps={["F"]}
        onProcessStepsChange={onProcessStepsChange}
      />,
    );

    expect(container.querySelector('input[type="search"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "전체 초기화" }));
    expect(onDepartmentsChange).toHaveBeenCalledWith([]);
    expect(onModelsChange).toHaveBeenCalledWith([]);
    expect(onProcessStepsChange).toHaveBeenCalledWith([]);
    expect(baseProps.onActorScopeChange).not.toHaveBeenCalled();
    expect(baseProps.onSortChange).not.toHaveBeenCalled();
  });

  it("renders the filter lock checkbox after the sort select and reports changes", () => {
    const onFilterLockedChange = vi.fn();
    const { rerender } = render(
      <DefectFilterBar
        scope="my"
        actorScope="all"
        sort="newest"
        filterLocked={false}
        onScopeChange={vi.fn()}
        onActorScopeChange={vi.fn()}
        onSortChange={vi.fn()}
        onFilterLockedChange={onFilterLockedChange}
        currentDept="조립"
      />,
    );

    const sortSelect = screen.getByRole("combobox");
    const checkbox = screen.getByRole("checkbox", { name: "필터 고정" });
    expect(sortSelect.compareDocumentPosition(checkbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(onFilterLockedChange).toHaveBeenCalledWith(true);

    rerender(
      <DefectFilterBar
        scope="my"
        actorScope="all"
        sort="newest"
        filterLocked
        onScopeChange={vi.fn()}
        onActorScopeChange={vi.fn()}
        onSortChange={vi.fn()}
        onFilterLockedChange={onFilterLockedChange}
        currentDept="조립"
      />,
    );
    expect(screen.getByRole("checkbox", { name: "필터 고정" })).toBeChecked();
  });
});
