import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAdminModelsList } from "../useAdminModelsList";

const M = (slot: number, name = `M${slot}`): any => ({
  slot,
  model_name: name,
  symbol: name.slice(0, 1),
  is_reserved: false,
});

describe("useAdminModelsList", () => {
  it("빈 입력 → items/visibleItems 모두 빈 배열", () => {
    const { result } = renderHook(() => useAdminModelsList({ productModels: [] }));
    expect(result.current.items).toEqual([]);
    expect(result.current.visibleItems).toEqual([]);
  });

  it("입력 그대로 pass-through", () => {
    const models = [M(1), M(2), M(3)];
    const { result } = renderHook(() => useAdminModelsList({ productModels: models }));
    expect(result.current.items).toEqual(models);
    expect(result.current.visibleItems).toEqual(models);
  });

  it("입력 변경 시 visibleItems 동기화", () => {
    const { result, rerender } = renderHook(
      ({ productModels }) => useAdminModelsList({ productModels }),
      { initialProps: { productModels: [M(1)] } },
    );
    expect(result.current.visibleItems).toHaveLength(1);
    rerender({ productModels: [M(1), M(2)] });
    expect(result.current.visibleItems).toHaveLength(2);
  });

  it("동일 reference 입력 시 visibleItems 메모이즈", () => {
    const models = [M(1), M(2)];
    const { result, rerender } = renderHook(
      ({ productModels }) => useAdminModelsList({ productModels }),
      { initialProps: { productModels: models } },
    );
    const first = result.current.visibleItems;
    rerender({ productModels: models });
    expect(result.current.visibleItems).toBe(first);
  });
});
