import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useChunkedRender } from "../useChunkedRender";

describe("useChunkedRender", () => {
  it("기본 chunkSize 50 — 첫 50개만 visible", () => {
    const items = Array.from({ length: 200 }, (_, i) => i);
    const { result } = renderHook(() => useChunkedRender(items));
    expect(result.current.visible).toHaveLength(50);
    expect(result.current.shown).toBe(50);
    expect(result.current.total).toBe(200);
    expect(result.current.hasMore).toBe(true);
  });

  it("items 길이 ≤ chunkSize → 전부 visible, hasMore=false", () => {
    const items = [1, 2, 3];
    const { result } = renderHook(() => useChunkedRender(items, 50));
    expect(result.current.visible).toEqual([1, 2, 3]);
    expect(result.current.hasMore).toBe(false);
  });

  it("커스텀 chunkSize 적용", () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const { result } = renderHook(() => useChunkedRender(items, 10));
    expect(result.current.visible).toHaveLength(10);
    expect(result.current.hasMore).toBe(true);
  });

  it("items 변경 시 첫 chunk 로 리셋", () => {
    const items1 = Array.from({ length: 100 }, (_, i) => i);
    const items2 = Array.from({ length: 50 }, (_, i) => i + 1000);
    const { result, rerender } = renderHook(({ list }) => useChunkedRender(list, 20), {
      initialProps: { list: items1 },
    });
    expect(result.current.shown).toBe(20);
    rerender({ list: items2 });
    expect(result.current.shown).toBe(20);
    expect(result.current.visible[0]).toBe(1000);
  });
});
