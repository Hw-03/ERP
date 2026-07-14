import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IoSubTypeStep } from "../IoWorkTypeStep";

describe("IoSubTypeStep", () => {
  it("internal use의 AS·연구 선택지를 사용 부서 영역 전체에 2열로 채운다", () => {
    render(
      <IoSubTypeStep
        workType="internal_use"
        subType="internal_use_out"
        fromDepartment=""
        toDepartment=""
        deptIoDirection={null}
        onSubTypeChange={vi.fn()}
        onFromDepartmentChange={vi.fn()}
        onToDepartmentChange={vi.fn()}
        onDeptIoDirectionChange={vi.fn()}
      />,
    );

    const departmentGrid = screen.getByRole("button", { name: "AS" }).parentElement;
    expect(departmentGrid).toHaveClass("grid-cols-2", "flex-1");
    expect(screen.getByRole("button", { name: "연구" }).parentElement).toBe(departmentGrid);
  });
});
