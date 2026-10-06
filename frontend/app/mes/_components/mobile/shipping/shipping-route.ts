import type { ShippingHistoryStatus } from "@/lib/api";

export type ShippingStep = 1 | 2 | 3 | 4 | 5;
export type MobileShippingView = "hub" | "requestList" | "requestDetail" | "requestWork" | "historyList" | "historyWork";
export type ShippingRoute = { view: MobileShippingView; requestId: string | null; step: ShippingStep; historyStatus: ShippingHistoryStatus };

/** PC에서 발행한 준비 화면 링크도 같은 요청의 모바일 관리 화면으로 연다. */
export function readShippingRoute(search: string): ShippingRoute {
  const params = new URLSearchParams(search);
  const rawView = params.get("shippingView");
  const view = rawView === "prepList" ? "requestList" : rawView === "prepWork" ? "requestDetail" : rawView;
  const valid = ["requestList", "requestDetail", "requestWork", "historyList", "historyWork"].includes(view ?? "");
  const step = Number(params.get("shippingStep"));
  return {
    view: valid ? view as MobileShippingView : "hub",
    requestId: params.get("shippingRequestId"),
    step: Number.isInteger(step) && step >= 1 && step <= 5 ? step as ShippingStep : 1,
    historyStatus: params.get("shippingHistoryStatus") === "CANCELLED" ? "CANCELLED" : "PICKED_UP",
  };
}

export function shippingRouteUrl(href: string, route: ShippingRoute): string {
  const url = new URL(href);
  const params = url.searchParams;
  params.set("tab", "shipping");
  for (const key of ["shippingView", "shippingRequestId", "shippingStep", "shippingHistoryStatus"]) params.delete(key);
  if (route.view !== "hub") params.set("shippingView", route.view);
  if (route.requestId) params.set("shippingRequestId", route.requestId);
  if (route.view === "requestWork") params.set("shippingStep", String(route.step));
  if (route.view === "historyList" || route.view === "historyWork") params.set("shippingHistoryStatus", route.historyStatus);
  return `${url.pathname}${url.search}${url.hash}`;
}
