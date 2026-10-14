import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stocktakeApi } from "@/lib/api/stocktake";
import { restoreOperatorSession, validateTabOwnership } from "@/lib/auth/operator-session";
import { invalidateOperationalQueries } from "@/lib/queries/realtime";
import { useStocktakeMenuVisibility } from "./useStocktakeMenuVisibility";

vi.mock("@/lib/api/stocktake", () => ({ stocktakeApi: { read: vi.fn() } }));
vi.mock("@/lib/auth/operator-session", () => ({ restoreOperatorSession: vi.fn(), validateTabOwnership: vi.fn() }));
const operator = { employee_id: "employee-a" };
const visibility = { enabled: true, employee_visible: true, participant_departments: ["조립"], participant_count: 3 };
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}
beforeEach(() => {
  vi.mocked(validateTabOwnership).mockReset().mockResolvedValue(true);
  vi.mocked(restoreOperatorSession).mockReturnValue({ token: "token-a", employee_id: "employee-a", tab_id: "tab-a", expires_at: "2099-01-01T00:00:00Z" });
  vi.mocked(stocktakeApi.read).mockReset().mockResolvedValue(visibility);
});
describe("stocktake menu visibility", () => {
  it("새 문서에서 저장한 탭 소유권을 확인한 뒤 일반 직원 메뉴를 복원한다", async () => {
    vi.mocked(restoreOperatorSession).mockReturnValue(null);
    vi.mocked(validateTabOwnership).mockImplementation(async () => {
      vi.mocked(restoreOperatorSession).mockReturnValue({ token: "token-a", employee_id: "employee-a", tab_id: "tab-a", expires_at: "2099-01-01T00:00:00Z" });
      return true;
    });
    const { wrapper } = setup();
    const { result } = renderHook(() => useStocktakeMenuVisibility(operator), { wrapper });
    await waitFor(() => expect(result.current.data?.employee_visible).toBe(true));
    expect(validateTabOwnership).toHaveBeenCalled();
  });
  it("조회 중이거나 토큰이 없을 때는 표시 설정을 전달하지 않는다", () => {
    vi.mocked(stocktakeApi.read).mockReturnValue(new Promise(() => {}));
    const { wrapper } = setup();
    const { result, rerender } = renderHook(({ current }) => useStocktakeMenuVisibility(current), { wrapper, initialProps: { current: operator as typeof operator | null } });
    expect(result.current.isPending).toBe(true);
    expect(result.current.data).toBeUndefined();
    vi.mocked(stocktakeApi.read).mockClear();
    rerender({ current: null });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
    expect(stocktakeApi.read).not.toHaveBeenCalled();
  });
  it("읽는 토큰별 캐시를 사용하고 기존 realtime 무효화에 반응한다", async () => {
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useStocktakeMenuVisibility(operator), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(visibility));
    expect(stocktakeApi.read).toHaveBeenCalledWith("/api/stocktakes/menu-visibility", "token-a", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(client.getQueryData(["stocktake", "menu-visibility", "token-a"])).toEqual(visibility);
    vi.mocked(stocktakeApi.read).mockResolvedValue({ ...visibility, enabled: false, employee_visible: true });
    await act(async () => { await invalidateOperationalQueries(client); });
    await waitFor(() => expect(result.current.data?.enabled).toBe(false));
    expect(result.current.data?.employee_visible).toBe(true);
    vi.mocked(stocktakeApi.read).mockResolvedValue({ ...visibility, enabled: false, employee_visible: false });
    await act(async () => { await invalidateOperationalQueries(client); });
    await waitFor(() => expect(result.current.data?.employee_visible).toBe(false));
  });
  it("다른 직원의 저장 토큰은 사용하지 않는다", () => {
    vi.mocked(restoreOperatorSession).mockReturnValue({ token: "token-b", employee_id: "employee-b", tab_id: "tab-b", expires_at: "2099-01-01T00:00:00Z" });
    const { wrapper } = setup();
    const { result } = renderHook(() => useStocktakeMenuVisibility(operator), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(stocktakeApi.read).not.toHaveBeenCalled();
  });
  it("조회 실패 때 기존 ON 캐시를 표시 정책에 전달하지 않는다", async () => {
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useStocktakeMenuVisibility(operator), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(visibility));
    vi.mocked(stocktakeApi.read).mockRejectedValue(new Error("offline"));
    await act(async () => { await invalidateOperationalQueries(client); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
