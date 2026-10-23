// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, type IoBatch, type IoLine, type Item } from "@/lib/api";
import { queryKeys } from "@/lib/queries/keys";
import { invalidateWorkReservationQueries } from "@/lib/queries/workReservationInvalidation";
import { ownerReservationAvailable } from "../ownerReservationAvailable";
import { useIoDraft } from "../useIoDraft";

vi.mock("@/lib/api", () => ({ api: { getBatch: vi.fn(), saveDraft: vi.fn() } }));
const clients: QueryClient[] = [];
const item = { item_id: "material", warehouse_qty: 10, pending_quantity: 3 } as Item;
const line = { item_id: "material", from_bucket: "warehouse", from_department: null, to_bucket: "none" } as IoLine;
const draft = { batch_id: "batch", requester_employee_id: "employee", revision: 7, status: "draft", reservation_status: "reserved",
  effective_plan: { effects: [{ item_id: "material", kind: "out", quantity: 3, from: { bucket: "warehouse", department: null } }] } } as IoBatch;
const saved = { ...draft, revision: 8, effective_plan: { ...draft.effective_plan!, effects: [{ ...draft.effective_plan!.effects[0], quantity: 5 }] } } as IoBatch;
const payload = { employeeId: "employee", workType: "process" as const, subType: "produce" as const, batchId: "batch", bundles: [] };

beforeEach(() => { vi.resetAllMocks(); vi.mocked(api.getBatch).mockResolvedValue(draft); vi.mocked(api.saveDraft).mockResolvedValue(saved); });
afterEach(() => { clients.splice(0).forEach((client) => client.clear()); });

it.each([undefined, { throwOnError: true }])("예약 변경은 캐시 없는 최초 재고·작업 현황 요청도 새로 조회한다 (%j)", async (options) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const reads = [queryKeys.items.list({ limit: 2000 }), queryKeys.inventory.workStatus("material")].map((queryKey) => {
    let finish!: (value: number) => void;
    const queryFn = vi.fn<() => Promise<number>>().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValue(5);
    const observer = new QueryObserver(client, { queryKey, queryFn });
    return { queryKey, queryFn, finish: () => finish(3), unsubscribe: observer.subscribe(() => {}) };
  });
  try {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const refresh = invalidateWorkReservationQueries(client, options);
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(4));
    reads.forEach((read) => read.finish());
    await refresh;
    reads.forEach((read) => {
      expect(read.queryFn).toHaveBeenCalledTimes(2);
      expect(client.getQueryData(read.queryKey)).toBe(5);
    });
  } finally { reads.forEach((read) => read.unsubscribe()); }
});

it.each([false, true])("실제 QueryClient 재고 갱신 실패=%s: 확정 저장은 유지하고 실패한 옛 재고에는 새 예약을 가산하지 않는다", async (fails) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const snapshot = [item];
  const key = queryKeys.items.list({ limit: 2000 });
  const refetch = vi.fn(async () => { if (fails) throw new Error("재고 조회 실패"); return snapshot; });
  const observer = new QueryObserver(client, { queryKey: key, queryFn: refetch, initialData: snapshot, staleTime: Infinity });
  const unsubscribe = observer.subscribe(() => {});
  const context = { employeeId: "employee", inventorySnapshot: snapshot, realtimeRevision: 1 };
  const response = fails ? saved : { ...saved, effective_plan: draft.effective_plan };
  vi.mocked(api.saveDraft).mockResolvedValue(response);
  const { result } = renderHook(() => useIoDraft(draft, 1, () => invalidateWorkReservationQueries(client, { throwOnError: true }), undefined, context));
  await act(async () => {});
  vi.mocked(api.getBatch).mockResolvedValue(response);
  await act(async () => { await expect(result.current.saveDraft(payload)).resolves.toEqual(response); });
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
  expect(client.getQueryData(key)).toBe(snapshot);
  expect(result.current.savedBatch).toEqual(response);
  expect(result.current.getRevision("batch")).toBe(8);
  if (fails) {
    expect(client.getQueryState(key)?.status).toBe("error");
    expect(result.current.currentReservationBatch).toBeNull();
    expect(ownerReservationAvailable(item, line, result.current.currentReservationBatch)).toBe(7);
  } else {
    expect(result.current.currentReservationBatch).toEqual(response);
    expect(ownerReservationAvailable(item, line, result.current.currentReservationBatch)).toBe(10);
  }
  unsubscribe();
});

