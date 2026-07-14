import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetcher } from "../../api-core";
import { ioApi } from "../io";

vi.mock("../../api-core", () => ({
  deleteJson: vi.fn(),
  fetcher: vi.fn(),
  postJson: vi.fn(),
  putJson: vi.fn(),
  toApiUrl: (path: string) => path,
}));

describe("ioApi.getItemConversionPreview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requester_employee_id를 preview query에 전달한다", async () => {
    vi.mocked(fetcher).mockResolvedValue({});

    await ioApi.getItemConversionPreview({
      source_item_id: "source-1",
      target_item_id: "target-1",
      quantity: 2,
      requester_employee_id: "employee-7",
    });

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("requester_employee_id=employee-7"),
      undefined,
    );
  });
});
