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

describe("defectsApi report statistics", () => {
  it("encodes the report URL with repeated category filters and single drilldowns", () => {
    defectsApi.getStatisticsReport({
      period: "month", anchor: "2026-10-06",
      departments: ["조립", "품질 관리"], models: ["DX 100", "SOLO"],
      process_steps: ["A", "F"], reason: "조립/외관", item_id: "item #1",
    });

    const url = vi.mocked(fetcher).mock.calls.at(-1)?.[0] as string;
    const [path, search] = url.split("?");
    expect(path).toBe("/api/defects/statistics/report");
    const params = new URLSearchParams(search);
    expect(params.get("period")).toBe("month");
    expect(params.get("anchor")).toBe("2026-10-06");
    expect(params.getAll("department")).toEqual(["조립", "품질 관리"]);
    expect(params.getAll("model")).toEqual(["DX 100", "SOLO"]);
    expect(params.getAll("process_step")).toEqual(["A", "F"]);
    expect(params.getAll("reason")).toEqual(["조립/외관"]);
    expect(params.getAll("item_id")).toEqual(["item #1"]);
  });
});
