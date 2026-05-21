import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  api: { getEmployees: vi.fn() },
}));

import { api } from "@/lib/api";
import { useEmployees } from "../useEmployees";

describe("useEmployees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("기본 호출 시 activeOnly=true 로 fetch", async () => {
    (api.getEmployees as any).mockResolvedValue([{ employee_id: "e1", name: "A" }]);
    const { result } = renderHook(() => useEmployees());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.employees).toHaveLength(1);
    expect(api.getEmployees).toHaveBeenCalledWith({ department: undefined, activeOnly: true });
  });

  it("에러 시 error state", async () => {
    (api.getEmployees as any).mockRejectedValue(new Error("oops"));
    const { result } = renderHook(() => useEmployees());
    await waitFor(() => expect(result.current.error).toBe("oops"));
  });

  it("department 인자가 fetch 에 forward 됨", async () => {
    (api.getEmployees as any).mockResolvedValue([]);
    renderHook(() => useEmployees({ department: "조립" }));
    await waitFor(() => expect(api.getEmployees).toHaveBeenCalled());
    expect(api.getEmployees).toHaveBeenCalledWith({ department: "조립", activeOnly: true });
  });
});
