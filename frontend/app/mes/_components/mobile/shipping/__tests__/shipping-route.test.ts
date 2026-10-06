import { describe, expect, it } from "vitest";
import { readShippingRoute, shippingRouteUrl } from "../shipping-route";

describe("mobile shipping URL contract", () => {
  it("reads desktop edit and history links", () => {
    expect(readShippingRoute("?shippingView=requestWork&shippingRequestId=req-1&shippingStep=3")).toMatchObject({ view: "requestWork", requestId: "req-1", step: 3 });
    expect(readShippingRoute("?shippingView=historyWork&shippingHistoryStatus=CANCELLED").historyStatus).toBe("CANCELLED");
    expect(readShippingRoute("?shippingView=prepWork").view).toBe("requestDetail");
  });
  it("normalizes invalid steps and removes stale route fields at the hub", () => {
    const route = readShippingRoute("?shippingView=unknown&shippingStep=6");
    expect(route).toMatchObject({ view: "hub", step: 1 });
    expect(shippingRouteUrl("http://localhost/mes?tab=warehouse&shippingStep=5&shippingRequestId=old", route)).toBe("/mes?tab=shipping");
  });
});
