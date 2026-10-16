import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();
const deleteMutateAsync = vi.fn();
const resetPinMutateAsync = vi.fn();
const { getEmployees } = vi.hoisted(() => ({ getEmployees: vi.fn() }));

vi.mock("@/lib/api", () => ({ api: { getEmployees } }));

vi.mock("@/lib/queries/useEmployeesQuery", () => ({
  useCreateEmployeeMutation: () => ({ mutateAsync: createMutateAsync }),
  useUpdateEmployeeMutation: () => ({ mutateAsync: updateMutateAsync }),
  useDeleteEmployeeMutation: () => ({ mutateAsync: deleteMutateAsync }),
  useResetEmployeePinMutation: () => ({ mutateAsync: resetPinMutateAsync }),
}));

import { useAdminEmployeesCommands } from "../useAdminEmployeesCommands";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const baseArgs = (over: Partial<Parameters<typeof useAdminEmployeesCommands>[0]> = {}) => ({
  setEmployees: vi.fn(),
  onStatusChange: vi.fn(),
  onError: vi.fn(),
  ...over,
});

const addInput = (over: Partial<any> = {}) => ({
  name: "신입",
  role: "사원",
  department: "조립",
  phone: "",
  warehouse_role: "none",
  department_role: "none",
  assigned_model_slots: [],
  ...over,
});

const E = (id: string, name = "기존"): any => ({
  employee_id: id,
  name,
  department: "조립",
  role: "사원",
  is_active: true,
});

describe("useAdminEmployeesCommands", () => {
  beforeEach(() => {
    createMutateAsync.mockReset();
    updateMutateAsync.mockReset();
    deleteMutateAsync.mockReset();
    resetPinMutateAsync.mockReset();
    getEmployees.mockReset();
  });

  it("add — 이름 비어있으면 onError + null 반환", async () => {
    const args = baseArgs();
    const { result } = renderHook(() => useAdminEmployeesCommands(args), { wrapper });
    let ret: any;
    await act(async () => {
      ret = await result.current.add(addInput({ name: "  " }));
    });
    expect(ret).toBeNull();
    expect(args.onError).toHaveBeenCalledWith("이름은 필수입니다.");
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("add — 성공 시 setEmployees + 생성 반환", async () => {
    const created = E("100", "신입");
    createMutateAsync.mockResolvedValue(created);
    const args = baseArgs();
    const { result } = renderHook(() => useAdminEmployeesCommands(args), { wrapper });
    let ret: any;
    await act(async () => {
      ret = await result.current.add(addInput());
    });
    expect(ret).toEqual(created);
    expect(createMutateAsync.mock.calls[0][0]).not.toHaveProperty("hidden_sidebar_tabs");
    expect(args.setEmployees).toHaveBeenCalled();
    expect(args.onStatusChange).toHaveBeenCalled();
  });

  it("toggleActive — updateMutation.mutateAsync { employeeId, payload }", async () => {
    const updated = { ...E("1"), is_active: false };
    updateMutateAsync.mockResolvedValue(updated);
    const args = baseArgs();
    const { result } = renderHook(() => useAdminEmployeesCommands(args), { wrapper });
    let ret: any;
    await act(async () => {
      ret = await result.current.toggleActive(E("1"));
    });
    expect(updateMutateAsync).toHaveBeenCalledWith({
      employeeId: "1",
      payload: { is_active: false },
    });
    expect(ret).toEqual(updated);
  });

  it("delete — result.deleted === true 일 때 deleted=true 반환", async () => {
    deleteMutateAsync.mockResolvedValue({ result: "deleted" });
    const args = baseArgs();
    const { result } = renderHook(() => useAdminEmployeesCommands(args), { wrapper });
    let ret: any;
    await act(async () => {
      ret = await result.current.delete(E("1"));
    });
    expect(ret).toEqual({ deleted: true, updated: null });
  });

  it("delete — result !== deleted 면 비활성화 처리", async () => {
    deleteMutateAsync.mockResolvedValue({ result: "deactivated" });
    const args = baseArgs();
    const { result } = renderHook(() => useAdminEmployeesCommands(args), { wrapper });
    let ret: any;
    await act(async () => {
      ret = await result.current.delete(E("1"));
    });
    expect(ret?.deleted).toBe(false);
    expect(ret?.updated?.is_active).toBe(false);
  });

  it("resetPin — adminPin 빈 문자열이면 false 반환", async () => {
    const { result } = renderHook(() => useAdminEmployeesCommands(baseArgs()), {
      wrapper,
    });
    let ret: any;
    await act(async () => {
      ret = await result.current.resetPin(E("1"), "  ");
    });
    expect(ret).toBe(false);
    expect(resetPinMutateAsync).not.toHaveBeenCalled();
  });

  it("resetPin — 서버의 기본 PIN·초기화 시각을 대상 직원 상세에 반영한다", async () => {
    const before = { ...E("1"), pin_is_default: false, pin_last_changed: "2026-01-01T00:00:00Z" };
    const other = E("2");
    const refreshed = { ...before, pin_is_default: true, pin_last_changed: "2026-10-07T01:00:00Z" };
    resetPinMutateAsync.mockResolvedValue(undefined);
    getEmployees.mockResolvedValue([refreshed, { ...other, name: "외부 변경" }]);
    const args = baseArgs();
    const { result } = renderHook(() => useAdminEmployeesCommands(args), { wrapper });
    let success: boolean | undefined;
    await act(async () => { success = await result.current.resetPin(before, "0000"); });
    expect(success).toBe(true);
    expect(getEmployees).toHaveBeenCalledWith({ activeOnly: false });
    const update = args.setEmployees.mock.calls[0][0];
    expect(update([before, other])).toEqual([refreshed, other]);
  });

  it("resetPin — 초기화 성공 뒤 조회 실패를 초기화 실패로 보고하지 않는다", async () => {
    resetPinMutateAsync.mockResolvedValue(undefined);
    getEmployees.mockRejectedValue(new Error("조회 불가"));
    const args = baseArgs();
    const { result } = renderHook(() => useAdminEmployeesCommands(args), { wrapper });
    let success: boolean | undefined;
    await act(async () => { success = await result.current.resetPin(E("1"), "0000"); });
    expect(success).toBe(true);
    expect(args.onError).toHaveBeenCalledWith("PIN은 초기화했지만 직원 정보를 다시 불러오지 못했습니다.");
    expect(args.setEmployees).not.toHaveBeenCalled();
    expect(resetPinMutateAsync).toHaveBeenCalledTimes(1);
  });
});
