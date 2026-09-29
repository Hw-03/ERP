import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "../types";
import { IoTargetPicker } from "../IoTargetPicker";

const session = vi.hoisted(() => ({
  department: "조립" as string | null,
  order: [] as { item_id: string; display_order: number }[],
}));

vi.mock("@/app/mes/_components/login/useCurrentOperator", () => ({
  useCurrentOperator: () => ({ employee_id: "emp-1", department: session.department, assigned_model_slots: [] }),
}));

vi.mock("@/lib/queries/useMyItemOrderQuery", () => ({
  useMyItemOrderQuery: () => ({ data: session.order }),
  usePutMyItemOrderMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResetMyItemOrderMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("../useItemOrderDrag", () => ({
  useItemOrderDrag: () => ({ dragId: null, dropTargetId: null, makeHandlers: () => ({}) }),
}));

const items = ["TR", "HR", "AR"].map((code) => ({
  item_id: code,
  item_name: `품목 ${code}`,
  mes_code: `1-${code}-0001`,
  process_type_code: code,
  quantity: 0,
  warehouse_qty: 10,
  locations: [],
  model_slots: [],
  deleted_at: null,
}) as Item);

const baseProps = {
  workType: "warehouse_io" as const,
  subType: "warehouse_to_dept" as const,
  deptIoDirection: null,
  bundleSubType: null,
  targetDepartment: null,
  bomParents: new Set<string>(),
  items,
  productModels: [],
  bundles: [],
  search: "",
  onSearchChange: vi.fn(),
  onAddItem: vi.fn(),
  onRemoveBundles: vi.fn(),
  onAdvance: vi.fn(),
};

function displayedItems(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("tbody tr"), (row) =>
    row.textContent?.match(/품목 (TR|HR|AR)/)?.[1] ?? "",
  );
}

beforeEach(() => {
  session.department = "조립";
  session.order = [];
});

describe("IoTargetPicker 로그인 부서 우선 정렬", () => {
  it.each([
    "warehouse_to_dept", "dept_to_warehouse", "produce", "disassemble", "adjust_in", "adjust_out",
  ] as const)("자동 부서 작업 %s에서 로그인 부서 품목을 먼저 표시한다", (subType) => {
    const { container } = render(<IoTargetPicker {...baseProps} subType={subType} />);
    expect(displayedItems(container)).toEqual(["AR", "TR", "HR"]);
  });

  it("로그인 부서가 바뀌면 목록 순서도 갱신한다", () => {
    const { container, rerender } = render(<IoTargetPicker {...baseProps} />);
    session.department = "고압";
    rerender(<IoTargetPicker {...baseProps} />);
    expect(displayedItems(container)).toEqual(["HR", "TR", "AR"]);
  });

  it("순서 편집도 로그인 부서 우선 순서로 시작한다", () => {
    const { container } = render(<IoTargetPicker {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "순서 편집" }));
    expect(displayedItems(container)).toEqual(["AR", "TR", "HR"]);
  });

  it("직원이 저장한 개인 순서는 부서 순서보다 우선한다", () => {
    session.order = [{ item_id: "HR", display_order: 0 }];
    const { container } = render(<IoTargetPicker {...baseProps} />);
    expect(displayedItems(container)).toEqual(["HR", "AR", "TR"]);
  });

  it("명시적으로 지정한 대상 부서의 정렬 기준을 유지한다", () => {
    const { container } = render(<IoTargetPicker {...baseProps} targetDepartment="고압" />);
    expect(displayedItems(container)).toEqual(["HR", "TR", "AR"]);
  });

  it("로그인 부서가 없으면 기본 생산 부서 순서를 사용한다", () => {
    session.department = null;
    const { container } = render(<IoTargetPicker {...baseProps} />);
    expect(displayedItems(container)).toEqual(["TR", "HR", "AR"]);
  });

  it("부서와 무관한 원자재 입고의 기본 정렬은 유지한다", () => {
    const { container } = render(<IoTargetPicker {...baseProps} workType="receive" subType="receive_supplier" />);
    expect(displayedItems(container)).toEqual(["TR", "HR", "AR"]);
  });
});
