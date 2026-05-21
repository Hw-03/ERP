---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_history_sections/DesktopHistoryRightPanel.tsx
tags: [vault, code-note, auto-generated, stub]
---

# DesktopHistoryRightPanel.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_history_sections/DesktopHistoryRightPanel.tsx]]

## 원본 첫 줄

```
"use client";

import { ChevronLeft } from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import type { IoBatch } from "@/lib/api/types/io";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { SlidePanel } from "../common";
import { DesktopRightPanel } from "../DesktopRightPanel";
import { HistoryDetailPanel } from "./HistoryDetailPanel";
import { HistoryBatchDetailPanel } from "./HistoryBatchDetailPanel";
import type { HistorySelection } from "./historyConstants";

/**
 * Round-13 (#15) 추출 — DesktopHistoryView 우측 슬라이딩 상세 패널.
 * history-batch-detail-2026-05-15: selection union 분기 (kind="log" | "batch").
 */
export interface DesktopHistoryRightPanelProps {
  selection: HistorySelection | null;
  /** 닫히는 동안에도 패널 내용을 유지하기 위한 마지막 selection. */
  displaySelection: HistorySelection | null;
  batchCache: Map<string, IoBatch>;
  setBatchCache: React.Dispatch<React.SetStateAction<Map<string, IoBatch>>>;
  itemRecentLogs: TransactionLog[];
  onSelectLog: (log: TransactionLog) => void;
  /** 드릴(BOM 하위·최근거래) 스택이 있으면 "← 뒤로" 노출. */
  canGoBack: boolean;
  onBack: () => void;
  onLogUpdated: (updated: TransactionLog) => void;
  onLogCorrected: (result: { original: TransactionLog; correction: TransactionLog }) => void;
  /** 패널 닫기 (선택 해제). */
```
