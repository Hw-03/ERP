import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import type { IoSubType, IoWorkType } from "@/lib/api";
import { IoSubTypeStep, IoWorkTypeStep } from "../IoWorkTypeStep";

describe("IoSubTypeStep", () => {
  it("창고 정·부에게만 수량보정 입출고 작업 카드를 표시한다", () => {
    const { rerender } = render(
      <IoWorkTypeStep
        workType="receive"
        operator={{ warehouse_role: "primary" }}
        onWorkTypeChange={vi.fn()}
      />,
    );

    expect(screen.getByText("수량보정 입출고")).toBeInTheDocument();

    rerender(
      <IoWorkTypeStep
        workType="receive"
        operator={{ warehouse_role: "none" }}
        onWorkTypeChange={vi.fn()}
      />,
    );
    expect(screen.queryByText("수량보정 입출고")).not.toBeInTheDocument();
  });

  it("창고 수량보정은 부서 선택 없이 기존 입고·출고 방향 카드만 표시한다", () => {
    const onDirectionChange = vi.fn();
    render(
      <IoSubTypeStep
        workType={"warehouse_adjust" as IoWorkType}
        subType={"warehouse_adjust_in" as IoSubType}
        fromDepartment="조립"
        toDepartment="조립"
        deptIoDirection={null}
        onSubTypeChange={vi.fn()}
        onFromDepartmentChange={vi.fn()}
        onToDepartmentChange={vi.fn()}
        onDeptIoDirectionChange={onDirectionChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /입고/ }));
    fireEvent.click(screen.getByRole("button", { name: /출고/ }));

    expect(onDirectionChange).toHaveBeenNthCalledWith(1, "in");
    expect(onDirectionChange).toHaveBeenNthCalledWith(2, "out");
    expect(screen.queryByText("대상 부서")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "조립" })).not.toBeInTheDocument();
  });

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
