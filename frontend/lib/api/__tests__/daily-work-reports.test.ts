import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-core", () => ({
  fetcher: vi.fn(),
  putJson: vi.fn(),
  toApiUrl: (path: string) => path,
}));

import { fetcher, putJson } from "@/lib/api-core";
import { dailyWorkReportsApi } from "../daily-work-reports";

describe("dailyWorkReportsApi", () => {
  it("선택 일자의 작성 일지를 조회한다", async () => {
    vi.mocked(fetcher).mockResolvedValueOnce([]);

    await dailyWorkReportsApi.list("2026-07-28");

    expect(fetcher).toHaveBeenCalledWith("/api/daily-work-reports?work_date=2026-07-28", undefined);
  });

  it("본인 일지를 actor id와 함께 저장한다", async () => {
    vi.mocked(putJson).mockResolvedValueOnce({} as never);

    await dailyWorkReportsApi.save("employee-1", "2026-07-28", {
      actorEmployeeId: "employee-1",
      content: "오늘 작업 내용",
    });

    expect(putJson).toHaveBeenCalledWith(
      "/api/daily-work-reports/employee-1/2026-07-28",
      { actor_employee_id: "employee-1", content: "오늘 작업 내용" },
    );
  });
});
