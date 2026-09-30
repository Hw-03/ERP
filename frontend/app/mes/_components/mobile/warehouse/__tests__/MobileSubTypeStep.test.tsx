import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IoSubType, IoWorkType } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { MaterialDirectionStep } from "../../../_warehouse_v2/MaterialDirectionStep";
import { MobileSubTypeStep } from "../MobileWorkTypeStep";

describe("MobileSubTypeStep", () => {
  it("창고 수량보정은 부서 없이 입고·출고를 선택한다", () => {
    const onDeptIoDirectionChange = vi.fn();
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
        onDeptIoDirectionChange={onDeptIoDirectionChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "입고" }));
    expect(onDeptIoDirectionChange).toHaveBeenLastCalledWith("in");
    fireEvent.click(screen.getByRole("button", { name: "출고" }));
    expect(onDeptIoDirectionChange).toHaveBeenLastCalledWith("out");
    expect(screen.queryByRole("button", { name: "조립" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "입고" }).querySelector("img")).toHaveAttribute("src", "/images/warehouse/dexray-stock-in.webp");
    expect(screen.getByRole("button", { name: "출고" }).querySelector("img")).toHaveAttribute("src", "/images/warehouse/dexray-stock-out.webp");
    expect(screen.getByRole("button", { name: "입고" }).style.background).toBe(tint(LEGACY_COLORS.blue, 7));
    expect(screen.getByRole("button", { name: "출고" }).style.borderColor).toBe(tint(LEGACY_COLORS.red, 25));
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

    expect(screen.queryByText("세부 작업")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /창고 → 부서/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /부서 → 창고/ })).toBeInTheDocument();
    expect(screen.queryByText("도착 부서")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "튜브" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "창고 → 부서" }).querySelector("img")).toHaveAttribute("src", "/images/warehouse/dexray-stock-out.webp");
    expect(screen.getByRole("button", { name: "부서 → 창고" }).querySelector("img")).toHaveAttribute("src", "/images/warehouse/dexray-stock-in.webp");
    expect(screen.getByRole("button", { name: "창고 → 부서" }).style.background).toBe(tint(LEGACY_COLORS.red, 7));
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
    expect(screen.getByRole("button", { name: "입고" }).querySelector("img")).toHaveAttribute("src", "/images/warehouse/dexray-stock-in.webp");
    expect(screen.getByRole("button", { name: "출고" }).querySelector("img")).toHaveAttribute("src", "/images/warehouse/dexray-stock-out.webp");
    expect(screen.getByRole("button", { name: "입고" }).style.background).toBe(tint(LEGACY_COLORS.blue, 16));
    expect(screen.getByRole("button", { name: "출고" }).style.background).toBe(tint(LEGACY_COLORS.red, 7));
    expect(screen.queryByText("방향")).not.toBeInTheDocument();
    expect(screen.queryByText("대상 부서")).not.toBeInTheDocument();
  });

  it("393px 흐름에서 internal_use는 AS·연구 전용 선택지만 렌더한다", () => {
    const onToDepartmentChange = vi.fn();
    render(
      <MobileSubTypeStep
        workType="internal_use"
        subType="internal_use_out"
        fromDepartment="조립"
        toDepartment=""
        deptIoDirection={null}
        onSubTypeChange={vi.fn()}
        onFromDepartmentChange={vi.fn()}
        onToDepartmentChange={onToDepartmentChange}
        onDeptIoDirectionChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "AS" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "연구" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "조립" })).not.toBeInTheDocument();
    expect(screen.queryByText("세부 작업")).not.toBeInTheDocument();
    expect(screen.queryByText("사용 부서")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AS·연구 사용출고" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AS" }).parentElement).toHaveClass("grid-cols-1");
    expect(screen.getByRole("button", { name: "AS" }).querySelector("img")).toHaveAttribute("src", "/images/warehouse/dexray-as-service.webp");
    expect(screen.getByRole("button", { name: "연구" }).querySelector("img")).toHaveAttribute("src", "/images/warehouse/dexray-research-board.webp");
    fireEvent.click(screen.getByRole("button", { name: "연구" }));
    expect(onToDepartmentChange).toHaveBeenCalledWith("연구");
  });
});

it("원자재 입출고 방향에도 PC와 같은 덱스레이를 표시한다", () => {
  const onSelect = vi.fn();
  render(<MaterialDirectionStep selected={null} onSelect={onSelect} mobilePresentation />);

  expect(screen.getByRole("button", { name: "입고" }).querySelector("img")).toHaveAttribute("src", "/images/warehouse/dexray-stock-in.webp");
  expect(screen.getByRole("button", { name: "출고" }).querySelector("img")).toHaveAttribute("src", "/images/warehouse/dexray-stock-out.webp");
  expect(screen.getByRole("button", { name: "입고" }).style.background).toBe(tint(LEGACY_COLORS.blue, 7));
  expect(screen.getByRole("button", { name: "출고" }).style.borderColor).toBe(tint(LEGACY_COLORS.red, 25));
  fireEvent.click(screen.getByRole("button", { name: "출고" }));
  expect(onSelect).toHaveBeenCalledWith("outbound_supplier");
});
