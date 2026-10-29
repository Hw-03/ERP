import { beforeEach, describe, expect, it, vi } from "vitest";
import { personalMemoApi } from "@/lib/api/personal-memo";

const mocks = vi.hoisted(() => ({ session: vi.fn(), request: vi.fn(), login: vi.fn() }));
vi.mock("@/lib/auth/operator-session", () => ({ restoreOperatorSession: mocks.session }));
vi.mock("@/lib/api/stocktake", () => ({ requestJson: mocks.request }));
vi.mock("@/lib/auth/login-recovery", () => ({ requestOperatorLogin: mocks.login }));

describe("personalMemoApi", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.session.mockReturnValue({ employee_id: "a", token: "token-a" }); });
  it("인증 세션만 전송하고 직원 ID를 요청에 포함하지 않는다", async () => {
    await personalMemoApi.save("a", "메모");
    expect(mocks.request).toHaveBeenCalledWith("/api/personal-memo", "token-a", expect.objectContaining({ method: "PUT", body: JSON.stringify({ content: "메모" }) }));
    await personalMemoApi.get("a");
    expect(mocks.request).toHaveBeenLastCalledWith("/api/personal-memo", "token-a", expect.objectContaining({ cache: "no-store" }));
  });
  it("이전 계정 콜백은 새 계정 토큰으로 저장하지 않는다", async () => {
    mocks.session.mockReturnValue({ employee_id: "b", token: "token-b" });
    await expect(personalMemoApi.save("a", "이전 메모")).rejects.toThrow();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.login).not.toHaveBeenCalled();
  });
  it("세션이 만료되면 재인증을 요청하고 쓰기를 중단한다", async () => {
    mocks.session.mockReturnValue(null);
    await expect(personalMemoApi.save("a", "메모")).rejects.toThrow();
    expect(mocks.login).toHaveBeenCalledOnce();
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
