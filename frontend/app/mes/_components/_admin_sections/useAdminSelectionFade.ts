"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { adminFadeDuration } from "./adminFadeDuration";

/** 선택이 바뀐 상세 영역만 페이드하며 폼 DOM과 입력 상태를 유지한다. */
export function useAdminSelectionFade(selectionKey: string | number | undefined): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  const previousKey = useRef(selectionKey);

  useLayoutEffect(() => {
    if (previousKey.current === selectionKey) return;
    const hadSelection = previousKey.current !== undefined;
    previousKey.current = selectionKey;
    const element = ref.current;
    if (!element?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!hadSelection || selectionKey === undefined || element.closest('[data-admin-entry-covered="true"]')) return;

    const animation = element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: adminFadeDuration(element), easing: "ease-out" });
    return () => animation.cancel();
  }, [selectionKey]);

  return ref;
}
