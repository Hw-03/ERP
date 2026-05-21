---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_sections/DepartmentQueuePanel.tsx
tags: [vault, code-note, auto-generated, stub]
---

# DepartmentQueuePanel.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_warehouse_sections/DepartmentQueuePanel.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type StockRequest } from "@/lib/api";
import { ApiError } from "@/lib/api-core";
import { EmptyState, LoadFailureCard, LoadingSkeleton } from "../common";
import { WarehouseQueueRow } from "./WarehouseQueueRow";

/**
 * 부서 결재 정/부 전용 결재함 (낱개 IO + 듀얼 결재 케이스).
 *
 * WarehouseQueuePanel 와 동일한 행 UI(WarehouseQueueRow)를 재사용하되 API 만
 * department-* 엔드포인트로 교체. actor 의 부서와 일치하는 요청만 노출 (백엔드 필터).
 */

interface Props {
  approverEmployeeId: string;
  refreshNonce: number;
  onChanged: () => void;
}

export function DepartmentQueuePanel({ approverEmployeeId, refreshNonce, onChanged }: Props) {
  const [items, setItems] = useState<StockRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showRejectFor, setShowRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectPin, setRejectPin] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
```