it("기본 무효화 호출은 기존 소비자처럼 재조회 실패를 명령 실패로 전파하지 않는다", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const key = queryKeys.items.list({ limit: 2000 });
  const observer = new QueryObserver(client, { queryKey: key, queryFn: async () => { throw new Error("조회 실패"); }, initialData: [item], staleTime: Infinity });
  const unsubscribe = observer.subscribe(() => {});
  await expect(invalidateWorkReservationQueries(client)).resolves.toBeUndefined();
  expect(client.getQueryState(key)?.status).toBe("error");
  unsubscribe();
});

it.each([false, true])("실시간 재고 조회 실패 후 예약 변경=%s: 옛 재고 가산을 막고 정상 조회의 구조 공유 후에도 회복한다", async (quantityChanged) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const key = queryKeys.items.list({ limit: 2000 });
  const initialItems = [item];
  let fails = true;
  let returnedItems = initialItems;
  const observer = new QueryObserver(client, { queryKey: key, queryFn: async () => { if (fails) throw new Error("재고 조회 실패"); return returnedItems; }, initialData: initialItems, staleTime: Infinity });
  const subscribe = (notify: () => void) => observer.subscribe(notify);
  const { result, rerender } = renderHook(({ revision }) => {
    const inventory = useSyncExternalStore(subscribe, () => observer.getCurrentResult());
    return useIoDraft(draft, 1, undefined, undefined, {
      employeeId: "employee", inventorySnapshot: inventory.data!, realtimeRevision: revision,
      inventoryQueryState: { queryKey: JSON.stringify(key), isInvalidated: client.getQueryState(key)!.isInvalidated, isSuccess: inventory.isSuccess, isFetching: inventory.isFetching, dataUpdatedAt: inventory.dataUpdatedAt, dataUpdateCount: client.getQueryState(key)!.dataUpdateCount },
    });
  }, { initialProps: { revision: 1 } });
  await act(async () => {});
  expect(result.current.currentReservationBatch).toEqual(draft);
  const current = quantityChanged ? saved : { ...saved, effective_plan: draft.effective_plan };
  vi.mocked(api.getBatch).mockResolvedValue(current);
  vi.mocked(api.getBatch).mockClear();
  rerender({ revision: 2 });
  expect(api.getBatch).not.toHaveBeenCalled();
  await act(async () => { await client.invalidateQueries({ queryKey: key }); });
  expect(client.getQueryData(key)).toBe(initialItems);
  expect(client.getQueryState(key)?.status).toBe("error");
  expect(result.current.currentReservationBatch).toBeNull();
  expect(ownerReservationAvailable(item, line, result.current.currentReservationBatch)).toBe(7);
  fails = false;
  if (quantityChanged) returnedItems = [{ ...item, pending_quantity: 5 }];
  await act(async () => { await client.invalidateQueries({ queryKey: key }); });
  await waitFor(() => expect(result.current.currentReservationBatch).toEqual(current));
  const recoveredItems = client.getQueryData<Item[]>(key)!;
  expect(ownerReservationAvailable(recoveredItems[0], line, result.current.currentReservationBatch)).toBe(10);
  await act(async () => { await client.invalidateQueries({ queryKey: key }); });
  await waitFor(() => expect(result.current.currentReservationBatch).toEqual(current));
  expect(client.getQueryData(key)).toBe(recoveredItems);
  expect(result.current.getRevision("batch")).toBe(7);
});

