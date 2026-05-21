---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_sections/WarehouseQueueRow.tsx
tags: [vault, code-note, auto-generated, stub]
---

# WarehouseQueueRow.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_warehouse_sections/WarehouseQueueRow.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import type { StockRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { normalizeDepartment } from "@/lib/mes/department";
import { formatQty } from "@/lib/mes/format";
import { REQUEST_TYPE_LABEL } from "./ioRequestLabels";

/**
 * Round-13 (#4) 추출 — WarehouseQueuePanel 의 단일 request 행.
 *
 * 승인/반려 inline form 표시도 본 컴포넌트에서 처리. state 와 mutator 는 부모에서 받음.
 */
export interface WarehouseQueueRowProps {
  req: StockRequest;
  busyId: string | null;
  approvePinFor: string | null;
  approvePin: string;
  approveError: string | null;
  setApprovePin: (v: string) => void;
  setApprovePinFor: (id: string | null) => void;
  showRejectFor: string | null;
  rejectReason: string;
  rejectPin: string;
  rejectError: string | null;
  setRejectReason: (v: string) => void;
  setRejectPin: (v: string) => void;
  setShowRejectFor: (id: string | null) => void;
  closeApprove: () => void;
  closeReject: () => void;
```
