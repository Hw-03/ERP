import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { CostTreeCanvas, type CostTreeCamera } from "../CostTreeCanvas";

class CanvasPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "mouse";
  }
}
const capture = vi.fn();
const clear = vi.fn();
const restorers: (() => void)[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("PointerEvent", CanvasPointerEvent);
  for (const [name, value] of Object.entries({ setPointerCapture: capture, releasePointerCapture: vi.fn(), hasPointerCapture: () => true })) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name);
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value });
    restorers.push(() => { if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor); else Reflect.deleteProperty(HTMLElement.prototype, name); });
  }
});
afterEach(() => { restorers.splice(0).forEach(restore => restore()); vi.unstubAllGlobals(); });
function mount(): HTMLElement {
  render(<CostTreeCanvas onClear={clear}><article><button type="button">품목 선택</button></article></CostTreeCanvas>);
  return screen.getByRole("group", { name: "품목 원가 가계도" });
}

function view(): { x: number; y: number; scale: number } {
  const transform = screen.getByTestId("cost-tree-content").style.transform;
  const values = transform.match(/translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/)!;
  return { x: Number(values[1]), y: Number(values[2]), scale: Number(values[3]) };
}

describe("가계도 확대·축소와 화면 이동", () => {
  it("긴 BOM의 처음 보기는 높이 대신 가로 폭에 맞추고 맨 위에서 시작한다", () => {
    const camera = createRef<CostTreeCamera>();
    render(<CostTreeCanvas cameraRef={camera}><div>긴 BOM</div></CostTreeCanvas>);
    const viewport = screen.getByRole("group", { name: "품목 원가 가계도" });
    Object.defineProperties(viewport, { clientWidth: { value: 1000 }, clientHeight: { value: 600 } });
    Object.defineProperties(screen.getByTestId("cost-tree-content"), { offsetWidth: { value: 2000 }, offsetHeight: { value: 8000 } });
    act(() => camera.current!.fit(true));
    expect(view()).toEqual({ x: 24, y: 24, scale: .476 });
    act(() => camera.current!.fit());
    expect(view().scale).toBeCloseTo(.069);
  });
  it("휠은 포인터 아래 품목 위치를 고정해 확대·축소하고 Ctrl+휠은 브라우저에 남긴다", () => {
    const viewport = mount();
    const before = view();
    const event = new WheelEvent("wheel", { deltaY: -120, clientX: 160, clientY: 90, cancelable: true, bubbles: true });
    act(() => { viewport.dispatchEvent(event); });
    const after = view();
    expect(event.defaultPrevented).toBe(true);
    expect(after.scale).toBeGreaterThan(before.scale);
    expect((160 - after.x) / after.scale).toBeCloseTo((160 - before.x) / before.scale);
    expect((90 - after.y) / after.scale).toBeCloseTo((90 - before.y) / before.scale);
    const browserWheel = new WheelEvent("wheel", { deltaY: 120, ctrlKey: true, cancelable: true, bubbles: true });
    act(() => { viewport.dispatchEvent(browserWheel); });
    expect(browserWheel.defaultPrevented).toBe(false);
    expect(view()).toEqual(after);
  });
  it("버튼으로 확대·축소·100%·현재 구성 전체 맞춤을 한다", () => {
    const viewport = mount();
    const content = screen.getByTestId("cost-tree-content");
    Object.defineProperties(viewport, { clientWidth: { value: 1000 }, clientHeight: { value: 600 } });
    Object.defineProperties(content, { offsetWidth: { value: 2000 }, offsetHeight: { value: 1000 } });
    fireEvent.click(screen.getByRole("button", { name: "가계도 확대" }));
    expect(view().scale).toBeCloseTo(1.2);
    fireEvent.click(screen.getByRole("button", { name: "가계도 축소" }));
    expect(view().scale).toBeCloseTo(1);
    fireEvent.click(screen.getByRole("button", { name: "가계도 전체 맞춤" }));
    expect(view().scale).toBeCloseTo(.476);
    expect(view().x).toBeCloseTo(24);
    expect(view().y).toBeCloseTo(62);
    fireEvent.click(screen.getByRole("button", { name: "가계도 100%" }));
    expect(view().scale).toBe(1);
  });
  it("배경 드래그는 좌표를 옮기며 종료 클릭을 강조 해제로 처리하지 않는다", () => {
    const viewport = mount();
    fireEvent.pointerDown(viewport, { pointerId: 7, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(viewport, { pointerId: 7, clientX: 130, clientY: 150 });
    expect(capture).toHaveBeenCalledWith(7);
    expect(view()).toEqual({ x: 30, y: 50, scale: 1 });
    expect(viewport.scrollLeft).toBe(0); expect(viewport.scrollTop).toBe(0);
    fireEvent.pointerUp(viewport, { pointerId: 7 });
    fireEvent.click(viewport);
    expect(clear).not.toHaveBeenCalled();
    fireEvent.click(viewport);
    expect(clear).toHaveBeenCalledOnce();
  });
  it("작은 포인터 흔들림은 클릭으로, 취소 뒤 이동은 무시한다", () => {
    const viewport = mount();
    fireEvent.pointerDown(viewport, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 102, clientY: 101 });
    fireEvent.pointerUp(viewport, { pointerId: 1 });
    fireEvent.click(viewport);
    expect(clear).toHaveBeenCalledOnce();
    fireEvent.pointerDown(viewport, { pointerId: 2, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerCancel(viewport, { pointerId: 2 });
    fireEvent.pointerMove(viewport, { pointerId: 2, clientX: 200, clientY: 200 });
    expect(viewport.scrollTop).toBe(0);
  });
  it("카드의 버튼은 배경 드래그를 시작하지 않는다", () => {
    const viewport = mount();
    fireEvent.pointerDown(screen.getByRole("button", { name: "품목 선택" }), { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 80, clientY: 80 });
    expect(capture).not.toHaveBeenCalled();
    expect(viewport.scrollTop).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "품목 선택" }));
    expect(clear).not.toHaveBeenCalled();
  });
  it("키보드 이동과 자동 포커스 이동도 스크롤 대신 좌표에 반영한다", () => {
    const viewport = mount();
    fireEvent.keyDown(viewport, { key: "ArrowRight" });
    expect(view().x).toBe(40);
    viewport.scrollLeft = 30; viewport.scrollTop = 80;
    fireEvent.scroll(viewport);
    expect(view()).toEqual({ x: 10, y: -80, scale: 1 });
    expect(viewport.scrollLeft).toBe(0); expect(viewport.scrollTop).toBe(0);
  });
});
