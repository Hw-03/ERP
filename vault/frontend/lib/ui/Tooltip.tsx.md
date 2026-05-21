---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/ui/Tooltip.tsx
tags: [vault, code-note, auto-generated, stub]
---

# Tooltip.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/ui/Tooltip.tsx]]

## 원본 첫 줄

```
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
```
