---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_history_sections/HistoryBatchDetailPanel.tsx
tags: [vault, code-note, auto-generated, stub]
---

# HistoryBatchDetailPanel.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_history_sections/HistoryBatchDetailPanel.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { useEffect, useState } from "react";
import { GitBranch, Package } from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import { ioApi } from "@/lib/api/io";
import type { IoBatch, IoBundle, IoLine } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { transactionColor } from "@/lib/mes-status";
import { formatQty } from "@/lib/mes/format";
import {
  describeBatchFlow,
  getBatchFlowEndpoints,
  getHistoryActor,
  getHistoryBomParentLine,
  getHistoryDisplayLabel,
  getHistoryLineSignedQuantity,
  getHistoryLineStatusLabel,
  getHistoryMovementSummary,
  getHistoryWorkTypeLabel,
  type LineSignTone,
} from "./historyBatchInterpreter";
import { formatHistoryDateTimeLong } from "./historyFormat";
import { FlowBadge, MovementSummaryCell } from "./historyTableHelpers";

const SIGN_TONE_HEX: Record<LineSignTone, string> = {
  increase: LEGACY_COLORS.blue,
  decrease: LEGACY_COLORS.red,
  move: LEGACY_COLORS.cyan,
  muted: LEGACY_COLORS.muted2,
```
