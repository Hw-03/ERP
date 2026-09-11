import { describe, expect, it, vi } from "vitest";

vi.mock("../../api-core", () => ({
  fetcher: vi.fn(),
  postJson: vi.fn(),
  putJson: vi.fn(),
  toApiUrl: (path: string) => path,
}));

import { fetcher, putJson } from "../../api-core";
import { defectsApi } from "../defects";

describe("defectsApi management category", () => {
  it("category query and record update use the management-category contract", () => {
    defectsApi.listDefects({ management_category: "B_GRADE" });
    defectsApi.updateManagementCategory("record-1", {
      management_category: "OBSOLETE",
      expected_management_category: "B_GRADE",
      memo: "구형 전환",
      actor_employee_id: "employee-1",
      pin: "0000",
    });

    expect(fetcher).toHaveBeenCalledWith("/api/defects/locations?management_category=B_GRADE");
    expect(putJson).toHaveBeenCalledWith(
      "/api/defects/records/record-1/management-category",
      expect.objectContaining({ management_category: "OBSOLETE" }),
    );
  });
});
