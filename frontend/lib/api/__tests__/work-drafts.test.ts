import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workDraftsApi } from "../work-drafts";

const auth = vi.hoisted(() => ({ employeeId: "actor-a", token: "tab-token" as string | null, owned: true }));
const ownership = vi.hoisted(() => vi.fn<() => Promise<boolean>>());
const recover = vi.hoisted(() => vi.fn());
vi.mock("../../auth/operator-session", () => ({
  restoreOperatorSession: (employeeId?: string) => auth.owned && auth.token && (!employeeId || employeeId === auth.employeeId)
    ? { token: auth.token, employee_id: auth.employeeId } : null,
  validateTabOwnership: ownership,
}));
vi.mock("../../auth/login-recovery", () => ({ requestOperatorLogin: recover }));

const fetchMock = vi.fn<typeof fetch>();
function respond(body: unknown, status = 200): void {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

beforeEach(() => {
  auth.employeeId = "actor-a"; auth.token = "tab-token";
  auth.owned = true; ownership.mockReset(); ownership.mockResolvedValue(true);
  fetchMock.mockReset(); recover.mockReset(); vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("직원 전체 저장 작업 조회 계약", () => {
  it("새로고침의 탭 소유권 확인 중에는 로그인 복구나 조회를 시작하지 않는다", async () => {
    auth.owned = false;
    let finishOwnership!: (valid: boolean) => void;
    ownership.mockImplementation(() => new Promise((resolve) => { finishOwnership = resolve; }));
    respond({ io_count: 3, stock_request_count: 0, total: 3 });
    const pending = workDraftsApi.count("actor-a");
    const result = pending.then((value) => ({ value }), (failure: unknown) => ({ failure }));
    expect(recover).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ownership).toHaveBeenCalledOnce();
    auth.owned = true;
    finishOwnership(true);
    expect(await result).toMatchObject({ value: { total: 3 } });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("X-Operator-Session")).toBe("tab-token");
  });

  it("소유권 확인 뒤에도 인증이 없으면 공개 조회 없이 로그인 복구를 요청한다", async () => {
    auth.owned = false;
    ownership.mockResolvedValue(false);
    await expect(workDraftsApi.count("actor-a")).rejects.toMatchObject({ status: 401 });
    expect(ownership).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recover).toHaveBeenCalledOnce();
  });

  it("소유권 확인 중 계정이 바뀌면 이전 직원 조회에 새 직원 토큰을 쓰지 않는다", async () => {
    auth.owned = false;
    ownership.mockImplementation(async () => { auth.owned = true; auth.employeeId = "actor-b"; return true; });
    await expect(workDraftsApi.count("actor-a")).rejects.toMatchObject({ status: 401 });
    expect(ownership).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recover).not.toHaveBeenCalled();
  });
  it("건수는 현재 인증 직원 전용 경로만 사용한다", async () => {
    respond({ io_count: 3, stock_request_count: 0, total: 3 });
    expect(await workDraftsApi.count("actor-a")).toEqual({ io_count: 3, stock_request_count: 0, total: 3 });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/work-drafts/count");
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("X-Operator-Session")).toBe("tab-token");
  });

  it("단건 복원은 취소 signal과 현재 직원의 인증만 전달한다", async () => {
    respond({ batch_id: "saved/1" });
    const controller = new AbortController();
    await workDraftsApi.getOwnedIo("actor-a", "saved/1", { signal: controller.signal });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/work-drafts/owned-io/saved%2F1");
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    auth.token = null;
    await expect(workDraftsApi.getOwnedIo("actor-a", "saved/1")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("검색과 페이지를 인코딩하고 현재 탭의 작업자 세션만 헤더로 전달한다", async () => {
    respond({ items: [], total: 0, skip: 0, limit: 30 });
    await workDraftsApi.list("actor-a", { search: "튜브 & 부품", requester_department: "조립", requester_employee_id: "owner/b", skip: 0, limit: 30 });
    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(String(url), "http://localhost");
    expect(parsed.pathname).toBe("/api/work-drafts");
    expect(Object.fromEntries(parsed.searchParams)).toEqual({ search: "튜브 & 부품", requester_department: "조립", requester_employee_id: "owner/b", skip: "0", limit: "30" });
    expect(new Headers(init?.headers).get("X-Operator-Session")).toBe("tab-token");
    expect(new Headers(init?.headers).has("X-Admin-Pin")).toBe(false);
    expect(String(url)).not.toContain("tab-token");
    expect(init?.credentials).toBe("include");
  });

  it.each(["updated_asc", "updated_desc", "department"] as const)("%s 정렬을 페이지와 함께 서버에 전달한다", async (sort) => {
    respond({ items: [], total: 0, skip: 30, limit: 30 });
    await workDraftsApi.list("actor-a", { sort, skip: 30, limit: 30 });
    const url = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
    expect(Object.fromEntries(url.searchParams)).toEqual({ sort, skip: "30", limit: "30" });
  });

  it("서로 다른 저장 형식과 식별자를 상세 경로에 보존한다", async () => {
    respond({ kind: "stock_request", id: "old/1" });
    await workDraftsApi.getDetail("actor-a", { kind: "stock_request", id: "old/1" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/work-drafts/stock_request/old%2F1");
  });

  it("작업자 전환 중 이전 직원이 현재 토큰으로 조회하지 않는다", async () => {
    auth.employeeId = "actor-b";
    await expect(workDraftsApi.list("actor-a", {})).rejects.toMatchObject({ code: "OPERATOR_SESSION_INVALID", status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recover).not.toHaveBeenCalled();
  });

  it("토큰이 없으면 정상 로그인 복구를 요청하고 공개 조회로 우회하지 않는다", async () => {
    auth.token = null;
    await expect(workDraftsApi.list("actor-a", {})).rejects.toMatchObject({ code: "OPERATOR_SESSION_INVALID" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recover).toHaveBeenCalledOnce();
  });

  it("서버 인증 거부를 로그인 복구로 연결하고 성공 빈 목록으로 바꾸지 않는다", async () => {
    respond({ detail: { code: "OPERATOR_SESSION_INVALID", message: "작업자 인증을 다시 진행해 주세요." } }, 401);
    await expect(workDraftsApi.list("actor-a", {})).rejects.toMatchObject({ status: 401, code: "OPERATOR_SESSION_INVALID" });
    expect(recover).toHaveBeenCalledWith("tab-token");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(["list", "owned"] as const)("%s 직원 전환의 취소 signal을 실제 조회에 전달한다", async (kind) => {
    const controller = new AbortController();
    fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
    }));
    const pending = kind === "list" ? workDraftsApi.list("actor-a", {}, { signal: controller.signal })
      : workDraftsApi.getOwnedIo("actor-a", "saved", { signal: controller.signal });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});
