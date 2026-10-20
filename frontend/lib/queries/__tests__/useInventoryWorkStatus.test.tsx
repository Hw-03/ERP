import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
  it("선택 품목과 enabled가 모두 있어야 호출한다", async () => {
    const read = vi.spyOn(workReservationsApi, "getItemWorkStatus").mockResolvedValue({ item_id: "selected", works: [] } as never);
    const { wrapper, client } = setup();
    const { rerender, result } = renderHook(({ id, enabled }) => useInventoryWorkStatus(id, enabled), { wrapper, initialProps: { id: "", enabled: true } });
    expect(read).not.toHaveBeenCalled();
    rerender({ id: "selected", enabled: false });
    expect(read).not.toHaveBeenCalled();
    rerender({ id: "selected", enabled: true });
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
