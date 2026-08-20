import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useIoPreview } from "../useIoPreview";

const { previewMock } = vi.hoisted(() => ({ previewMock: vi.fn() }));

vi.mock("@/lib/api", () => ({
  api: { preview: previewMock },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

describe("useIoPreview", () => {
  it("동시 미리보기 중 하나만 끝나도 나머지가 끝날 때까지 busy 상태를 유지한다", async () => {
    const first = deferred<{ bundles: [] }>();
    const second = deferred<{ bundles: [] }>();
    previewMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useIoPreview());
    const options = {
      employeeId: "employee-1",
      workType: "internal_use" as const,
      subType: "internal_use_out" as const,
      target: { source_kind: "manual" as const, item_id: "item-1", quantity: 1 },
    };

    let firstRequest!: Promise<unknown>;
    let secondRequest!: Promise<unknown>;
    act(() => {
      firstRequest = result.current.previewTarget(options);
      secondRequest = result.current.previewTarget(options);
    });
    expect(result.current.previewing).toBe(true);

    await act(async () => {
      first.resolve({ bundles: [] });
      await firstRequest;
    });
    expect(result.current.previewing).toBe(true);

    await act(async () => {
      second.resolve({ bundles: [] });
      await secondRequest;
    });
    expect(result.current.previewing).toBe(false);
  });
});
