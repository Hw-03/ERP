"use client";

// 모달/시트가 열려있는 동안 Tab/Shift+Tab 을 컨테이너 안에서 순환시키는 훅.
// active=false 가 되면 cleanup 시 직전 포커스 요소로 복원한다.
// 외부 라이브러리 미사용 — 의존성 0.

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

    // 초기 포커스
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
      // 이전 포커스 복원 — DOM 에 없으면 no-op (옵셔널 체이닝)
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus?.();
      }
    };
  }, [active, initialFocusRef]);

  return ref;
}
