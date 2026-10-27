import { useLayoutEffect, useRef, type RefObject } from "react";
import type { WorkListReturn } from "@/lib/work-draft-navigation";

/** Restore after rows and detail exist; layout changes and late responses may still resize the viewport. */
export function useWorkListReturnScroll(snapshot: WorkListReturn | null, ready: boolean, fetching: boolean): {
  viewportRef: RefObject<HTMLDivElement | null>;
  restoring: RefObject<boolean>;
  cancelRestore: () => void;
} {
  const viewportRef = useRef<HTMLDivElement>(null);
  const restoring = useRef(Boolean(snapshot));
  const cancel = useRef<() => void>(() => { restoring.current = false; });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!snapshot || !viewport || !restoring.current) return;
    const outer = viewport.closest<HTMLElement>('[data-testid="desktop-warehouse-content"]');
    const inputSurface = outer ?? viewport;
    let frame = 0;
    let generation = 0;
    const finish = (): void => {
      restoring.current = false;
      observer?.disconnect();
      cancelAnimationFrame(frame);
      inputSurface.removeEventListener("wheel", finish);
      inputSurface.removeEventListener("touchstart", finish);
      inputSurface.removeEventListener("pointerdown", finish);
      inputSurface.removeEventListener("keydown", keyDown);
    };
    const keyDown = (event: KeyboardEvent): void => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) finish();
    };
    const attempt = (): void => {
      if (!restoring.current || !ready) return;
      const current = ++generation;
      const targetTop = outer ? snapshot.outerScrollTop ?? snapshot.scrollTop : snapshot.scrollTop;
      inputSurface.scrollTop = Math.min(targetTop, Math.max(0, inputSurface.scrollHeight - inputSurface.clientHeight));
      inputSurface.scrollLeft = Math.min(snapshot.scrollLeft, Math.max(0, inputSurface.scrollWidth - inputSurface.clientWidth));
      cancelAnimationFrame(frame);
      if (!fetching) frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => { if (generation === current) finish(); });
      });
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(attempt);
    observer?.observe(viewport);
    if (outer) observer?.observe(outer);
    if (viewport.firstElementChild) observer?.observe(viewport.firstElementChild);
    inputSurface.addEventListener("wheel", finish, { passive: true });
    inputSurface.addEventListener("touchstart", finish, { passive: true });
    inputSurface.addEventListener("pointerdown", finish, { passive: true });
    inputSurface.addEventListener("keydown", keyDown);
    cancel.current = finish;
    attempt();
    return () => {
      observer?.disconnect(); cancelAnimationFrame(frame);
      inputSurface.removeEventListener("wheel", finish);
      inputSurface.removeEventListener("touchstart", finish);
      inputSurface.removeEventListener("pointerdown", finish);
      inputSurface.removeEventListener("keydown", keyDown);
    };
  }, [snapshot, ready, fetching]);

  return { viewportRef, restoring, cancelRestore: (): void => cancel.current() };
}
