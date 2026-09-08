import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IoSubType, IoWorkType } from "@/lib/api";
import { MobileSubTypeStep } from "../MobileWorkTypeStep";

describe("MobileSubTypeStep", () => {
  it("창고 수량보정은 모바일에서도 부서 없이 44px 이상 입고·출고 카드만 표시한다", () => {
    render(
      <MobileSubTypeStep
        workType={"warehouse_adjust" as IoWorkType}
        subType={"warehouse_adjust_in" as IoSubType}
        fromDepartment="조립"
        toDepartment="조립"
        deptIoDirection={null}
        onSubTypeChange={vi.fn()}
        onFromDepartmentChange={vi.fn()}
        onToDepartmentChange={vi.fn()}
        onDeptIoDirectionChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "입고" })).toHaveClass("min-h-[64px]");
    expect(screen.getByRole("button", { name: "출고" })).toHaveClass("min-h-[64px]");
    expect(screen.queryByRole("button", { name: "조립" })).not.toBeInTheDocument();
  });

  it("창고 입출고는 부서 선택 없이 두 세부 작업 카드만 표시한다", () => {
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

    expect(screen.getByText("세부 작업").parentElement).toHaveClass("flex-1");
    expect(screen.getByRole("button", { name: /창고 → 부서/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /부서 → 창고/ })).toBeInTheDocument();
    expect(screen.queryByText("도착 부서")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "튜브" })).not.toBeInTheDocument();
  });

  it("부서 입출고는 모바일에서도 대상 부서 선택 없이 방향만 표시한다", () => {
    render(
      <MobileSubTypeStep
        workType="process"
        subType="produce"
        fromDepartment="고압"
        toDepartment="조립"
        deptIoDirection="in"
        onSubTypeChange={vi.fn()}
        onFromDepartmentChange={vi.fn()}
        onToDepartmentChange={vi.fn()}
        onDeptIoDirectionChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "입고" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "출고" })).toBeInTheDocument();
    expect(screen.queryByText("대상 부서")).not.toBeInTheDocument();
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
