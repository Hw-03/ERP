import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api-core", () => ({
  fetcher: vi.fn(), postJson: vi.fn(), patchJson: vi.fn(), putJson: vi.fn(), deleteJson: vi.fn(),
  toApiUrl: (path: string) => path,
}));
import { fetcher, postJson } from "../../api-core";
import { ioApi } from "../io";

describe("ioApi supplier scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("기존 업체 호출은 창고 범위로 요청한다", () => {
    ioApi.listSuppliers("employee-1");
    const params = new URLSearchParams((vi.mocked(fetcher).mock.calls[0][0] as string).split("?")[1]);
    expect(params.get("scope")).toBe("warehouse");
    ioApi.createSupplier("employee-1", "업체");
    expect(postJson).toHaveBeenCalledWith("/api/suppliers", { requester_employee_id: "employee-1", name: "업체", scope: "warehouse" });
  });

  it("튜브 업체 조회와 생성에 범위를 전달한다", () => {
    ioApi.listSuppliers("tube-1", true, "tube");
    const params = new URLSearchParams((vi.mocked(fetcher).mock.calls[0][0] as string).split("?")[1]);
    expect(params.get("scope")).toBe("tube");
    expect(params.get("include_inactive")).toBe("true");
    ioApi.createSupplier("tube-1", "업체", "tube");
    expect(postJson).toHaveBeenCalledWith("/api/suppliers", { requester_employee_id: "tube-1", name: "업체", scope: "tube" });
  });
});
