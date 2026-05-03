import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  api: { getShipPackages: vi.fn() },
}));

import { api } from "@/lib/api";
import { usePackages } from "../usePackages";

describe("usePackages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("초기 fetch 결과를 반영", async () => {
    (api.getShipPackages as any).mockResolvedValue([{ package_id: "p1", name: "팩1", items: [] }]);
    const { result } = renderHook(() => usePackages());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.packages).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it("에러 시 error state", async () => {
    (api.getShipPackages as any).mockRejectedValue(new Error("server"));
    const { result } = renderHook(() => usePackages());
    await waitFor(() => expect(result.current.error).toBe("server"));
  });
});
