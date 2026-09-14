// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api-core", () => ({
  fetcher: vi.fn(),
  postJson: vi.fn(),
  putJson: vi.fn(),
  toApiUrl: (path: string) => path,
}));

import { fetcher, postJson, putJson } from "../../api-core";
import { defectsApi } from "../defects";

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

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

describe("defectsApi uncertain result retries", () => {
  it("격리 결과 불명 뒤 수량을 수정해도 최초 요청 ID와 payload를 재전송한다", async () => {
    vi.mocked(postJson)
      .mockRejectedValueOnce(new TypeError("lost response"))
      .mockResolvedValueOnce(undefined);
    const payload = {
      item_id: "item-1",
      qty: 2,
      source: "warehouse" as const,
      target_dept: "창고",
      reason_memo: "최초 격리",
      actor_employee_id: "employee-1",
      client_request_id: "quarantine-command-1",
    };

    await expect(defectsApi.quarantine(payload)).rejects.toThrow("lost response");
    await defectsApi.quarantine({ ...payload, qty: 9, reason_memo: "수정됨" });

    expect(vi.mocked(postJson).mock.calls[1][1]).toEqual(
      vi.mocked(postJson).mock.calls[0][1],
    );
  });

  it("정상 복귀 결과 불명 뒤 수량을 수정해도 최초 payload를 재전송한다", async () => {
    vi.mocked(postJson)
      .mockRejectedValueOnce(new TypeError("lost response"))
      .mockResolvedValueOnce(undefined);
    const payload = {
      record_id: "record-1",
      item_id: "item-1",
      qty: 2,
      dept: "창고",
      actor_employee_id: "employee-1",
      client_request_id: "restore-command-1",
    };

    await expect(defectsApi.unquarantine(payload)).rejects.toThrow("lost response");
    await defectsApi.unquarantine({ ...payload, qty: 9, reason_memo: "수정됨" });

    expect(vi.mocked(postJson).mock.calls[1][1]).toEqual(
      vi.mocked(postJson).mock.calls[0][1],
    );
  });
});
