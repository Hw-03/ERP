---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/_bom_workbench/BomParentList.tsx
tags: [vault, code-note, auto-generated, stub]
---

# BomParentList.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/_bom_workbench/BomParentList.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { useMemo, useState } from "react";
import type { BOMDetailEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TruncatedText } from "@/lib/ui";
import { BomBadge } from "./BomBadge";
import { BomSearchInput } from "./BomSearchInput";
import { BOM_STATUS_META, bomStatusOf, stageOf, type DeptLetter, type StageLetter } from "./bomDept";
import type { StatusFilter } from "./BomStatsRow";
import { EmptyState } from "../../common";

/**
 * 좌측 부모 품목 리스트 — 선택된 부서의 품목을 검색/단계/상태 필터링.
 *
 * 모드:
 *   - "edit"     : R 단계 제외 (BOM 부모로만 가능)
 *   - "whereused": 모든 단계 포함 (자식이 될 수 있는 품목 전체)
 *
 * 상태(완료/작업중/미착수)는 completedSet + 부서 내 자식 count 로 계산.
 * statusFilter 는 상단 KPI(BomStatsRow) 가 제어.
 */
interface Props {
  dept: DeptLetter;
  items: Item[];
  allBomRows: BOMDetailEntry[];
  completedSet: Set<string>;
  statusFilter: StatusFilter;
  selectedId: string;
  onSelect: (id: string) => void;
```
