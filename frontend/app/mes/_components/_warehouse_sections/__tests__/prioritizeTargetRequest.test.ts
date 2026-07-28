import { describe, expect, it } from "vitest";

import { prioritizeTargetRequest } from "../prioritizeTargetRequest";

describe("prioritizeTargetRequest", () => {
  it("moves the notification target to the first visible row", () => {
    const result = prioritizeTargetRequest(
      [{ request_id: "req-1" }, { request_id: "req-2" }, { request_id: "req-3" }],
      "req-3",
    );

    expect(result.map((item) => item.request_id)).toEqual(["req-3", "req-1", "req-2"]);
  });

  it("keeps the server order when the target is absent", () => {
    const result = prioritizeTargetRequest(
      [{ request_id: "req-1" }, { request_id: "req-2" }],
      "missing",
    );

    expect(result.map((item) => item.request_id)).toEqual(["req-1", "req-2"]);
  });
});
