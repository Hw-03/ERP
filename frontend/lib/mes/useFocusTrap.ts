"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTORS =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  options?: { initialFocusRef?: React.RefObject<HTMLElement> },
) {
  const ref = useRef<T>(null);
  const initialFocusRef = options?.initialFocusRef;

  useEffect(() => {
    if (!active || !ref.current) return;

    const container = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(
        (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
      );

    const initialEl = initialFocusRef?.current ?? focusables()[0];
    initialEl?.focus?.();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && current === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", handleKey);
    return () => {
      container.removeEventListener("keydown", handleKey);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus?.();
      }
    };
  }, [active, initialFocusRef]);

  return ref;
}
