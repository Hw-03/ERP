import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revision: null as number | null,
  models: [],
  getItems: vi.fn(),
  getEmployees: vi.fn(),
  getDepartments: vi.fn(),
  getAllBOM: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getItems: mocks.getItems,
    getEmployees: mocks.getEmployees,
    getDepartments: mocks.getDepartments,
    getAllBOM: mocks.getAllBOM,
  },
}));

vi.mock("@/lib/queries/useModelsQuery", () => ({
  useModelsQuery: () => ({ data: mocks.models }),
}));

vi.mock("@/lib/queries/realtime", () => ({
  useRealtimeRevision: () => mocks.revision,
}));

import { useAdminBootstrap } from "../useAdminBootstrap";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("useAdminBootstrap realtime refresh", () => {
  beforeEach(() => {
    mocks.revision = null;
    mocks.getItems.mockReset().mockResolvedValue([]);
    mocks.getEmployees.mockReset().mockResolvedValue([]);
    mocks.getDepartments.mockReset().mockResolvedValue([]);
    mocks.getAllBOM.mockReset().mockResolvedValue([]);
  });

  it("최초 응답 전에는 빈 목록과 구별되는 로딩 상태를 유지한다", async () => {
    const pending = deferred<unknown[]>();
    mocks.getEmployees.mockReturnValue(pending.promise);
    const onError = vi.fn();
    const { result } = renderHook(() => useAdminBootstrap({ unlocked: true, globalSearch: "", onError }));
    expect(result.current.loading).toBe(true);
    expect(result.current.hasData).toBe(false);
    await act(async () => { pending.resolve([]); await pending.promise; });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasData).toBe(true);
    expect(result.current.loadError).toBeNull();
  });

  it("첫 오류는 빈 성공이 아니며 명시적 재시도 뒤 빈 성공으로 복구한다", async () => {
    mocks.getEmployees.mockRejectedValueOnce(new Error("직원 조회 실패"));
    const onError = vi.fn();
    const { result } = renderHook(() => useAdminBootstrap({ unlocked: true, globalSearch: "", onError }));
    await waitFor(() => expect(result.current.loadError).toBe("직원 조회 실패"));
    expect(result.current.hasData).toBe(false);
    expect(result.current.loading).toBe(false);
    await act(async () => { await result.current.loadData(); });
    expect(result.current.loadError).toBeNull();
    expect(result.current.hasData).toBe(true);
    expect(result.current.employees).toEqual([]);
    expect(mocks.getEmployees).toHaveBeenCalledTimes(2);
  });

  it("refreshes items, department candidates and all BOM rows when the database revision changes", async () => {
    const onError = vi.fn();
    const { rerender } = renderHook(
      () => useAdminBootstrap({ unlocked: true, globalSearch: "", onError }),
    );

    await waitFor(() => {
      expect(mocks.getItems).toHaveBeenCalledTimes(1);
      expect(mocks.getAllBOM).toHaveBeenCalledTimes(1);
      expect(mocks.getEmployees).toHaveBeenCalledTimes(1);
      expect(mocks.getDepartments).toHaveBeenCalledTimes(1);
    });

    mocks.revision = 1;
    rerender();

    await waitFor(() => {
      expect(mocks.getItems).toHaveBeenCalledTimes(2);
      expect(mocks.getAllBOM).toHaveBeenCalledTimes(2);
    });
    expect(mocks.getEmployees).toHaveBeenCalledTimes(1);
    expect(mocks.getDepartments).toHaveBeenCalledTimes(2);
  });

  it("부서 변경 revision은 다른 열린 편집 후보를 최신 표시명으로 갱신한다", async () => {
    const original = [{ id: 1, name: "조립", display_name: "조립" }];
    const current = [{ id: 1, name: "조립", display_name: "조립팀" }];
    mocks.getDepartments.mockResolvedValueOnce(original).mockResolvedValueOnce(current);
    const onError = vi.fn();
    const { result, rerender } = renderHook(() => useAdminBootstrap({ unlocked: true, globalSearch: "", onError }));
    await waitFor(() => expect(result.current.departments).toEqual(original));
    mocks.revision = 1;
    rerender();
    await waitFor(() => expect(result.current.departments).toEqual(current));
    expect(mocks.getDepartments).toHaveBeenCalledTimes(2);
    expect(mocks.getEmployees).toHaveBeenCalledTimes(1);
  });

  it("늦은 최초 부서 응답은 revision으로 받은 최신 후보를 되돌리지 않는다", async () => {
    const older = deferred<unknown[]>();
    const original = [{ id: 1, name: "조립", display_name: "조립" }];
    const current = [{ id: 1, name: "조립", display_name: "조립팀" }];
    mocks.getDepartments.mockReturnValueOnce(older.promise).mockResolvedValueOnce(current);
    const onError = vi.fn();
    const { result, rerender } = renderHook(() => useAdminBootstrap({ unlocked: true, globalSearch: "", onError }));
    await waitFor(() => expect(mocks.getDepartments).toHaveBeenCalledTimes(1));
    mocks.revision = 1;
    rerender();
    await waitFor(() => expect(result.current.departments).toEqual(current));
    await act(async () => { older.resolve(original); await older.promise; });
    expect(result.current.departments).toEqual(current);
    expect(result.current.hasData).toBe(true);
  });

  it("부서 갱신 실패는 이전 후보와 기존 편집자 목록을 보존한다", async () => {
    const original = [{ id: 1, name: "조립", display_name: "조립" }];
    mocks.getDepartments.mockResolvedValueOnce(original).mockRejectedValueOnce(new Error("부서 후보 조회 실패"));
    const onError = vi.fn();
    const { result, rerender } = renderHook(() => useAdminBootstrap({ unlocked: true, globalSearch: "", onError }));
    await waitFor(() => expect(result.current.departments).toEqual(original));
    mocks.revision = 1;
    rerender();
    await waitFor(() => expect(onError).toHaveBeenCalledWith("부서 후보 조회 실패"));
    expect(result.current.departments).toEqual(original);
    expect(mocks.getEmployees).toHaveBeenCalledTimes(1);
  });

  it("명시적 직원 재조회는 전체 직원 API 결과로 공유 목록을 교체한다", async () => {
    const original = [{ employee_id: "emp-1", assigned_model_slots: [3, 7, 1] }];
    const refreshed = [{ employee_id: "emp-1", assigned_model_slots: [3, 1] }];
    mocks.getEmployees.mockResolvedValueOnce(original).mockResolvedValueOnce(refreshed);
    const onError = vi.fn();
    const { result } = renderHook(
      () => useAdminBootstrap({ unlocked: true, globalSearch: "", onError }),
    );
    await waitFor(() => expect(result.current.employees).toEqual(original));

    await act(async () => { await result.current.refreshEmployees(); });

    expect(mocks.getEmployees).toHaveBeenCalledTimes(2);
    expect(mocks.getEmployees).toHaveBeenLastCalledWith({ activeOnly: false });
    expect(result.current.employees).toEqual(refreshed);
  });

  it("삭제 후 재조회보다 늦게 끝난 초기 직원 응답은 최신 담당 모델을 되돌리지 않는다", async () => {
    const older = deferred<unknown[]>();
    const original = [{ employee_id: "emp-1", assigned_model_slots: [3, 7, 1] }];
    const refreshed = [{ employee_id: "emp-1", assigned_model_slots: [3, 1] }];
    mocks.getEmployees.mockReturnValueOnce(older.promise).mockResolvedValueOnce(refreshed);
    const onError = vi.fn();
    const { result } = renderHook(
      () => useAdminBootstrap({ unlocked: true, globalSearch: "", onError }),
    );
    await waitFor(() => expect(mocks.getEmployees).toHaveBeenCalledTimes(1));

    await act(async () => { await result.current.refreshEmployees(); });
    expect(result.current.employees).toEqual(refreshed);

    await act(async () => {
      older.resolve(original);
      await older.promise;
    });
    expect(result.current.employees).toEqual(refreshed);
  });

  it("ignores an older item response that finishes after a newer revision response", async () => {
    const older = deferred<unknown[]>();
    const newer = deferred<unknown[]>();
    mocks.getItems
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const onError = vi.fn();
    const { result, rerender } = renderHook(
      () => useAdminBootstrap({ unlocked: true, globalSearch: "", onError }),
    );
    await waitFor(() => expect(mocks.getItems).toHaveBeenCalledTimes(1));

    mocks.revision = 1;
    rerender();
    await waitFor(() => expect(mocks.getItems).toHaveBeenCalledTimes(2));
    mocks.revision = 2;
    rerender();
    await waitFor(() => expect(mocks.getItems).toHaveBeenCalledTimes(3));

    await act(async () => {
      newer.resolve([{ item_id: "item-1", item_name: "Newest" }]);
      await newer.promise;
    });
    expect(result.current.items[0]?.item_name).toBe("Newest");

    await act(async () => {
      older.resolve([{ item_id: "item-1", item_name: "Older" }]);
      await older.promise;
    });
    expect(result.current.items[0]?.item_name).toBe("Newest");
  });

  it("keeps the last successful BOM snapshot when a realtime refresh fails", async () => {
    const initialRows = [{ parent_item_id: "parent-1", child_item_id: "child-1" }];
    mocks.getAllBOM.mockResolvedValueOnce(initialRows).mockRejectedValueOnce(new Error("refresh failed"));
    const onError = vi.fn();
    const { result, rerender } = renderHook(
      () => useAdminBootstrap({ unlocked: true, globalSearch: "", onError }),
    );
    await waitFor(() => expect(result.current.allBomRows).toEqual(initialRows));

    mocks.revision = 1;
    rerender();
    await waitFor(() => expect(mocks.getAllBOM).toHaveBeenCalledTimes(2));

    expect(result.current.allBomRows).toEqual(initialRows);
  });
});
