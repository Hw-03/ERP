import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getEmployees: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getEmployees: state.getEmployees,
  },
}));

import { useLoginEmployees } from "../useLoginEmployees";

describe("useLoginEmployees", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    state.getEmployees.mockReset();
  });

  it("shows failure state and retries active employee loading", async () => {
    const failure = new Error("CORS request blocked");
    state.getEmployees.mockRejectedValue(failure);
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { result } = renderHook(() => useLoginEmployees());

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(consoleWarn).toHaveBeenCalledWith("[MES login] read failed", expect.objectContaining({
      stage: "active_employees",
      attempts: 2,
    }));

    state.getEmployees.mockResolvedValue([]);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });
});
