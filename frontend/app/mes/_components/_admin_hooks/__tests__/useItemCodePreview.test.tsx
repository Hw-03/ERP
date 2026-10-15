import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useItemCodePreview } from "../useItemCodePreview";

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/api/items", () => ({ itemsApi: { getItemCodePreview: read } }));

describe("useItemCodePreview", () => {
  it("선택 변경과 닫기 뒤 늦은 이전 응답을 무시하고 새 코드만 유지한다", async () => {
    let older!: (value: { mes_code: string }) => void;
    let closed!: (value: { mes_code: string }) => void;
    read.mockReset().mockReturnValueOnce(new Promise((resolve) => { older = resolve; }))
      .mockResolvedValueOnce({ mes_code: "7-HR-0020" })
      .mockReturnValueOnce(new Promise((resolve) => { closed = resolve; }));
    const { result, rerender, unmount } = renderHook(({ processType }) => useItemCodePreview(processType, [1], "item-1"),
      { initialProps: { processType: "TR" } });
    expect(result.current.status).toBe("loading");
    rerender({ processType: "HR" });
    await waitFor(() => expect(result.current.code).toBe("7-HR-0020"));
    await act(async () => older({ mes_code: "3-TR-0007" }));
    expect(result.current.code).toBe("7-HR-0020");
    act(() => result.current.retry());
    await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
    unmount();
    expect((read.mock.calls[2][1] as AbortSignal).aborted).toBe(true);
    await act(async () => closed({ mes_code: "7-HR-9999" }));
    expect(result.current.code).not.toBe("7-HR-9999");
  });

  it("조회 실패는 코드없는 오류로 표시하고 재시도 성공 뒤에만 제출 코드를 제공한다", async () => {
    read.mockReset().mockRejectedValueOnce(new Error("503")).mockResolvedValueOnce({ mes_code: "3-TR-0020" });
    const { result } = renderHook(() => useItemCodePreview("TR", [1]));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.code).toBeUndefined();
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.code).toBe("3-TR-0020");
  });
});
