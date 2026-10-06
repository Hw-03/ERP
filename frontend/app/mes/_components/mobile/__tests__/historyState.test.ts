import { expect, it } from "vitest";
import { mobileHistoryState } from "../historyState";

it("preserves mobile metadata but lets Next synchronize native navigation", () => {
  const source = { __NA: true, _N: true, __PRIVATE_NEXTJS_INTERNALS_TREE: {}, defect: "hub", mobileShippingIndex: 2 };
  expect(mobileHistoryState(source, 3)).toEqual({ defect: "hub", mobileShippingIndex: 3 });
  expect(source.__NA).toBe(true);
});
