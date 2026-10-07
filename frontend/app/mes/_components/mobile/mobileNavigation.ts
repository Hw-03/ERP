import type { MobileTabId } from "./MobileShell";
import { mobileHistoryState } from "./historyState";

/** 메뉴와 대상 진입은 이전 업무의 URL·이력 상태를 새 화면에 복사하지 않는다. */
export function mobileTabLocation(href: string, target: MobileTabId, index: number): { url: string; state: Record<string, unknown> } {
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("tab", target);
  return {
    url: `${url.pathname}${url.search}`,
    state: mobileHistoryState(target === "defect" ? { defect: "hub" } : null, index),
  };
}
