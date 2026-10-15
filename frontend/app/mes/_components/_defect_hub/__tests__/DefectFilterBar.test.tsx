import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DefectFilterBar } from "../DefectFilterBar";

describe("DefectFilterBar", () => {
  it("PC는 기록이 없는 기본 부서도 표시하고 튜닝을 선택할 수 있다", () => {
    const onDepartmentsChange = vi.fn();
    render(<DefectFilterBar {...baseProps} departments={["조립", "과거 부서"]} selectedDepartments={[]} onDepartmentsChange={onDepartmentsChange} />);
    fireEvent.click(screen.getByRole("button", { name: "필터 펼치기" }));
    const departments = within(screen.getByRole("group", { name: "부서 구분" }));
    expect(departments.getByRole("button", { name: "튜닝", exact: true })).toBeEnabled();
    fireEvent.click(departments.getByRole("button", { name: "튜닝", exact: true }));
    expect(onDepartmentsChange).toHaveBeenCalledWith(["튜닝"]);
    expect(departments.getByRole("button", { name: "과거 부서", exact: true })).toBeInTheDocument();
  });
  it("접힘과 펼침에서 같은 필터 컨테이너와 접근성 연결을 유지한다", () => {
    render(<DefectFilterBar {...baseProps} />);
    const toggle = screen.getByRole("button", { name: "필터 펼치기" });
    const controlsId = toggle.getAttribute("aria-controls")!;
    const controls = document.getElementById(controlsId);
    expect(controls).not.toBeNull();
    expect(controls).toHaveAttribute("hidden");
    fireEvent.click(toggle);
    expect(document.getElementById(controlsId)).toBe(controls);
    expect(controls).not.toHaveAttribute("hidden");
    fireEvent.click(toggle);
    expect(document.getElementById(controlsId)).toBe(controls);
    expect(controls).toHaveAttribute("hidden");
  });
  it("PC 필터는 고정된 조건을 요약하며 접힌 상태로 시작한다", () => {
    const onFilterLockedChange = vi.fn();
    render(<DefectFilterBar {...baseProps} filterLocked onFilterLockedChange={onFilterLockedChange} selectedDepartments={["조립"]} />);
    const toggle = screen.getByRole("button", { name: "필터 펼치기" });
    expect(toggle.parentElement).toHaveTextContent("조립");
    expect(toggle.parentElement).toHaveTextContent("필터 고정");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    const controls = document.getElementById(toggle.getAttribute("aria-controls")!);
    expect(controls).toContainElement(screen.getByRole("checkbox", { name: "필터 고정" }));
    expect(screen.getByRole("checkbox", { name: "필터 고정" })).toBeChecked();
    fireEvent.click(toggle);
    expect(onFilterLockedChange).not.toHaveBeenCalled();
  });
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

  it("starts mobile filters collapsed, summarizes selections, and preserves them when toggled", () => {
    const onFilterLockedChange = vi.fn();
    render(
      <DefectFilterBar
        {...baseProps}
        mobilePresentation
        actorScope="mine"
        sort="oldest"
        filterLocked
        onFilterLockedChange={onFilterLockedChange}
        selectedDepartments={["조립"]}
        models={["SOLO"]}
        selectedModels={["SOLO"]}
        selectedProcessSteps={["F"]}
      />,
    );

    const toggle = screen.getByRole("button", { name: "필터 펼치기" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("조립");
    expect(toggle).toHaveTextContent("SOLO");
    expect(toggle).toHaveTextContent("공정완료");
    expect(toggle).toHaveTextContent("내가 격리");
    expect(screen.queryByRole("group", { name: "모델 구분" })).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "필터 접기" })).toHaveAttribute("aria-expanded", "true");
    expect(within(screen.getByRole("group", { name: "모델 구분" })).getByRole("button", { name: "SOLO" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "필터 고정" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "필터 접기" }));
    expect(onFilterLockedChange).not.toHaveBeenCalled();
  });

  it("summarizes multiple mobile selections without listing every chip", () => {
    render(<DefectFilterBar {...baseProps} mobilePresentation selectedDepartments={["튜브", "조립"]} selectedModels={[]} selectedProcessSteps={[]} />);
    expect(screen.getByRole("button", { name: "필터 펼치기" })).toHaveTextContent("부서 튜브 외 1");
  });

  it("shows the all-filter state even when its settings are locked", () => {
    render(<DefectFilterBar {...baseProps} mobilePresentation filterLocked selectedDepartments={[]} selectedModels={[]} selectedProcessSteps={[]} />);
    const summary = screen.getByRole("button", { name: "필터 펼치기" });
    expect(summary).toHaveTextContent("전체");
    expect(summary).toHaveTextContent("필터 고정");
  });

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

    fireEvent.click(screen.getByRole("button", { name: "필터 펼치기" }));
    const departmentCard = screen.getByRole("group", { name: "부서 구분" });
    const modelCard = screen.getByRole("group", { name: "모델 구분" });
    const processCard = screen.getByRole("group", { name: "공정 구분" });
    expect(within(departmentCard).queryByRole("button", { name: "내 부서" })).not.toBeInTheDocument();
    expect(within(modelCard).queryByRole("button", { name: "미분류" })).not.toBeInTheDocument();
    expect(within(processCard).getByRole("button", { name: "공정완료" })).toBeInTheDocument();

    fireEvent.click(within(departmentCard).getByRole("button", { name: "조립" }));
    fireEvent.click(within(modelCard).getByRole("button", { name: "DX-1" }));
    fireEvent.click(within(processCard).getByRole("button", { name: "중간공정" }));

    expect(onDepartmentsChange).toHaveBeenCalledWith(["튜브", "조립"]);
    expect(onModelsChange).toHaveBeenCalledWith(["DX-1"]);
    expect(onProcessStepsChange).toHaveBeenCalledWith(["R", "A"]);
  });

  it.each([false, true])("hides only the department shortcut and keeps department and actor choices (mobile=%s)", (mobilePresentation) => {
    const onDepartmentsChange = vi.fn();
    const onActorScopeChange = vi.fn();
    render(<DefectFilterBar {...baseProps} mobilePresentation={mobilePresentation} departments={["튜브", "조립"]} selectedDepartments={["튜브"]} onDepartmentsChange={onDepartmentsChange} onActorScopeChange={onActorScopeChange} />);
    fireEvent.click(screen.getByRole("button", { name: "필터 펼치기" }));

    const departmentCard = screen.getByRole("group", { name: "부서 구분" });
    expect(within(departmentCard).queryByRole("button", { name: "내 부서" })).not.toBeInTheDocument();
    expect(within(departmentCard).getAllByRole("button").map((button) => button.textContent)).toEqual(mobilePresentation ? ["전체", "튜브", "조립"] : ["전체", "창고", "튜브", "고압", "진공", "튜닝", "조립", "출하"]);
    fireEvent.click(within(departmentCard).getByRole("button", { name: "조립" }));
    expect(onDepartmentsChange).toHaveBeenCalledWith(["튜브", "조립"]);
    fireEvent.click(screen.getByRole("button", { name: "내가 격리" }));
    expect(onActorScopeChange).toHaveBeenCalledWith("mine");
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

    fireEvent.click(screen.getByRole("button", { name: "필터 펼치기" }));
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

    fireEvent.click(screen.getByRole("button", { name: "필터 펼치기" }));
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
