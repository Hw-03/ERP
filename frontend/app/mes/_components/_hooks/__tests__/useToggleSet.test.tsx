import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useToggleSet } from "../useToggleSet";

describe("useToggleSet", () => {
  it("빈 배열로 시작한다", () => {
    const { result } = renderHook(() => useToggleSet());
    expect(result.current.selected).toEqual([]);
  });

  it("toggle 로 값을 추가/제거한다", () => {
    const { result } = renderHook(() => useToggleSet());
    act(() => result.current.toggle("a"));
    expect(result.current.selected).toEqual(["a"]);
    act(() => result.current.toggle("b"));
    expect(result.current.selected).toEqual(["a", "b"]);
    act(() => result.current.toggle("a"));
    expect(result.current.selected).toEqual(["b"]);
  });

  it("setSelected 로 직접 설정/해제한다", () => {
    const { result } = renderHook(() => useToggleSet());
    act(() => result.current.setSelected(["x", "y"]));
    expect(result.current.selected).toEqual(["x", "y"]);
    act(() => result.current.setSelected([]));
    expect(result.current.selected).toEqual([]);
  });

  it("clear 로 비운다", () => {
    const { result } = renderHook(() => useToggleSet());
    act(() => result.current.toggle("a"));
    act(() => result.current.clear());
    expect(result.current.selected).toEqual([]);
  });

  it("onChange 는 toggle 마다 호출된다 (setSelected/clear 에는 호출 안 됨)", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useToggleSet(onChange));
    act(() => result.current.toggle("a"));
    act(() => result.current.toggle("a"));
    expect(onChange).toHaveBeenCalledTimes(2);
    act(() => result.current.setSelected([]));
    act(() => result.current.clear());
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("toggle 식별자는 렌더 간 안정적이다", () => {
    const { result, rerender } = renderHook(() => useToggleSet());
    const first = result.current.toggle;
    rerender();
    expect(result.current.toggle).toBe(first);
  });

  it("onChange 는 항상 최신 콜백을 사용한다 (ref)", () => {
    const a = vi.fn();
    const b = vi.fn();
    const { result, rerender } = renderHook(({ cb }) => useToggleSet(cb), {
      initialProps: { cb: a },
    });
    act(() => result.current.toggle("x"));
    rerender({ cb: b });
    act(() => result.current.toggle("y"));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
