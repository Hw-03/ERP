---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/mes/useFocusTrap.ts
tags: [vault, code-note, auto-generated, stub]
---

# useFocusTrap.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/mes/useFocusTrap.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
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
```
