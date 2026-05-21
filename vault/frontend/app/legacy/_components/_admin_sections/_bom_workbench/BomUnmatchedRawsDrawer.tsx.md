---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/_bom_workbench/BomUnmatchedRawsDrawer.tsx
tags: [vault, code-note, auto-generated, stub]
---

# BomUnmatchedRawsDrawer.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/_bom_workbench/BomUnmatchedRawsDrawer.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown, AlertCircle, CheckCircle2 } from "lucide-react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TruncatedText } from "@/lib/ui";
import { BomBadge } from "./BomBadge";

/**
 * 미배치 원자재 패널 — 부서 R 단계 중 어느 BOM 의 자식도 아닌 항목.
 *
 * 화면 하단 접이식. 빨간 카운트(미배치 있음) / 초록 ✓(완료) 으로 상태 표시.
 * 클릭하면 펼쳐서 항목 리스트.
 */
interface Props {
  rawItems: Item[]; // 부서 R 단계 전체
  childIdSet: Set<string>; // 자식으로 등록된 모든 item_id
}

export function BomUnmatchedRawsDrawer({ rawItems, childIdSet }: Props) {
  const [open, setOpen] = useState(false);
  const unmatched = rawItems.filter((i) => !childIdSet.has(i.item_id));
  const isEmpty = unmatched.length === 0;
  const accent = isEmpty ? LEGACY_COLORS.green : LEGACY_COLORS.red;

  return (
    <div
      className="rounded-2xl border"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
```
