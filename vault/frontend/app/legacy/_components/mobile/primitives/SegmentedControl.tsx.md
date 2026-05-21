---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/mobile/primitives/SegmentedControl.tsx
tags: [vault, code-note, auto-generated, stub]
---

# SegmentedControl.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/mobile/primitives/SegmentedControl.tsx]]

## 원본 첫 줄

```
"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";

export interface SegmentedTab<T extends string = string> {
  id: T;
  label: string;
  badge?: string | number | null;
}

/**
 * 모바일 세그먼트 컨트롤 — `s2 + border + p-1` 트레이, 활성은 `s1 + shadow`.
 * ItemDetailSheet · IoHubScreen · HistoryScreen · HistoryDetailSheet 공통.
 */
export function SegmentedControl<T extends string>({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: SegmentedTab<T>[];
  active: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
```
