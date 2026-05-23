import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAdminDepartmentsList } from "../useAdminDepartmentsList";

const D = (id: number, name = `D${id}`, is_active = true): any => ({
  id,
  name,
  is_active,
  display_order: id,
});

describe("useAdminDepartmentsList", () => {
  it("빈 입력 처리", () => {
    const { result } = renderHook(() => useAdminDepartmentsList({ departments: [] }));
    expect(result.current.items).toEqual([]);
    expect(result.current.visibleItems).toEqual([]);
  });

  it("pass-through", () => {
    const depts = [D(1), D(2)];
    const { result } = renderHook(() => useAdminDepartmentsList({ departments: depts }));
    expect(result.current.items).toEqual(depts);
    expect(result.current.visibleItems).toEqual(depts);
  });

  it("입력 변경 시 동기화", () => {
    const { result, rerender } = renderHook(
      ({ departments }) => useAdminDepartmentsList({ departments }),
      { initialProps: { departments: [D(1)] } },
    );
    expect(result.current.visibleItems).toHaveLength(1);
    rerender({ departments: [D(1), D(2), D(3)] });
    expect(result.current.visibleItems).toHaveLength(3);
  });

  it("같은 reference 시 visibleItems 메모이즈", () => {
    const depts = [D(1)];
    const { result, rerender } = renderHook(
      ({ departments }) => useAdminDepartmentsList({ departments }),
      { initialProps: { departments: depts } },
    );
    const first = result.current.visibleItems;
    rerender({ departments: depts });
    expect(result.current.visibleItems).toBe(first);
  });
});
