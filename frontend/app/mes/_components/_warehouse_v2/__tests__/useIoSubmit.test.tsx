// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useIoSubmit } from "../useIoSubmit";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("useIoSubmit", () => {
  it("진행 중인 저장·제출 실행에는 동기적으로 한 번만 진입한다", async () => {
    const pending = deferred<void>();
    const work = vi.fn(async () => pending.promise);
    const { result } = renderHook(() => useIoSubmit());

    let first!: Promise<void | undefined>;
    let second!: Promise<void | undefined>;
    act(() => {
      first = result.current.run(work);
      second = result.current.run(work);
    });

    expect(work).toHaveBeenCalledTimes(1);
    expect(result.current.submitting).toBe(true);
    await expect(second).resolves.toBeUndefined();

    await act(async () => {
      pending.resolve();
      await first;
    });

    expect(result.current.submitting).toBe(false);
  });
});
