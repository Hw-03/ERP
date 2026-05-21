---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_sections/MyRequestsPanel.tsx
tags: [vault, code-note, auto-generated, stub]
---

# MyRequestsPanel.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_warehouse_sections/MyRequestsPanel.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type StockRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { EmptyState, LoadFailureCard, LoadingSkeleton } from "../common";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { MyRequestRow } from "./MyRequestRow";

interface Props {
  employeeId: string | null;
  refreshNonce: number;
  onChanged: () => void;
}

export function MyRequestsPanel({ employeeId, refreshNonce, onChanged }: Props) {
  const [items, setItems] = useState<StockRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<StockRequest | null>(null);
  const [cancelPin, setCancelPin] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!employeeId) {
      setItems([]);
      return;
    }
    setLoading(true);
```
