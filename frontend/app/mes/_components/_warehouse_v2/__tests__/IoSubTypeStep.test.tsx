import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import type { IoSubType, IoWorkType } from "@/lib/api";
import { IoSubTypeStep, IoWorkTypeStep } from "../IoWorkTypeStep";

describe("IoSubTypeStep", () => {
  it("작업 선택 화면에서 다음 방향 카드의 원본 그림 두 장을 미리 요청한다", () => {
    render(
      <IoWorkTypeStep
        workType="receive"
        operator={{ warehouse_role: "primary" }}
        onWorkTypeChange={vi.fn()}
      />,
    );

    for (const direction of ["in", "out"]) {
      expect(document.head.querySelector(
        `link[rel="preload"][as="image"][href="/images/warehouse/dexray-stock-${direction}.webp"]`,
      )).not.toBeNull();
    }
  });

  it("창고 방향 그림을 최적화 대기 없이 원본 주소로 즉시 요청한다", () => {
    render(
      <IoSubTypeStep
        workType="warehouse_io"
        subType="warehouse_to_dept"
        fromDepartment=""
        toDepartment=""
        deptIoDirection={null}
        onSubTypeChange={vi.fn()}
        onFromDepartmentChange={vi.fn()}
        onToDepartmentChange={vi.fn()}
        onDeptIoDirectionChange={vi.fn()}
      />,
    );

    for (const [label, direction] of [["창고 → 부서", "out"], ["부서 → 창고", "in"]] as const) {
      const image = screen.getByRole("button", { name: label }).querySelector("img");
      expect(image).toHaveAttribute("src", `/images/warehouse/dexray-stock-${direction}.webp`);
      expect(image).toHaveAttribute("loading", "eager");
      expect(image).toHaveAttribute("fetchpriority", "high");
      expect(image).not.toHaveAttribute("srcset");
    }
  });

  it("수량보정 방향은 입고·출고 DEXRAY 그림을 제목 뒤에 표시한다", () => {
    render(
      <IoSubTypeStep
        workType="warehouse_adjust"
        subType="warehouse_adjust_in"
        fromDepartment=""
        toDepartment=""
        deptIoDirection="in"
        onSubTypeChange={vi.fn()}
        onFromDepartmentChange={vi.fn()}
        onToDepartmentChange={vi.fn()}
        onDeptIoDirectionChange={vi.fn()}
      />,
    );

    for (const [label, direction] of [["입고", "in"], ["출고", "out"]] as const) {
      const card = screen.getByRole("button", { name: label });
      const image = card.querySelector("img");
      expect(image).not.toBeNull();
      expect(image).toHaveAttribute("src", `/images/warehouse/dexray-stock-${direction}.webp`);
      expect(image).toHaveAttribute("loading", "eager");
      expect(image).toHaveAttribute("fetchpriority", "high");
      expect(within(card).getByText(label).compareDocumentPosition(image!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
    expect(screen.getByRole("button", { name: "입고" })).toHaveAttribute("aria-pressed", "true");
  });

  it("창고 정·부에게만 창고 수량 보정 작업 카드를 표시한다", () => {
    const { rerender } = render(
      <IoWorkTypeStep
        workType="receive"
        operator={{ warehouse_role: "primary" }}
        onWorkTypeChange={vi.fn()}
      />,
    );

    expect(screen.getByText("창고 수량 보정")).toBeInTheDocument();

    rerender(
      <IoWorkTypeStep
        workType="receive"
        operator={{ warehouse_role: "none" }}
        onWorkTypeChange={vi.fn()}
      />,
    );
    expect(screen.queryByText("창고 수량 보정")).not.toBeInTheDocument();
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

  it("부서 입출고는 대상 부서 선택 없이 입고·출고 방향만 표시한다", () => {
    render(
      <IoSubTypeStep
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

    expect(screen.getByRole("button", { name: "생산 입고" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "분해 출고" })).toBeInTheDocument();
    expect(screen.queryByText("대상 부서")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "조립" })).not.toBeInTheDocument();
  });

  it("창고 입출고는 부서 선택 없이 두 작업 카드만 표시한다", () => {
    render(
      <IoSubTypeStep
        workType="warehouse_io"
        subType="warehouse_to_dept"
        fromDepartment="고압"
        toDepartment="조립"
        deptIoDirection={null}
        onSubTypeChange={vi.fn()}
        onFromDepartmentChange={vi.fn()}
        onToDepartmentChange={vi.fn()}
        onDeptIoDirectionChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "창고 → 부서" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "부서 → 창고" })).toBeInTheDocument();
    expect(screen.queryByText("도착 부서")).not.toBeInTheDocument();
    expect(screen.queryByText("출발 부서")).not.toBeInTheDocument();
  });

  it("internal use는 중복 세부 작업 없이 AS·연구 선택지만 전체 높이에 채운다", () => {
    const onToDepartmentChange = vi.fn();
    render(
      <IoSubTypeStep
        workType="internal_use"
        subType="internal_use_out"
        fromDepartment=""
        toDepartment=""
        deptIoDirection={null}
        onSubTypeChange={vi.fn()}
        onFromDepartmentChange={vi.fn()}
        onToDepartmentChange={onToDepartmentChange}
        onDeptIoDirectionChange={vi.fn()}
      />,
    );

    const departmentGrid = screen.getByRole("button", { name: "AS" }).parentElement;
    expect(departmentGrid).toHaveClass("grid-cols-2", "flex-1");
    expect(screen.getByRole("button", { name: "연구" }).parentElement).toBe(departmentGrid);
    expect(screen.queryByText("세부 작업")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AS·연구 사용출고" })).not.toBeInTheDocument();
    expect(departmentGrid?.parentElement?.parentElement).toHaveClass("h-full");
    expect(departmentGrid?.querySelector("img")).toBeNull();
    screen.getByRole("button", { name: "AS" }).click();
    expect(onToDepartmentChange).toHaveBeenCalledWith("AS");
  });
});
