import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAdminSave } from "../useAdminSave";

describe("admin save coordination", () => {
  it("shares one pending request and propagates a failure before allowing retry", async () => {
    const { result } = renderHook(useAdminSave);
    let reject!: (error: Error) => void;
    const action = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.run(action);
      second = result.current.run(action);
    });
    expect(second).toBe(first);
    expect(result.current.saving).toBe(true);
    await act(async () => {
      await Promise.resolve();
      reject(new Error("failed"));
      await expect(first).rejects.toThrow("failed");
    });
    expect(action).toHaveBeenCalledOnce();
    expect(result.current.saving).toBe(false);
    await act(async () => { await result.current.run(async () => {}); });
    expect(result.current.saving).toBe(false);
  });
});
