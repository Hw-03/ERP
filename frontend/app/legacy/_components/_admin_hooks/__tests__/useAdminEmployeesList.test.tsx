import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAdminEmployeesList } from "../useAdminEmployeesList";

const E = (id: string, name: string, dept: string, role = ""): any => ({
  employee_id: id,
  name,
  department: dept,
  role,
  is_active: true,
});

describe("useAdminEmployeesList", () => {
  it("초기 상태 — search 빈, deptFilter=ALL", () => {
    const { result } = renderHook(() =>
      useAdminEmployeesList({ employees: [E("1", "가", "조립")] }),
    );
    expect(result.current.search).toBe("");
    expect(result.current.deptFilter).toBe("ALL");
    expect(result.current.visibleItems).toHaveLength(1);
  });

  it("search 적용 시 visibleItems 필터링", () => {
    const employees = [E("1", "김철수", "조립"), E("2", "박영희", "검사")];
    const { result } = renderHook(() => useAdminEmployeesList({ employees }));
    act(() => {
      result.current.setSearch("김");
    });
    expect(result.current.visibleItems).toHaveLength(1);
    expect(result.current.visibleItems[0]!.name).toBe("김철수");
  });

  it("deptFilter 적용 시 부서별 필터링", () => {
    const employees = [E("1", "A", "조립"), E("2", "B", "검사"), E("3", "C", "조립")];
    const { result } = renderHook(() => useAdminEmployeesList({ employees }));
    act(() => {
      result.current.setDeptFilter("조립");
    });
    expect(result.current.visibleItems).toHaveLength(2);
  });

  it("visibleItems — 이름 한글 정렬", () => {
    const employees = [E("1", "박", "조립"), E("2", "김", "조립"), E("3", "이", "조립")];
    const { result } = renderHook(() => useAdminEmployeesList({ employees }));
    expect(result.current.visibleItems.map((e) => e.name)).toEqual(["김", "박", "이"]);
  });

  it("deptOptions — ALL + 중복 제거 + 정렬", () => {
    const employees = [E("1", "a", "조립"), E("2", "b", "검사"), E("3", "c", "조립")];
    const { result } = renderHook(() => useAdminEmployeesList({ employees }));
    expect(result.current.deptOptions).toEqual(["ALL", "검사", "조립"]);
  });

  it("search 가 role 도 매치", () => {
    const employees = [E("1", "A", "조립", "팀장"), E("2", "B", "조립", "사원")];
    const { result } = renderHook(() => useAdminEmployeesList({ employees }));
    act(() => {
      result.current.setSearch("팀장");
    });
    expect(result.current.visibleItems).toHaveLength(1);
    expect(result.current.visibleItems[0]!.name).toBe("A");
  });
});
