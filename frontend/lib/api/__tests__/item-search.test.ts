import { beforeEach, describe, expect, it, vi } from "vitest";
import { itemSearchApi } from "../item-search";
import { ApiError } from "../../api-core";
const session = vi.hoisted(() => ({ value: { token: "operator-token" } as { token: string } | null }));
vi.mock("../../auth/operator-session", () => ({ restoreOperatorSession: () => session.value }));
vi.mock("../../auth/login-recovery", () => ({ requestOperatorLogin: vi.fn() }));
describe("검색 설정 API", () => {
  beforeEach(() => { session.value = { token: "operator-token" }; vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ alias_id: "a", alias: "모터" })))); });
  it("별칭 쓰기는 복원된 작업자 토큰을 명시하고 품목 경로를 인코딩한다", async () => {
    await itemSearchApi.addAlias("part/1", "모터");
    const [path, options] = vi.mocked(fetch).mock.calls[0];
    expect(path).toBe("/api/item-search/items/part%2F1/aliases");
    expect(new Headers(options?.headers).get("X-Operator-Session")).toBe("operator-token");
    expect(JSON.parse(options?.body as string)).toEqual({ alias: "모터" });
  });
  it("그룹 수정과 삭제는 읽은 그룹 버전을 전달한다", async () => {
    await itemSearchApi.updateGroup("g", ["모터", "motor"], 3);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)).toEqual({ terms: ["모터", "motor"], expected_version: 3 });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await itemSearchApi.deleteGroup("g", 3);
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe("/api/item-search/synonym-groups/g?expected_version=3");
  });
  it("작업자 세션이 없으면 쓰기 요청을 보내지 않는다", async () => {
    session.value = null;
    await expect(itemSearchApi.addAlias("i", "모터")).rejects.toBeInstanceOf(ApiError);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("조회에는 작업자 토큰을 붙이지 않는다", async () => {
    await itemSearchApi.getConfig();
    expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).has("X-Operator-Session")).toBe(false);
  });
});
