---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/mobile/primitives/PinInput.tsx
tags: [vault, code-note, auto-generated, stub]
---

# PinInput.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/mobile/primitives/PinInput.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";

/**
 * 모바일 PIN 입력 — numeric password + tracking-[0.4em].
 * OperatorMenuSheet · ApprovalQueuePanel · HistoryDetailSheet 공통.
 */
export function PinInput({
  label,
  value,
  onChange,
  maxLength = 8,
  placeholder = "••••",
  className,
}: {
  label?: string;
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={clsx("flex flex-col gap-1", className)}>
      {label ? (
        <span
          className={`${TYPO.caption} font-semibold uppercase tracking-[1px]`}
```
