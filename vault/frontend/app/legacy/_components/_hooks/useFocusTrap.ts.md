---
type: code-note
project: ERP
layer: frontend
source_path: erp/frontend/app/legacy/_components/_hooks/useFocusTrap.ts
status: active
updated: 2026-04-27
source_sha: 9b684005d7c0
tags:
  - erp
  - frontend
  - frontend-hook
  - ts
---

# useFocusTrap.ts

> [!summary] 역할
> 프론트엔드 화면에서 상태, 데이터 로딩, 상호작용 흐름을 재사용하기 위한 React hook이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_hooks/useFocusTrap.ts`
- Layer: `frontend`
- Kind: `frontend-hook`
- Size: `2064` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_hooks/_hooks|frontend/app/legacy/_components/_hooks]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
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
# ... (이하 26줄 생략. 원본 참조)

````
