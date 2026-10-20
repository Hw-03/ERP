"use client";

import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { defaultRangeExtractor, measureElement, useVirtualizer, type Range } from "@tanstack/react-virtual";

export interface AdminVirtualOptions<T> {
  getKey: (item: T) => string;
  estimateSize: number;
  pinnedKeys?: string[];
}
interface Props<T> extends AdminVirtualOptions<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  scrollRef: RefObject<HTMLDivElement | null>;
}

/** 작은 목록은 그대로 두고, 큰 목록의 포커스·편집·드래그 행은 화면 밖에서도 유지한다. */
export function AdminVirtualRows<T>(props: Props<T>): ReactNode {
  return props.items.length <= 80
    ? props.items.map(props.renderItem)
    : <VirtualRows {...props} />;
}

const FOCUSABLE = 'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]';

function VirtualRows<T>({ items, renderItem, scrollRef, getKey, estimateSize, pinnedKeys = [] }: Props<T>): ReactNode {
  "use no memo";
  const root = useRef<HTMLDivElement>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [pendingFocus, setPendingFocus] = useState<{ index: number; direction: number } | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const getItemKey = useCallback((index: number) => getKey(items[index]), [getKey, items]);
  const rangeExtractor = useCallback((range: Range): number[] => {
    const indices = new Set(defaultRangeExtractor(range));
    items.forEach((item, index) => {
      const key = getKey(item);
      if (key === focusedKey || pinnedKeys.includes(key) || index === pendingFocus?.index) indices.add(index);
    });
    return [...indices].sort((a, b) => a - b);
  }, [items, getKey, focusedKey, pinnedKeys, pendingFocus]);
  // This component opts out of memoization above; the mutable virtualizer must stay live.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    getItemKey,
    estimateSize: () => estimateSize,
    measureElement: (element, entry, instance) => measureElement(element, entry, instance) || estimateSize,
    overscan: 8,
    scrollMargin,
    rangeExtractor,
    initialRect: { width: 400, height: 600 },
    useFlushSync: false,
  });
  const rows = virtualizer.getVirtualItems();

  useLayoutEffect(() => {
    const element = root.current;
    const viewport = scrollRef.current;
    if (!element || !viewport) return;
    const measure = (): void => {
      setScrollMargin(element.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    return () => observer.disconnect();
  }, [scrollRef, items.length]);

  useLayoutEffect(() => {
    if (!pendingFocus) return;
    const row = root.current?.querySelector<HTMLElement>(`[data-index="${pendingFocus.index}"]`);
    const targets = row?.querySelectorAll<HTMLElement>(FOCUSABLE);
    const target = pendingFocus.direction < 0 ? targets?.[targets.length - 1] : targets?.[0];
    if (target) {
      target.focus({ preventScroll: true });
      setPendingFocus(null);
    } else if (row) {
      const index = pendingFocus.index + pendingFocus.direction;
      setPendingFocus(index >= 0 && index < items.length ? { ...pendingFocus, index } : null);
    }
  }, [rows, pendingFocus, items.length]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const target = event.target as HTMLElement;
    const row = target.closest<HTMLElement>("[data-admin-virtual-row]");
    if (!row || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const index = Number(row.dataset.index);
    const controls = [...row.querySelectorAll<HTMLElement>(FOCUSABLE)];
    let next: number | undefined;
    const direction = event.shiftKey || event.key === "ArrowUp" || event.key === "Home" ? -1 : 1;
    if (event.key === "Tab" && target === (event.shiftKey ? controls[0] : controls.at(-1))) next = index + direction;
    if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA" && target.tagName !== "SELECT") {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") next = index + direction;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = items.length - 1;
    }
    if (next === undefined || next < 0 || next >= items.length) return;
    event.preventDefault();
    virtualizer.scrollToIndex(next, { align: "auto" });
    setPendingFocus({ index: next, direction });
  }

  return <div ref={root} data-admin-virtual-list style={{ height: virtualizer.getTotalSize(), position: "relative", flexShrink: 0 }}
    onKeyDownCapture={handleKeyDown}
    onFocusCapture={(event) => setFocusedKey((event.target as HTMLElement).closest<HTMLElement>("[data-admin-virtual-row]")?.dataset.adminVirtualRow ?? null)}
    onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusedKey(null); }}>
    {rows.map((row) => <div key={row.key} ref={virtualizer.measureElement} data-index={row.index}
      data-admin-virtual-row={getKey(items[row.index])}
      style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${row.start - scrollMargin}px)` }}>
      {renderItem(items[row.index], row.index)}
    </div>)}
  </div>;
}
