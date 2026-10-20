"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { adminFadeDuration } from "./adminFadeDuration";

/** 최초 조회나 재시도가 끝난 프레임에 페이드하며 폼과 레이아웃은 유지한다. */
export function useAdminReadReveal<T extends HTMLElement = HTMLDivElement>(
  loading: boolean,
  unavailable = false,
  targetRef?: RefObject<T | null>,
): RefObject<T | null> {
  const ownRef = useRef<T>(null);
  const ref = targetRef ?? ownRef;
  const wasLoading = useRef(loading);

  useLayoutEffect(() => {
    const resolved = wasLoading.current && !loading;
    wasLoading.current = loading;
    if (!resolved || unavailable) return;
    const element = ref.current?.style.display === "contents" ? ref.current.parentElement : ref.current;
    if (!element?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (element.closest('[data-admin-entry-covered="true"]')) return;
    const section = element.closest<HTMLElement>("[data-admin-section-reveal]");
    if (section && Number.parseFloat(getComputedStyle(section).opacity) < 1) return;
    const animation = element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: adminFadeDuration(element, "read"), easing: "ease-out" });
    return () => animation.cancel();
  }, [loading, unavailable, ref]);

  return ref;
}
