import { act, renderHook as renderTestingHook, waitFor, type RenderHookOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/queries/keys";

let client: QueryClient;
function renderHook<Result, Props>(render: (props: Props) => Result, options?: RenderHookOptions<Props>) {
  return renderTestingHook(render, {
    ...options,
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

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
vi.mock("@/lib/api/items", () => ({ itemsApi: { getItems: mocks.getItems } }));
vi.mock("@/lib/api/catalog", () => ({ catalogApi: { getAllBOM: mocks.getAllBOM } }));

vi.mock("@/lib/queries/useModelsQuery", () => ({
  useModelsQuery: () => ({ data: mocks.models }),
}));

vi.mock("@/lib/queries/realtime", () => ({
  useRealtimeRevision: () => mocks.revision,
}));

import { useAdminBootstrap } from "../useAdminBootstrap";
import { useAdminEmployeesForm } from "../useAdminEmployeesForm";
import type { Employee } from "@/lib/api";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("useAdminBootstrap realtime refresh", () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000, gcTime: Infinity } } });
    mocks.revision = null;
    mocks.getItems.mockReset().mockResolvedValue([]);
    mocks.getEmployees.mockReset().mockResolvedValue([]);
    mocks.getDepartments.mockReset().mockResolvedValue([]);
    mocks.getAllBOM.mockReset().mockResolvedValue([]);
  });
  afterEach(() => client.clear());

  it("reuses cached lists on reentry without waiting for another response", async () => {
    const onError = vi.fn();
    const first = renderHook(() => useAdminBootstrap({ unlocked: true, globalSearch: "", onError }));
    await waitFor(() => expect(first.result.current.readStates.items.status).toBe("ready"));
    await waitFor(() => expect(first.result.current.readStates.bom.status).toBe("ready"));
    first.unmount();
    const next = renderHook(() => useAdminBootstrap({ unlocked: true, globalSearch: "", onError }));
    expect(next.result.current.readStates.items.status).toBe("ready");
    expect(next.result.current.readStates.bom.status).toBe("ready");
    expect(mocks.getItems).toHaveBeenCalledTimes(1);
    expect(mocks.getAllBOM).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(next.result.current.readStates.employees.status).toBe("ready"));
  });

  it("cancels an older item read before committing a saved item to the shared cache", async () => {
    const old = deferred<any[]>();
    mocks.getItems.mockReturnValueOnce(old.promise);
    const onError = vi.fn();
    const { result } = renderHook(() => useAdminBootstrap({ unlocked: true, globalSearch: "", onError }));
    act(() => result.current.setItems([{ item_id: "saved", item_name: "Saved" }] as any));
    await waitFor(() => expect(result.current.items[0]?.item_name).toBe("Saved"));
    await act(async () => { old.resolve([{ item_id: "saved", item_name: "Old" }]); await old.promise; });
    expect(result.current.items[0]?.item_name).toBe("Saved");
    expect(client.getQueryData(queryKeys.items.list({ limit: 2000, search: undefined }))).toEqual(result.current.items);
  });

  it("distinguishes an initial pending response from a successfully empty list and keeps data during refresh", async () => {
    const first = deferred<unknown[]>();
    const refresh = deferred<unknown[]>();
    mocks.getItems.mockReturnValueOnce(first.promise).mockReturnValueOnce(refresh.promise);
    const onError = vi.fn();
    const { result } = renderHook(() => useAdminBootstrap({ unlocked: true, globalSearch: "", onError }));
    expect(result.current.readStates.items.status).toBe("pending");
    await act(async () => { first.resolve([]); await first.promise; });
    await waitFor(() => expect(result.current.readStates.items.status).toBe("ready"));
    let pending!: Promise<void>;
    act(() => { pending = result.current.refreshItems(); });
    expect(result.current.readStates.items.status).toBe("ready");
    await act(async () => { refresh.resolve([]); await pending; });
  });

  it("ends the initial skeleton on failure and retries without treating an empty success as loading", async () => {
    mocks.getAllBOM.mockRejectedValueOnce(new Error("BOM read failed")).mockRejectedValueOnce(new Error("BOM read failed")).mockResolvedValueOnce([]);
    const onError = vi.fn();
    const { result } = renderHook(() => useAdminBootstrap({ unlocked: true, globalSearch: "", onError }));
    await waitFor(() => expect(result.current.readStates.bom).toEqual({ status: "error", error: "BOM read failed" }));
    act(() => result.current.retryRead("bom"));
    await waitFor(() => expect(result.current.readStates.bom.status).toBe("ready"));
    expect(result.current.allBomRows).toEqual([]);
  });

  it.each(["items", "employees", "departments"] as const)("retries initial %s failures and keeps the ready state on a later refresh failure", async (domain) => {
    const read = { items: mocks.getItems, employees: mocks.getEmployees, departments: mocks.getDepartments }[domain];
    read.mockRejectedValueOnce(new Error("initial failure")).mockResolvedValueOnce([]);
    const onError = vi.fn();
    const { result } = renderHook(() => useAdminBootstrap({ unlocked: true, globalSearch: "", onError }));
    await waitFor(() => expect(result.current.readStates[domain].status).toBe("error"));
    act(() => result.current.retryRead(domain));
    await waitFor(() => expect(result.current.readStates[domain].status).toBe("ready"));
    expect(result.current[domain]).toEqual([]);
    onError.mockClear();
    read.mockRejectedValueOnce(new Error("refresh failure"));
    act(() => result.current.retryRead(domain));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("refresh failure"));
    expect(result.current.readStates[domain].status).toBe("ready");
  });

  it("accepts cached empty models as a completed read", async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useAdminBootstrap({ unlocked: true, globalSearch: "", onError }));
    expect(result.current.productModels).toEqual([]);
    expect(result.current.readStates.models.status).toBe("ready");
    await waitFor(() => expect(Object.values(result.current.readStates).every((read) => read.status === "ready")).toBe(true));
  });

  it("lets realtime invalidation refresh lists once and refreshes employees when the revision is published", async () => {
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

    await act(async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.items.all }),
        client.invalidateQueries({ queryKey: queryKeys.bom.all }),
      ]);
    });
    mocks.revision = 1;
    rerender();

    await waitFor(() => {
      expect(mocks.getItems).toHaveBeenCalledTimes(2);
      expect(mocks.getAllBOM).toHaveBeenCalledTimes(2);
    });
    expect(mocks.getEmployees).toHaveBeenCalledTimes(2);
    expect(mocks.getDepartments).toHaveBeenCalledTimes(1);
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

  it("ignores a late bootstrap employee response after a newer revision refresh", async () => {
    const older = deferred<unknown[]>();
    mocks.getEmployees.mockReturnValueOnce(older.promise).mockResolvedValueOnce([
      { employee_id: "emp-1", hidden_sidebar_tabs: ["stocktake"] },
    ]);
    const onError = vi.fn();
    const { result, rerender } = renderHook(
      () => useAdminBootstrap({ unlocked: true, globalSearch: "", onError }),
    );
    await waitFor(() => expect(mocks.getEmployees).toHaveBeenCalledTimes(1));

    mocks.revision = 1;
    rerender();
    await waitFor(() => expect(result.current.employees).toEqual([
      { employee_id: "emp-1", hidden_sidebar_tabs: ["stocktake"] },
    ]));

    await act(async () => {
      older.resolve([{ employee_id: "emp-1", hidden_sidebar_tabs: [] }]);
      await older.promise;
    });
    expect(result.current.employees[0]?.hidden_sidebar_tabs).toEqual(["stocktake"]);
  });

  it("ignores an older revision employee response after a newer loadData response", async () => {
    const older = deferred<unknown[]>();
    const initial = [{ employee_id: "emp-1", hidden_sidebar_tabs: [] }];
    const latest = [{ employee_id: "emp-1", hidden_sidebar_tabs: ["stocktake"] }];
    mocks.getEmployees.mockResolvedValueOnce(initial).mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(latest);
    const onError = vi.fn();
    const { result, rerender } = renderHook(
      () => useAdminBootstrap({ unlocked: true, globalSearch: "", onError }),
    );
    await waitFor(() => expect(result.current.employees).toEqual(initial));
    mocks.revision = 1;
    rerender();
    await waitFor(() => expect(mocks.getEmployees).toHaveBeenCalledTimes(2));

    await act(async () => { await result.current.loadData(); });
    expect(result.current.employees).toEqual(latest);
    await act(async () => {
      older.resolve(initial);
      await older.promise;
    });
    expect(result.current.employees).toEqual(latest);
  });

  it("keeps a successful personal save and clean form when an earlier employee refresh arrives late", async () => {
    const older = deferred<Employee[]>();
    const initial = {
      employee_id: "emp-1", name: "직원", role: "사원", department: "조립",
      hidden_sidebar_tabs: ["stocktake"],
    } as Employee;
    const saved = { ...initial, hidden_sidebar_tabs: [] };
    mocks.getEmployees.mockResolvedValueOnce([initial]).mockReturnValueOnce(older.promise);
    const onError = vi.fn();
    const { result, rerender } = renderHook(() => {
      const bootstrap = useAdminBootstrap({ unlocked: true, globalSearch: "", onError });
      const form = useAdminEmployeesForm(bootstrap.employees);
      return { bootstrap, form };
    });
    await waitFor(() => expect(result.current.bootstrap.employees).toEqual([initial]));
    await act(async () => { result.current.form.setSelectedEmployee(initial); });
    mocks.revision = 1;
    rerender();
    await waitFor(() => expect(mocks.getEmployees).toHaveBeenCalledTimes(2));

    await act(async () => {
      result.current.bootstrap.setEmployees((current) => current.map((entry) =>
        entry.employee_id === saved.employee_id ? saved : entry,
      ));
      result.current.form.setSelectedEmployee(saved);
    });
    expect(result.current.form.dirty).toBe(false);
    await act(async () => {
      older.resolve([initial]);
      await older.promise;
    });

    expect(result.current.bootstrap.employees).toEqual([saved]);
    expect(result.current.form.selectedEmployee).toBe(saved);
    expect(result.current.form.editForm.hidden_sidebar_tabs).toEqual([]);
    expect(result.current.form.dirty).toBe(false);
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

    act(() => { void client.invalidateQueries({ queryKey: queryKeys.items.all }); });
    await waitFor(() => expect(mocks.getItems).toHaveBeenCalledTimes(2));
    act(() => { void client.invalidateQueries({ queryKey: queryKeys.items.all }); });
    await waitFor(() => expect(mocks.getItems).toHaveBeenCalledTimes(3));

    await act(async () => {
      newer.resolve([{ item_id: "item-1", item_name: "Newest" }]);
      await newer.promise;
    });
    await waitFor(() => expect(result.current.items[0]?.item_name).toBe("Newest"));

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
    const { result } = renderHook(
      () => useAdminBootstrap({ unlocked: true, globalSearch: "", onError }),
    );
    await waitFor(() => expect(result.current.allBomRows).toEqual(initialRows));

    act(() => { void client.invalidateQueries({ queryKey: queryKeys.bom.all }); });
    await waitFor(() => expect(mocks.getAllBOM).toHaveBeenCalledTimes(2));

    expect(result.current.allBomRows).toEqual(initialRows);
  });
});