it("재고 검색 쿼리가 바뀌면 이전 쿼리의 높은 성공 횟수로 새 쿼리 복구를 막지 않는다", async () => {
  const snapshot = [item];
  const { result, rerender } = renderHook(({ queryKey, count, revision }) => useIoDraft(draft, 1, undefined, undefined, {
    employeeId: "employee", inventorySnapshot: snapshot, realtimeRevision: revision,
    inventoryQueryState: { queryKey, isInvalidated: count === 0, isSuccess: true, isFetching: false, dataUpdatedAt: 1, dataUpdateCount: count },
  }), { initialProps: { queryKey: "items-A", count: 5, revision: 1 } });
  await act(async () => {});
  rerender({ queryKey: "items-A", count: 5, revision: 2 });
  expect(result.current.currentReservationBatch).toBeNull();
  rerender({ queryKey: "items-A", count: 6, revision: 2 });
  await waitFor(() => expect(result.current.currentReservationBatch).toEqual(draft));
  rerender({ queryKey: "items-B", count: 0, revision: 2 });
  expect(result.current.currentReservationBatch).toBeNull();
  rerender({ queryKey: "items-B", count: 1, revision: 2 });
  await waitFor(() => expect(result.current.currentReservationBatch).toEqual(draft));
});

it("다른 검색의 유효한 성공 캐시로 복귀하면 추가 재고 fetch 없이 현재 예약을 읽는다", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const keys = [queryKeys.items.list({ search: "A" }), queryKeys.items.list({ search: "B" })];
  const queryFn = vi.fn(async () => [item]);
  const observers = keys.map((queryKey) => {
    client.setQueryData(queryKey, [item]);
    return new QueryObserver(client, { queryKey, queryFn, staleTime: Infinity });
  });
  const { result, rerender } = renderHook(({ index }) => {
    const observer = observers[index];
    const inventory = useSyncExternalStore((notify) => observer.subscribe(notify), () => observer.getCurrentResult());
    const queryState = client.getQueryState(keys[index])!;
    return useIoDraft(draft, 1, undefined, undefined, {
      employeeId: "employee", inventorySnapshot: inventory.data!, realtimeRevision: 1,
      inventoryQueryState: { queryKey: JSON.stringify(keys[index]), isSuccess: inventory.isSuccess, isFetching: inventory.isFetching,
        isInvalidated: queryState.isInvalidated, dataUpdatedAt: inventory.dataUpdatedAt, dataUpdateCount: queryState.dataUpdateCount },
    });
  }, { initialProps: { index: 0 } });
  await act(async () => {});
  rerender({ index: 1 });
  await waitFor(() => expect(result.current.currentReservationBatch).toEqual(draft));
  expect(queryFn).not.toHaveBeenCalled();
});

it("초기 재고 조회가 끝나기 전에는 저장된 본인 예약을 가산하지 않는다", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const key = queryKeys.items.list({ limit: 2000 });
  let finish!: (items: Item[]) => void;
  const observer = new QueryObserver(client, { queryKey: key, queryFn: () => new Promise<Item[]>((resolve) => { finish = resolve; }) });
  const subscribe = (notify: () => void) => observer.subscribe(notify);
  const { result } = renderHook(() => {
    const inventory = useSyncExternalStore(subscribe, () => observer.getCurrentResult());
    return useIoDraft(draft, 1, undefined, undefined, {
      employeeId: "employee", inventorySnapshot: inventory.data ?? [], realtimeRevision: 1,
      inventoryQueryState: { queryKey: JSON.stringify(key), isInvalidated: client.getQueryState(key)!.isInvalidated, isSuccess: inventory.isSuccess, isFetching: inventory.isFetching, dataUpdatedAt: inventory.dataUpdatedAt, dataUpdateCount: client.getQueryState(key)!.dataUpdateCount },
    });
  });
  expect(result.current.currentReservationBatch).toBeNull();
  expect(api.getBatch).not.toHaveBeenCalled();
  await act(async () => { finish([item]); });
  await waitFor(() => expect(result.current.currentReservationBatch).toEqual(draft));
});
