"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/** 선택이 바뀐 상세 영역만 페이드하며 폼 DOM과 입력 상태를 유지한다. */
export function useAdminSelectionFade(selectionKey: string | number | undefined): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  const previousKey = useRef(selectionKey);

  useLayoutEffect(() => {
    if (previousKey.current === selectionKey) return;
    previousKey.current = selectionKey;
    const element = ref.current;
    if (selectionKey === undefined || !element?.animate || element.closest('[data-admin-entry-covered="true"]') || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const duration = Number.parseFloat(getComputedStyle(element).getPropertyValue("--admin-fade-duration"));
    const animation = element.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: "ease-out" });
    return () => animation.cancel();
  }, [selectionKey]);

  return ref;
}
