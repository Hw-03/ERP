---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_history_sections/historyTableHelpers.tsx
tags: [vault, code-note, auto-generated, stub]
---

# historyTableHelpers.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_history_sections/historyTableHelpers.tsx]]

## 원본 첫 줄

```
"use client";

import {
  Activity, AlertCircle, ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine,
  BookmarkMinus, BookmarkPlus, ChevronDown, ChevronRight, Hammer, Layers,
  PackageX, Recycle, ShieldAlert, Sliders, Trash2, Undo2, Wrench,
} from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { transactionColor, transactionIconName } from "@/lib/mes-status";
import {
  describeBatchFlow,
  getHistoryActor,
  getHistoryDisplayLabel,
  getHistoryMovementSummary,
  type MovementSummary,
  type MovementTone,
} from "./historyBatchInterpreter";
import { isReworkOperation } from "./transactionTaxonomy";
import { formatHistoryDate } from "./historyFormat";

const TX_ICON = {
  ArrowDownToLine, ArrowUpFromLine, Sliders, Hammer, Recycle, Trash2,
  AlertCircle, Wrench, Undo2, BookmarkPlus, BookmarkMinus, ArrowRightLeft,
  ShieldAlert, PackageX, Activity,
} as const;

export function FlowBadge({
  type,
```
