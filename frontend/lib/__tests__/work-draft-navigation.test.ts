// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-core";
import { OPERATOR_LOGIN_CHANGED } from "@/lib/auth/login-recovery";
import { installWorkDraftCacheGuard } from "@/lib/queries/workDraftCache";
import { queryKeys } from "@/lib/queries/keys";
import { clearWorkListReturns, readWorkListReturn, resumeWorkListShippingEntry, saveWorkListReturn, withoutWorkListReturn, type WorkListReturn } from "../work-draft-navigation";

const login = vi.hoisted(() => ({ employeeId: "a", token: "private-token", generation: 1, version: 0, valid: true }));
vi.mock("@/lib/auth/operator-session", () => ({ restoreOperatorSession: (id?: string) =>
  login.valid && (!id || id === login.employeeId) ? { employee_id: login.employeeId, token: login.token } : null }));
vi.mock("@/app/mes/_components/login/useCurrentOperator", () => ({ getOperatorAccessContext: () =>
  ({ employeeId: login.employeeId, login: login.generation, version: login.version }) }));

const snapshot: WorkListReturn = { scope: "all", filters: { search: "BAT", requester_department: "출하", skip: 30, limit: 30, sort: "updated_asc" },
  filtersOpen: true, selected: { kind: "shipping", id: "shipping-1" }, scrollTop: 800, scrollLeft: 90, listScrolled: true };
const cleanups: Array<() => void> = [];
beforeEach(() => {
  clearWorkListReturns(); Object.assign(login, { employeeId: "a", token: "private-token", generation: 1, version: 0, valid: true });
  window.history.replaceState({ __NA: true, tree: { keep: true } }, "", "/mes?tab=warehouse&step=4&draftId=old");
});
afterEach(() => { cleanups.splice(0).forEach((dispose) => dispose()); clearWorkListReturns(); vi.restoreAllMocks(); });

describe("작업 목록의 이력별 복귀 주소", () => {
  it("현재 entry만 교체하고 Next 상태를 보존하며 이력에는 식별 키만 남긴다", () => {
    const count = window.history.length;
    saveWorkListReturn("a", snapshot);
    expect(window.history.length).toBe(count);
    expect(window.location.search).toBe("?tab=warehouse&section=cart");
    expect(window.history.state).toMatchObject({ __NA: true, tree: { keep: true } });
    expect(JSON.stringify(window.history.state)).not.toMatch(/private-token|BAT|shipping-1/);
    expect(readWorkListReturn("a")).toEqual(snapshot);
  });

  it("서로 다른 이력과 반복 뒤로·앞으로는 각자의 스냅샷을 계속 복원한다", () => {
    saveWorkListReturn("a", snapshot);
    const first = { state: window.history.state, href: window.location.href };
    window.history.pushState(null, "", "/mes?tab=warehouse&section=cart");
    expect(readWorkListReturn("a")).toBeNull();
    const secondSnapshot = { ...snapshot, filters: { search: "SOLO" }, scrollTop: 40 };
    saveWorkListReturn("a", secondSnapshot);
    const second = { state: window.history.state, href: window.location.href };
    for (let i = 0; i < 2; i += 1) {
      window.history.replaceState(first.state, "", first.href);
      expect(readWorkListReturn("a")).toEqual(snapshot);
      window.history.replaceState(second.state, "", second.href);
      expect(readWorkListReturn("a")).toEqual(secondSnapshot);
    }
    window.history.replaceState(withoutWorkListReturn(first.state), "", first.href);
    expect(readWorkListReturn("a")).toBeNull();
    expect(window.history.state.tree).toEqual({ keep: true });
  });

  it.each(["employee", "login", "token", "permission", "expired"])("%s 경계가 바뀌면 같은 이력도 복원하지 않는다", (boundary) => {
    saveWorkListReturn("a", snapshot);
    if (boundary === "employee") login.employeeId = "b";
    if (boundary === "login") login.generation += 1;
    if (boundary === "token") login.token = "new-token";
    if (boundary === "permission") login.version += 1;
    if (boundary === "expired") login.valid = false;
    expect(readWorkListReturn("a")).toBeNull();
  });

  it("화면 밖의 직원 변경과 인증 실패는 복귀 기록도 폐기한다", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    cleanups.push(installWorkDraftCacheGuard(client), () => client.clear());
    saveWorkListReturn("a", snapshot);
    login.version += 1;
    window.dispatchEvent(new Event(OPERATOR_LOGIN_CHANGED));
    login.version -= 1;
    expect(readWorkListReturn("a")).toBeNull();
    saveWorkListReturn("a", snapshot);
    await expect(client.fetchQuery({ queryKey: queryKeys.stockRequests.workDrafts("a", {}),
      queryFn: () => Promise.reject(new ApiError("expired", 401)) })).rejects.toThrow("expired");
    expect(readWorkListReturn("a")).toBeNull();
  });

  it("이탈 취소는 일치하는 출하 상세 entry로만 앞으로 이동하고 원본 URL을 덮지 않는다", () => {
    saveWorkListReturn("a", snapshot);
    const forward = vi.spyOn(window.history, "forward").mockImplementation(() => {});
    const href = window.location.href;
    expect(resumeWorkListShippingEntry("a", "?tab=shipping&shippingView=requestDetail&shippingRequestId=wrong")).toBe(false);
    expect(resumeWorkListShippingEntry("a", "?tab=shipping&shippingView=requestDetail&shippingRequestId=shipping-1")).toBe(true);
    expect(forward).toHaveBeenCalledOnce();
    expect(window.location.href).toBe(href);
    expect(readWorkListReturn("a")).toEqual(snapshot);
  });
});
