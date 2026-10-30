"use client";

import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactElement, type ReactNode, type RefObject } from "react";
import { Maximize, Minus, Plus } from "lucide-react";
import styles from "./CostCompactTree.module.css";

export type CostTreeView = { x: number; y: number; scale: number };
export type CostTreeCamera = { getView: () => CostTreeView; setView: (view: CostTreeView) => void; fit: (widthOnly?: boolean) => void };
const MIN_SCALE = .0001;
const MAX_SCALE = 2.5;
const ZOOM_STEP = 1.2;

/** Zoom about a screen point so the item beneath the pointer does not jump. */
function zoomAt(view: CostTreeView, requestedScale: number, x: number, y: number): CostTreeView {
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, requestedScale));
  const ratio = scale / view.scale;
  return { x: x - (x - view.x) * ratio, y: y - (y - view.y) * ratio, scale };
}

/** Move ordinary accessible BOM cards with a camera, without native canvas scrollbars. */
export function CostTreeCanvas({ children, toolbar, branchControls, context, viewportRef, cameraRef, onClear }: {
  children: ReactNode; toolbar?: ReactNode; branchControls?: ReactNode; context?: ReactNode;
  viewportRef?: RefObject<HTMLDivElement | null>; cameraRef?: RefObject<CostTreeCamera | null>; onClear?: () => void;
}): ReactElement {
  const localViewport = useRef<HTMLDivElement>(null);
  const viewport = viewportRef ?? localViewport;
  const content = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<CostTreeView>({ x: 0, y: 0, scale: 1 });
  const currentView = useRef(view);
  const drag = useRef<{ id: number; x: number; y: number; view: CostTreeView } | null>(null);
  const moved = useRef(false);
  const [dragging, setDragging] = useState(false);
  const instructionsId = useId();
  const applyView = useCallback((next: CostTreeView): void => {
    currentView.current = next;
    setView(next);
  }, []);
  const fit = useCallback((widthOnly = false): void => {
    const frame = viewport.current, tree = content.current;
    if (!frame?.clientWidth || !frame.clientHeight || !tree?.offsetWidth || !tree.offsetHeight) return;
    const scale = Math.max(MIN_SCALE, Math.min(1, (frame.clientWidth - 48) / tree.offsetWidth, widthOnly ? 1 : (frame.clientHeight - 48) / tree.offsetHeight));
    applyView({ x: (frame.clientWidth - tree.offsetWidth * scale) / 2, y: widthOnly ? 24 : (frame.clientHeight - tree.offsetHeight * scale) / 2, scale });
  }, [viewport, applyView]);
  const zoom = useCallback((factor: number, absolute = false): void => {
    const frame = viewport.current;
    if (frame) applyView(zoomAt(currentView.current, absolute ? factor : currentView.current.scale * factor, frame.clientWidth / 2, frame.clientHeight / 2));
  }, [viewport, applyView]);
  useImperativeHandle(cameraRef, () => ({ getView: () => currentView.current, setView: applyView, fit }), [applyView, fit]);

  useEffect(() => {
    const frame = viewport.current;
    if (!frame) return;
    function wheel(event: WheelEvent): void {
      if (event.ctrlKey || !event.deltaY) return;
      event.preventDefault();
      const bounds = frame!.getBoundingClientRect();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? frame!.clientHeight : 1;
      const delta = Math.max(-600, Math.min(600, event.deltaY * unit));
      applyView(zoomAt(currentView.current, currentView.current.scale * Math.exp(-delta * .002), event.clientX - bounds.left, event.clientY - bounds.top));
    }
    frame.addEventListener("wheel", wheel, { passive: false });
    return () => frame.removeEventListener("wheel", wheel);
  }, [viewport, applyView]);

  function start(event: PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || drag.current || (event.target as Element).closest("article,button,input,select,a,[role=button]")) return;
    const frame = event.currentTarget;
    moved.current = false;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, view: currentView.current };
    frame.setPointerCapture(event.pointerId);
    frame.focus({ preventScroll: true });
    event.preventDefault();
  }
  function move(event: PointerEvent<HTMLDivElement>): void {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!moved.current && Math.hypot(dx, dy) < 5) return;
    moved.current = true;
    setDragging(true);
    applyView({ ...currentView.current, x: start.view.x + dx, y: start.view.y + dy });
  }
  function end(event: PointerEvent<HTMLDivElement>): void {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.type === "pointercancel") moved.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  /** Keyboard focus may scroll a clipped card into view; absorb that movement into the camera. */
  function normalizeScroll(): void {
    const frame = viewport.current;
    if (!frame || (!frame.scrollLeft && !frame.scrollTop)) return;
    const { scrollLeft, scrollTop } = frame;
    frame.scrollLeft = 0; frame.scrollTop = 0;
    applyView({ ...currentView.current, x: currentView.current.x - scrollLeft, y: currentView.current.y - scrollTop });
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey) return;
    const directions: Record<string, [number, number]> = { ArrowLeft: [-40, 0], ArrowRight: [40, 0], ArrowUp: [0, -40], ArrowDown: [0, 40] };
    if (event.key === "+" || event.key === "=") zoom(ZOOM_STEP);
    else if (event.key === "-") zoom(1 / ZOOM_STEP);
    else if (event.key === "0") zoom(1, true);
    else if (event.key === "Home") fit();
    else if (directions[event.key]) {
      const [x, y] = directions[event.key];
      applyView({ ...currentView.current, x: currentView.current.x + x, y: currentView.current.y + y });
    } else return;
    event.preventDefault();
  }
  return <div className={styles.shell} data-cost-tree>
    <div className={styles.toolbar}>{toolbar}<div role="group" aria-label="가계도 보기 조절" className={styles.controls}>{branchControls}
      <div role="group" aria-label="가계도 확대·축소" className={styles.zoomControls}>
        <button type="button" aria-label="가계도 축소" title="축소 (-)" disabled={view.scale <= MIN_SCALE} onClick={() => zoom(1 / ZOOM_STEP)}><Minus size={16} /></button>
        <output aria-label="가계도 배율">{(view.scale * 100).toLocaleString("ko-KR", { maximumFractionDigits: view.scale < .01 ? 2 : 0 })}%</output>
        <button type="button" aria-label="가계도 확대" title="확대 (+)" disabled={view.scale >= MAX_SCALE} onClick={() => zoom(ZOOM_STEP)}><Plus size={16} /></button>
        <button type="button" aria-label="가계도 100%" title="원래 크기 (0)" onClick={() => zoom(1, true)}>100%</button>
        <button type="button" aria-label="가계도 전체 맞춤" title="현재 펼친 구성을 화면에 맞추기 (Home)" className={styles.overview} onClick={() => fit()}><Maximize size={15} />전체 맞춤</button>
      </div>
    </div></div>
    {context}
    <p id={instructionsId} className="sr-only">휠로 확대·축소하고 빈 배경을 드래그해 이동합니다. 방향키로 이동, 더하기·빼기로 확대·축소, 0으로 100%, Home으로 전체 맞춤을 합니다. Esc는 계통 강조를 해제합니다.</p>
    <div ref={viewport} role="group" aria-label="품목 원가 가계도" aria-describedby={instructionsId} tabIndex={0}
      className={styles.viewport} data-dragging={dragging} onKeyDown={keyboard} onScroll={normalizeScroll}
      onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={() => { drag.current = null; setDragging(false); }}
      onClick={event => {
        if (moved.current) { moved.current = false; return; }
        if (!(event.target as HTMLElement).closest("article,button,input,select,a")) onClear?.();
      }}>
      <div ref={content} className={styles.content} data-testid="cost-tree-content" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, "--tree-view-left": `${-view.x / view.scale}px`, "--tree-view-scale": view.scale } as CSSProperties}>{children}</div>
    </div>
  </div>;
}
