import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DepartmentMaster } from "@/lib/api";

const updateDepartment = vi.hoisted(() => vi.fn());

vi.mock("@/lib/queries/useDepartmentsQuery", () => ({
  useUpdateDepartmentMutation: () => ({ mutateAsync: updateDepartment }),
}));

import { useAdminDepartmentsForm } from "../useAdminDepartmentsForm";

const department: DepartmentMaster = {
  id: 1,
  name: "조립",
  display_order: 1,
  is_active: true,
  color_hex: "#2f74e7",
};

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function makeArgs(overrides: Record<string, unknown> = {}) {
  return {
    department,
    adminPin: "0000",
    onStatusChange: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe("useAdminDepartmentsForm", () => {
  beforeEach(() => {
    updateDepartment.mockReset();
  });

  it("owns the selected department baseline and derives dirty from the editable payload", () => {
    const { result } = renderHook(() => useAdminDepartmentsForm(makeArgs()), {
      wrapper: makeWrapper(),
    });

    expect(result.current.form.addName).toBe("");
    expect(result.current.detailForm).toEqual({ name: "조립", color_hex: "#2f74e7" });
    expect(result.current.dirty).toBe(false);

    act(() => {
      result.current.setDetailForm((current: { name: string; color_hex: string }) => ({
        ...current,
        name: "조립 2",
      }));
    });
    expect(result.current.dirty).toBe(true);

    act(() => {
      result.current.setDetailForm((current: { name: string; color_hex: string }) => ({
        ...current,
        name: "조립",
      }));
    });
    expect(result.current.dirty).toBe(false);
  });

  it("shares one in-flight Promise and resolves only after the saved baseline is installed", async () => {
    const pending = deferred<DepartmentMaster>();
    const updated = { ...department, name: "조립 2" };
    updateDepartment.mockReturnValue(pending.promise);
    const args = makeArgs();
    const { result } = renderHook(() => useAdminDepartmentsForm(args), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.setDetailForm((current: { name: string; color_hex: string }) => ({
        ...current,
        name: "조립 2",
      }));
    });

    let first!: Promise<unknown>;
    let duplicate!: Promise<unknown>;
    act(() => {
      first = result.current.save();
      duplicate = result.current.save();
    });

    expect(first).toBeInstanceOf(Promise);
    expect(duplicate).toBe(first);
    expect(updateDepartment).toHaveBeenCalledTimes(1);
    expect(updateDepartment).toHaveBeenCalledWith({
      id: 1,
      payload: { name: "조립 2", color_hex: "#2f74e7", pin: "0000" },
    });
    expect(result.current.dirty).toBe(true);

    let saveResult: unknown;
    await act(async () => {
      pending.resolve(updated);
      saveResult = await first;
    });

    expect(saveResult).toEqual({ status: "saved", department: updated });
    expect(result.current.detailForm).toEqual({ name: "조립 2", color_hex: "#2f74e7" });
    expect(result.current.dirty).toBe(false);
    expect(args.onStatusChange).toHaveBeenCalledWith("'조립 2' 부서 정보를 저장했습니다.");
  });

  it("rejects a failed save and preserves the edited payload and dirty baseline", async () => {
    const failure = new Error("저장 실패");
    updateDepartment.mockRejectedValue(failure);
    const args = makeArgs();
    const { result } = renderHook(() => useAdminDepartmentsForm(args), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.setDetailForm((current: { name: string; color_hex: string }) => ({
        ...current,
        name: "실패할 이름",
      }));
    });

    let save!: Promise<unknown>;
    act(() => {
      save = result.current.save();
    });
    await expect(save).rejects.toBe(failure);

    expect(args.onError).toHaveBeenCalledWith("저장 실패");
    expect(result.current.detailForm.name).toBe("실패할 이름");
    expect(result.current.dirty).toBe(true);
  });

  it("keeps edits made during a save dirty against the newly persisted baseline", async () => {
    const pending = deferred<DepartmentMaster>();
    updateDepartment.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useAdminDepartmentsForm(makeArgs()), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.setDetailForm((current: { name: string; color_hex: string }) => ({
        ...current,
        name: "저장 중 값",
      }));
    });
    let save!: Promise<unknown>;
    act(() => {
      save = result.current.save();
    });

    await act(async () => {
      result.current.setDetailForm((current: { name: string; color_hex: string }) => ({
        ...current,
        name: "후속 편집",
      }));
      pending.resolve({ ...department, name: "저장 중 값" });
      await save;
    });

    expect(result.current.detailForm.name).toBe("후속 편집");
    expect(result.current.dirty).toBe(true);
  });
});
