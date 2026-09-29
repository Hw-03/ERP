import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, type BOMTreeNode } from "@/lib/api";
import { useBomTree } from "../BomSubExpander";

const revision = vi.hoisted(() => ({ value: 0 }));
vi.mock("@/lib/queries/realtime", () => ({ useRealtimeRevision: () => revision.value }));

const tree: BOMTreeNode = { item_id: "a", mes_code: "A", item_name: "품목 A", process_type_code: null, unit: "개", required_quantity: 1, current_stock: 5, children: [] };

describe("BOM 조회 상태", () => {
  beforeEach(() => { revision.value = 0; vi.restoreAllMocks(); });

  it("갱신 실패와 재시도 중에도 같은 품목의 트리를 유지한다", async () => {
    vi.spyOn(api, "getBOMTree").mockResolvedValueOnce(tree).mockRejectedValueOnce(new Error("offline")).mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(() => useBomTree("a", true));
    await waitFor(() => expect(result.current.tree).toEqual(tree));
    revision.value = 1;
    rerender();
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.refreshError).toBeTruthy();
    act(() => result.current.retry());
    expect(result.current.tree).toEqual(tree);
    expect(result.current.refreshError).toBeNull();
  });

  it("새 품목을 선택하면 이전 품목의 트리를 표시하지 않는다", async () => {
    vi.spyOn(api, "getBOMTree").mockResolvedValueOnce(tree).mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(({ id }) => useBomTree(id, true), { initialProps: { id: "a" } });
    await waitFor(() => expect(result.current.tree).toEqual(tree));
    rerender({ id: "b" });
    expect(result.current.tree).toBeNull();
    expect(result.current.refreshError).toBeNull();
  });
  it("다른 품목 조회 중 원래 품목으로 복귀해 실패하면 로딩을 종료한다", async () => {
    vi.spyOn(api, "getBOMTree").mockResolvedValueOnce(tree)
      .mockReturnValueOnce(new Promise(() => {}))
      .mockRejectedValueOnce(new Error("offline"))
      .mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(({ id }) => useBomTree(id, true), { initialProps: { id: "a" } });
    await waitFor(() => expect(result.current.tree).toEqual(tree));
    rerender({ id: "b" });
    rerender({ id: "a" });
    await waitFor(() => expect(result.current.tree).toBe(false));
    expect(result.current.error).toBe(true);
    act(() => result.current.retry());
    expect(result.current.tree).toBeNull();
    expect(result.current.error).toBe(false);
  });
});
