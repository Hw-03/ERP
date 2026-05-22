---
type: file-explanation
source_path: "frontend/lib/mes/useFocusTrap.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useFocusTrap.ts — useFocusTrap.ts 설명

## 이 파일은 무엇을 책임지나

`useFocusTrap.ts`는 MES 화면에서 반복해서 쓰는 표시 규칙, 색상, 포맷, 상태값을 정리한 공용 파일입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `useFocusTrap`

## 연결되는 파일

- [[ERP/frontend/lib/mes/📁_mes]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
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
```
