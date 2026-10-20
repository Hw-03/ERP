import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workReservationsApi } from "@/lib/api/work-reservations";
import { ApiError } from "@/lib/api-core";
import { queryKeys } from "../keys";
import { useAdminWorkReservations } from "../useAdminWorkReservations";

const session = vi.hoisted(() => ({ pin: null as string | null }));
vi.mock("@/lib/auth/admin-session", () => ({ useAdminSession: () => session }));
afterEach(() => { vi.restoreAllMocks(); session.pin = null; });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}
describe("관리자 작업 예약 전용 조회", () => {
  it("PIN 없이는 목록·상세·취소를 호출하지 않는다", async () => {
    const list = vi.spyOn(workReservationsApi, "listAdmin");
    const detail = vi.spyOn(workReservationsApi, "getAdminDetail");
    const cancel = vi.spyOn(workReservationsApi, "cancelAdmin");
    const { wrapper } = setup();
    const { result } = renderHook(() => useAdminWorkReservations({}, "batch"), { wrapper });
    await act(async () => { await expect(result.current.cancel("batch", { expected_revision: 3, reason: "사유" })).rejects.toThrow(); });
    expect(list).not.toHaveBeenCalled(); expect(detail).not.toHaveBeenCalled(); expect(cancel).not.toHaveBeenCalled();
  });
  it("선택 전 목록만 읽으며 PIN을 키에 넣지 않고 잠금 시 캐시를 제거한다", async () => {
    session.pin = "secret-pin";
    const list = vi.spyOn(workReservationsApi, "listAdmin").mockResolvedValue({ items: [], total: 0 } as never);
    const detail = vi.spyOn(workReservationsApi, "getAdminDetail").mockResolvedValue({ batch_id: "batch" } as never);
    const { wrapper, client } = setup();
    const { result, rerender } = renderHook(({ id }) => useAdminWorkReservations({ sort: "updated_asc" }, id), { wrapper, initialProps: { id: "" } });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    expect(list).toHaveBeenCalledTimes(1); expect(detail).not.toHaveBeenCalled();
    rerender({ id: "batch" });
    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));
    expect(JSON.stringify(client.getQueryCache().getAll().map((query) => query.queryKey))).not.toContain("secret-pin");
    session.pin = null; rerender({ id: "batch" });
    await waitFor(() => expect(client.getQueriesData({ queryKey: queryKeys.admin.workReservationsAll }).some(([, data]) => data !== undefined)).toBe(false));
    expect(result.current.ready).toBe(false);
  });
  it.each([
    new ApiError("변경됨", 409), new ApiError("변경됨", 422), new ApiError("변경됨", 500, undefined, { state_committed: true }),
  ])("충돌·확정 오류는 관측 revision을 한 번 전송하고 관련 캐시를 만료시킨다: %s", async (failure) => {
    session.pin = "secret-pin";
    vi.spyOn(workReservationsApi, "listAdmin").mockResolvedValue({ items: [], total: 0 } as never);
    vi.spyOn(workReservationsApi, "getAdminDetail").mockResolvedValue({ batch_id: "batch" } as never);
    const cancel = vi.spyOn(workReservationsApi, "cancelAdmin").mockRejectedValue(failure);
    const { wrapper, client } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useAdminWorkReservations({}, "batch"), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => { await expect(result.current.cancel("batch", { expected_revision: 3, reason: " 취소 사유 " })).rejects.toThrow("변경됨"); });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith("batch", { expected_revision: 3, reason: "취소 사유" });
    for (const queryKey of [queryKeys.items.all, queryKeys.inventory.all, queryKeys.stockRequests.all, queryKeys.admin.workReservationsAll]) expect(invalidate.mock.calls.map(([filters]) => filters)).toContainEqual({ queryKey });
  });
});
