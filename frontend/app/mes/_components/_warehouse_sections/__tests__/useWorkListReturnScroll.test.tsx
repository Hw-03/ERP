import { act, fireEvent, render, screen } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkListReturn } from "@/lib/work-draft-navigation";
import { useWorkListReturnScroll } from "../useWorkListReturnScroll";

const snapshot: WorkListReturn = { scope: "all", filters: {}, filtersOpen: false,
  selected: { kind: "shipping", id: "s" }, scrollTop: 800, scrollLeft: 75, outerScrollTop: 500, listScrolled: true };
let controls: ReturnType<typeof useWorkListReturnScroll>;
function Harness({ ready, fetching, outer = false }: { ready: boolean; fetching: boolean; outer?: boolean }) {
  const value = useWorkListReturnScroll(snapshot, ready, fetching);
  useLayoutEffect(() => { controls = value; }, [value]);
  const viewport = <div ref={value.viewportRef} data-testid="viewport"><div /></div>;
  return outer ? <div data-testid="desktop-warehouse-content">{viewport}</div> : viewport;
}
let resized: () => void;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resized = callback; } observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 16));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("작업 목록의 지연된 레이아웃 복원", () => {
  it("목록·상세를 기다리고 높이가 늘면 위치를 복원한 뒤 감시를 종료한다", () => {
    const view = render(<Harness ready={false} fetching />);
    const viewport = screen.getByTestId("viewport");
    const geometry = { height: 300, width: 500 };
    Object.defineProperties(viewport, {
      scrollHeight: { get: () => geometry.height }, clientHeight: { value: 300 },
      scrollWidth: { get: () => geometry.width }, clientWidth: { value: 500 },
    });
    expect(viewport.scrollTop).toBe(0);
    view.rerender(<Harness ready fetching />);
    expect(controls.restoring.current).toBe(true);
    geometry.height = 1600; geometry.width = 900;
    act(() => resized());
    expect(viewport.scrollTop).toBe(800); expect(viewport.scrollLeft).toBe(75);
    view.rerender(<Harness ready fetching={false} />);
    act(() => vi.advanceTimersByTime(40));
    expect(controls.restoring.current).toBe(false);
  });

  it("사용자가 먼저 스크롤하면 늦게 도착한 상세가 위치를 되돌리지 않는다", () => {
    const view = render(<Harness ready={false} fetching />);
    const viewport = screen.getByTestId("viewport");
    fireEvent.wheel(viewport, { deltaY: 60 });
    viewport.scrollTop = 120;
    Object.defineProperties(viewport, { scrollHeight: { value: 1600 }, clientHeight: { value: 300 } });
    view.rerender(<Harness ready fetching={false} />);
    act(() => resized());
    expect(viewport.scrollTop).toBe(120);
    expect(controls.restoring.current).toBe(false);
  });

  it("항목이 사라져 목록이 짧아지면 가능한 끝 위치로 제한한다", () => {
    const view = render(<Harness ready={false} fetching />);
    const viewport = screen.getByTestId("viewport");
    Object.defineProperties(viewport, { scrollHeight: { value: 700 }, clientHeight: { value: 300 } });
    view.rerender(<Harness ready fetching={false} />);
    expect(viewport.scrollTop).toBe(400);
  });

  it("상단 탭과 함께 움직이는 바깥 스크롤의 두 축을 함께 복원한다", () => {
    const view = render(<Harness ready={false} fetching outer />);
    const viewport = screen.getByTestId("viewport");
    const outer = screen.getByTestId("desktop-warehouse-content");
    Object.defineProperties(outer, { scrollHeight: { value: 1500 }, clientHeight: { value: 700 },
      scrollWidth: { value: 1800 }, clientWidth: { value: 1200 } });
    Object.defineProperties(viewport, { scrollWidth: { value: 1800 }, clientWidth: { value: 1200 } });
    view.rerender(<Harness ready fetching={false} outer />);
    expect(outer.scrollTop).toBe(500); expect(outer.scrollLeft).toBe(75);
    expect(viewport.scrollTop).toBe(0); expect(viewport.scrollLeft).toBe(0);
  });
});
