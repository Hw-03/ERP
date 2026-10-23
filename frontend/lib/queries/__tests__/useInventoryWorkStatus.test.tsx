import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workReservationsApi } from "@/lib/api/work-reservations";
import { queryKeys } from "../keys";
import { useInventoryWorkStatus } from "../useInventoryWorkStatus";

afterEach(() => vi.restoreAllMocks());

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}

describe("선택 품목 작업 현황 조회", () => {
  it("재시도는 수량을 공급하는 활성 품목 조회도 다시 읽는다", async () => {
    vi.spyOn(workReservationsApi, "getItemWorkStatus").mockResolvedValue({ item_id: "selected", works: [] } as never);
    const { wrapper, client } = setup();
    const itemKey = queryKeys.items.list({ limit: 2000 });
    const readItems = vi.fn(async () => [{ item_id: "selected", work_reservations: { work_reserved_quantity: 3 } }]);
    const observer = new QueryObserver(client, { queryKey: itemKey, queryFn: readItems, initialData: [{ item_id: "selected", work_reservations: { work_reserved_quantity: -1 } }], staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => {});
    const { result } = renderHook(() => useInventoryWorkStatus("selected"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(async () => { await result.current.refetch(); });
    expect(client.getQueryData(itemKey)).toEqual([{ item_id: "selected", work_reservations: { work_reserved_quantity: 3 } }]);
    unsubscribe();
    client.clear();
  });
  it("선택 품목이 있어야 호출한다", async () => {
    const read = vi.spyOn(workReservationsApi, "getItemWorkStatus").mockResolvedValue({ item_id: "selected", works: [] } as never);
    const { wrapper, client } = setup();
    const { rerender, result } = renderHook(({ id }) => useInventoryWorkStatus(id), { wrapper, initialProps: { id: "" } });
    expect(read).not.toHaveBeenCalled();
    rerender({ id: "selected" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith("selected", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(client.getQueryData(queryKeys.inventory.workStatus("selected"))).toEqual({ item_id: "selected", works: [] });
  });

  it("API 미제공 오류를 예약 0 성공으로 바꾸거나 자동 재시도하지 않는다", async () => {
    const read = vi.spyOn(workReservationsApi, "getItemWorkStatus").mockRejectedValue(new Error("지원하지 않는 API"));
    const { wrapper } = setup();
    const { result } = renderHook(() => useInventoryWorkStatus("selected"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(read).toHaveBeenCalledTimes(1);
  });
});
