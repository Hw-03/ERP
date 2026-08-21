import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useInternalUseBomPreviewLock } from "../useInternalUseBomPreviewLock";

describe("useInternalUseBomPreviewLock", () => {
  it("같은 묶음의 연속 요청은 첫 요청이 끝날 때까지 추가 실행하지 않는다", async () => {
    let release: (() => void) | undefined;
    const firstTask = vi.fn(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );
    const secondTask = vi.fn(async () => {});
    const { result } = renderHook(() => useInternalUseBomPreviewLock());

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await act(async () => {
      first = result.current.run("bundle-1", firstTask);
      second = result.current.run("bundle-1", secondTask);
      await Promise.resolve();
    });

    expect(result.current.busy).toBe(true);
    expect(firstTask).toHaveBeenCalledOnce();
    expect(secondTask).not.toHaveBeenCalled();

    await act(async () => {
      release?.();
      await expect(first).resolves.toBe(true);
      await expect(second).resolves.toBe(false);
    });

    expect(result.current.busy).toBe(false);
  });
});
