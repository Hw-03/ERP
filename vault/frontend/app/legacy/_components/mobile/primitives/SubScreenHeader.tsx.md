---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/mobile/primitives/SubScreenHeader.tsx
tags: [vault, code-note, auto-generated, stub]
---

# SubScreenHeader.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/mobile/primitives/SubScreenHeader.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { ArrowLeft } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";
import { IconButton } from "./IconButton";

/**
 * 모바일 sub-screen sticky 헤더 — 뒤로가기 + 제목/부제 + 우측 옵션.
 * WeeklyReportScreen · PlaceholderScreen 공통.
 */
export function SubScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-2 border-b px-3 py-3"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <IconButton icon={ArrowLeft} label="뒤로" size="md" onClick={onBack} />
      <div className="min-w-0 flex-1">
        {subtitle ? (
```
