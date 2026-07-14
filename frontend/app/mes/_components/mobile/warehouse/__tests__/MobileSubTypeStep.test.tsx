import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileSubTypeStep } from "../MobileWorkTypeStep";

describe("MobileSubTypeStep", () => {
  it("weights detail selection and destination department at a 4:6 mobile ratio", () => {
    render(
      <MobileSubTypeStep
        workType="warehouse_io"
        subType="warehouse_to_dept"
        fromDepartment="튜브"
        toDepartment="조립"
        deptIoDirection={null}
        onSubTypeChange={vi.fn()}
        onFromDepartmentChange={vi.fn()}
        onToDepartmentChange={vi.fn()}
        onDeptIoDirectionChange={vi.fn()}
      />,
    );

    expect(screen.getByText("세부 작업").parentElement).toHaveClass("basis-[40%]");
    expect(screen.getByText("도착 부서").parentElement).toHaveClass("basis-[60%]");
    expect(screen.getByRole("button", { name: "튜브" })).toHaveClass("min-h-[56px]");
  });

  it("393px 흐름에서 internal_use는 AS·연구 전용 선택지만 렌더한다", () => {
    render(
      <MobileSubTypeStep
        workType="internal_use"
        subType="internal_use_out"
        fromDepartment="조립"
        toDepartment=""
        deptIoDirection={null}
        onSubTypeChange={vi.fn()}
        onFromDepartmentChange={vi.fn()}
        onToDepartmentChange={vi.fn()}
        onDeptIoDirectionChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "AS" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "연구" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "조립" })).not.toBeInTheDocument();
    expect(screen.getByText("사용 부서").parentElement).toHaveClass("basis-[60%]");
    expect(screen.getByRole("button", { name: "AS" }).parentElement).toHaveClass("grid-cols-2");
  });
});
