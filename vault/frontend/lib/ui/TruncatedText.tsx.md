---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/ui/TruncatedText.tsx
tags: [vault, code-note, auto-generated, stub]
---

# TruncatedText.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/ui/TruncatedText.tsx]]

## 원본 첫 줄

```
"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Tooltip } from "./Tooltip";

/**
 * TruncatedText — `@/lib/ui/TruncatedText`.
 *
 * Tailwind `truncate` 로 끝이 `…` 처리된 텍스트에 즉시(0ms) hover 툴팁 표시.
 * 실제로 잘렸을 때(`scrollWidth > clientWidth`)만 툴팁 노출 — 짧은 텍스트엔 노이즈 없음.
 *
 * 사용:
 *   <TruncatedText className="truncate text-sm font-semibold" style={{ color }}>
 *     {item_name}
 *   </TruncatedText>
 *
 * suffix 가 붙는 composite 케이스(예: `{item_code} · 자식 N개`)에서 풀텍스트를 따로
 * 보여주고 싶으면 `tooltipContent` 로 override.
 */
interface Props {
  className?: string;
  style?: CSSProperties;
  /** 화면에 표시되는 내용 (truncate 됨). 단순 문자열 또는 ReactNode. */
  children: ReactNode;
  /** 툴팁에 표시할 내용 override. 기본 = children. */
  tooltipContent?: ReactNode;
  /** 기본 true — BOM 품목명은 길어 nowrap 시 화면 밖으로 나감. */
  multiline?: boolean;
  side?: "top" | "bottom";
}
```
