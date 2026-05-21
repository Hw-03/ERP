---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/_bom_workbench/BomStatsRow.tsx
tags: [vault, code-note, auto-generated, stub]
---

# BomStatsRow.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/_bom_workbench/BomStatsRow.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import type { BomStatus } from "./bomDept";

/**
 * 통계카드 4장 — 전체 / 완료 / 작업중 / 미착수.
 *
 * KPI 가 곧 부모 리스트 상태 필터 컨트롤. 카드 클릭 시 onChange 로 필터 전환.
 * 같은 카드를 다시 누르면(또는 "전체") ALL 로 해제.
 */
export type StatusFilter = "ALL" | BomStatus;

interface Props {
  total: number;
  done: number;
  wip: number;
  todo: number;
  active: StatusFilter;
  onChange: (next: StatusFilter) => void;
}

const CARDS: { id: StatusFilter; label: string; color: string }[] = [
  { id: "ALL", label: "전체", color: LEGACY_COLORS.muted },
  { id: "done", label: "완료", color: LEGACY_COLORS.green },
  { id: "wip", label: "작업중", color: LEGACY_COLORS.blue },
  { id: "todo", label: "미착수", color: LEGACY_COLORS.yellow },
];

export function BomStatsRow({ total, done, wip, todo, active, onChange }: Props) {
```
