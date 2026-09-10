import { ApiError } from "@/lib/api-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOGIN_READ_TIMEOUT_MS, runLoginReadWithRetry } from "../loginReadRetry";

describe("runLoginReadWithRetry", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("retries a temporary server failure once after 500ms", async () => {
    vi.useFakeTimers();
    const operation = vi.fn()
      .mockRejectedValueOnce(new ApiError("temporary", 503))
      .mockResolvedValueOnce("ok");

    const result = runLoginReadWithRetry(operation, { stage: "app_session" });
    await vi.advanceTimersByTimeAsync(500);

    await expect(result).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 4xx response", async () => {
    const operation = vi.fn().mockRejectedValue(new ApiError("forbidden", 403));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(runLoginReadWithRetry(operation, { stage: "app_session" })).rejects.toThrow("forbidden");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries a raw network error once", async () => {
    vi.useFakeTimers();
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce("ok");

    const result = runLoginReadWithRetry(operation, { stage: "active_employees" });
    await vi.advanceTimersByTimeAsync(500);

    await expect(result).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry malformed response parsing errors", async () => {
    const operation = vi.fn().mockRejectedValue(new SyntaxError("unexpected response"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(runLoginReadWithRetry(operation, { stage: "app_session" })).rejects.toThrow("unexpected response");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("aborts each timed-out request before starting the one retry", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const operation = vi.fn((signal: AbortSignal) => new Promise<string>((_, reject) => {
      signals.push(signal);
      signal.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true });
    }));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = runLoginReadWithRetry(operation, { stage: "app_session" });
    const rejection = expect(result).rejects.toMatchObject({ name: "LoginReadTimeoutError" });
    await vi.advanceTimersByTimeAsync(LOGIN_READ_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(LOGIN_READ_TIMEOUT_MS);

    await rejection;
    expect(operation).toHaveBeenCalledTimes(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("does not expose a late response after the caller cancels the read", async () => {
    let resolveOperation: ((value: string) => void) | undefined;
    const operation = vi.fn((signal: AbortSignal) => new Promise<string>((resolve) => {
      resolveOperation = resolve;
      signal.addEventListener("abort", () => {}, { once: true });
    }));
    const controller = new AbortController();

    const result = runLoginReadWithRetry(operation, { stage: "app_session", signal: controller.signal });
    const rejection = expect(result).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejection;

    resolveOperation?.("late response");
    expect(operation.mock.calls[0][0].aborted).toBe(true);
  });
});
