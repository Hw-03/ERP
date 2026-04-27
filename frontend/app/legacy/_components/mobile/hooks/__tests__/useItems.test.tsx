import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// api 모킹 — useItems 가 부르는 api.getItems 만 가로챈다
vi.mock("@/lib/api", () => ({
  api: {
    getItems: vi.fn(),
  },
}));

import { api } from "@/lib/api";
import { useItems } from "../useItems";

describe("useItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("초기 fetch 결과를 반영", async () => {
    (api.getItems as any).mockResolvedValue([{ item_id: "1", item_name: "A" }]);
    const { result } = renderHook(() => useItems({}));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([{ item_id: "1", item_name: "A" }]);
    expect(result.current.error).toBeNull();
  });

  it("AbortError 는 error state 로 노출하지 않음", async () => {
    const abortErr = new Error("aborted");
    (abortErr as any).name = "AbortError";
    (api.getItems as any).mockRejectedValue(abortErr);

    const { result } = renderHook(() => useItems({}));
    // AbortError 면 loading 은 가드되어 그대로 둘 수 있음 — error 는 절대 set 되지 않아야
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.error).toBeNull();
  });

  it("일반 에러는 error state 로 노출", async () => {
    (api.getItems as any).mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useItems({}));
    await waitFor(() => expect(result.current.error).toBe("network down"));
  });

  it("빠른 필터 변경 시 마지막 결과만 반영", async () => {
    let resolveFirst: (v: any) => void = () => {};
    const firstPromise = new Promise((res) => {
      resolveFirst = res;
    });
    (api.getItems as any)
      .mockImplementationOnce((_p: any, opts: any) => {
        // 첫 호출: signal.aborted 가 true 가 되도록 설계됨
        return new Promise((_, rej) => {
          opts?.signal?.addEventListener?.("abort", () => {
            const err = new Error("aborted");
            (err as any).name = "AbortError";
            rej(err);
          });
        });
      })
      .mockImplementationOnce(async () => [{ item_id: "2", item_name: "B" }]);

    const { result, rerender } = renderHook(
      ({ filters }) => useItems(filters),
      { initialProps: { filters: { search: "first" } } }
    );

    // filter 변경 → 첫 요청 abort, 두 번째 응답이 와야 함
    rerender({ filters: { search: "second" } });

    await waitFor(() => {
      expect(result.current.items).toEqual([{ item_id: "2", item_name: "B" }]);
    });
    expect(result.current.error).toBeNull();

    // 정리: 못 끝낸 첫 promise resolve (테스트 hang 방지)
    resolveFirst([]);
  });
});
