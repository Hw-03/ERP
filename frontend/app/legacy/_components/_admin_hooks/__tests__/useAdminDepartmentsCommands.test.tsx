import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const createDepartmentMock = vi.fn();
const updateDepartmentMock = vi.fn();
const deleteDepartmentMock = vi.fn();
const reorderDepartmentsMock = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    createDepartment: (...a: any[]) => createDepartmentMock(...a),
    updateDepartment: (...a: any[]) => updateDepartmentMock(...a),
    deleteDepartment: (...a: any[]) => deleteDepartmentMock(...a),
    reorderDepartments: (...a: any[]) => reorderDepartmentsMock(...a),
  },
}));

vi.mock("../../DepartmentsContext", () => ({
  useRefreshDepartments: () => async () => undefined,
}));

import { useAdminDepartmentsCommands } from "../useAdminDepartmentsCommands";

const D = (id: number, name = `D${id}`, is_active = true, color_hex = "#1d4ed8"): any => ({
  id,
  name,
  is_active,
  display_order: id,
  color_hex,
});

const baseArgs = (over: Partial<Parameters<typeof useAdminDepartmentsCommands>[0]> = {}) => ({
  departments: [],
  setDepartments: vi.fn(),
  selectedDept: null,
  setSelectedDept: vi.fn(),
  onStatusChange: vi.fn(),
  onError: vi.fn(),
  adminPin: "1234",
  getAddName: () => "",
  onAfterAdd: vi.fn(),
  ...over,
});

describe("useAdminDepartmentsCommands", () => {
  beforeEach(() => {
    createDepartmentMock.mockReset();
    updateDepartmentMock.mockReset();
    deleteDepartmentMock.mockReset();
    reorderDepartmentsMock.mockReset();
  });

  it("add — 빈 이름이면 createDepartment 호출 안 함", () => {
    const args = baseArgs({ getAddName: () => "  " });
    const { result } = renderHook(() => useAdminDepartmentsCommands(args));
    act(() => {
      result.current.add();
    });
    expect(createDepartmentMock).not.toHaveBeenCalled();
  });

  it("add — 이름 있으면 createDepartment 호출 + onAfterAdd + setDepartments", async () => {
    createDepartmentMock.mockResolvedValue(D(5, "신규"));
    const args = baseArgs({ getAddName: () => "신규" });
    const { result } = renderHook(() => useAdminDepartmentsCommands(args));
    act(() => {
      result.current.add();
    });
    await waitFor(() => expect(args.setDepartments).toHaveBeenCalled());
    expect(createDepartmentMock).toHaveBeenCalledTimes(1);
    expect(args.onAfterAdd).toHaveBeenCalled();
    expect(args.onStatusChange).toHaveBeenCalledWith("'신규' 부서를 추가했습니다.");
  });

  it("reorder — items 페이로드 + setDepartments 호출", () => {
    reorderDepartmentsMock.mockResolvedValue(undefined);
    const args = baseArgs({ departments: [D(1), D(2)] });
    const { result } = renderHook(() => useAdminDepartmentsCommands(args));
    act(() => {
      result.current.reorder([D(2), D(1)]);
    });
    expect(args.setDepartments).toHaveBeenCalledTimes(1);
    expect(reorderDepartmentsMock).toHaveBeenCalledWith({
      items: [
        { id: 2, display_order: 0 },
        { id: 1, display_order: 1 },
      ],
      pin: "1234",
    });
  });

  it("updateColor — updateDepartment 호출", async () => {
    updateDepartmentMock.mockResolvedValue(D(1, "D1", true, "#dc2626"));
    const args = baseArgs({ departments: [D(1)] });
    const { result } = renderHook(() => useAdminDepartmentsCommands(args));
    act(() => {
      result.current.updateColor(1, "#dc2626");
    });
    await waitFor(() => expect(args.setDepartments).toHaveBeenCalled());
    expect(updateDepartmentMock).toHaveBeenCalledWith(1, { color_hex: "#dc2626", pin: "1234" });
  });
});
