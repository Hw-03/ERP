import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useResource } from "../useResource";

describe("useResource", () => {
  it("초기 loading=true, data=undefined", () => {
    const fetcher = vi.fn(() => new Promise(() => {})); // never resolve
    const { result } = renderHook(() => useResource(fetcher, []));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();
  });

  it("성공 시 data 셋, loading=false", async () => {
    const fetcher = vi.fn().mockResolvedValue({ count: 42 });
    const { result } = renderHook(() => useResource(fetcher, []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ count: 42 });
    expect(result.current.error).toBeNull();
  });

  it("실패 시 error 셋", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useResource(fetcher, []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("network down");
    expect(result.current.data).toBeUndefined();
  });

  it("reload() 호출 시 fetcher 재실행", async () => {
    const fetcher = vi.fn().mockResolvedValue({ v: 1 });
    const { result } = renderHook(() => useResource(fetcher, []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetcher).toHaveBeenCalledTimes(1);

    fetcher.mockResolvedValueOnce({ v: 2 });
    await act(async () => {
      await result.current.reload();
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({ v: 2 });
  });
});
