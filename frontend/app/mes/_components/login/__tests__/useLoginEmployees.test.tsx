import { renderHook, waitFor } from "@testing-library/react";
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

  it("logs the original error when loading login employees fails", async () => {
    const failure = new Error("CORS request blocked");
    state.getEmployees.mockRejectedValue(failure);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    renderHook(() => useLoginEmployees());

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        "[MES login] Failed to load active employees.",
        failure,
      );
    });
  });
});
