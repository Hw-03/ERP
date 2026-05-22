---
type: file-explanation
source_path: "frontend/lib/ui/Tooltip.tsx"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# Tooltip.tsx — Tooltip.tsx 설명

## 이 파일은 무엇을 책임지나

`Tooltip.tsx`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/lib/ui/Tooltip.tsx` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `Tooltip`
- `ReactNode`
- `Props`

## 연결되는 파일

- [[ERP/frontend/lib/ui/📁_ui]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```tsx
"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LEGACY_COLORS } from "@/lib/mes/color";

/**
 * Tooltip — `@/lib/ui/Tooltip`.
 *
 * 자체 React 툴팁. 브라우저 기본 `title` 툴팁의 대체.
 * - 마우스 호버 즉시 노출 (지연 0)
 * - LEGACY_COLORS 톤
 * - `pointer-events-none` 으로 자체가 호버를 가로채지 않음
 * - disabled 버튼 위에서도 동작 (wrapper span 이 이벤트 받음)
 * - **document.body 포털 + position:fixed** — 부모의 overflow/transform 영향 무시,
 *   테이블 셀 안에서도 잘리지 않고 최상단에 노출.
 */

interface Props {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  /** true 면 툴팁 표시 자체를 끔. content 가 비어도 자동으로 안 뜸. */
  disabled?: boolean;
  /** true 면 multi-line content 허용 (whitespace-normal + max-width). 기본 false (한 줄 nowrap). */
  multiline?: boolean;
  /**
   * trigger wrapper span 의 className 을 override.
   * 기본 "relative inline-flex" — `min-w-0` 부모 안에서 truncate 자식을 감쌀 땐
   * `"relative block min-w-0 w-full"` 같이 block 계열로 바꿔야 truncate 가 깨지지 않음.
   */
  triggerClassName?: string;
}

export function Tooltip({
  content,
  children,
  side = "top",
  disabled = false,
  multiline = false,
  triggerClassName = "relative inline-flex",
}: Props) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const show = !disabled && pos && content;

  const handleEnter = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const left = rect.left + rect.width / 2;
    const top = side === "top" ? rect.top - 6 : rect.bottom + 6;
    setPos({ left, top });
  };
  const handleLeave = () => setPos(null);
```
