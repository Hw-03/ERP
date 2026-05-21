---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/CapacityDetailModal.tsx
tags: [vault, code-note, auto-generated, stub]
---

# CapacityDetailModal.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/CapacityDetailModal.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import type { ProductionCapacity, ProductionCapacityStatus } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";

/**
 * Round-13 (#18) 추출 — DesktopLegacyShell 의 생산 가능수량 상세 모달.
 */
export function CapacityDetailModal({
  capacityData,
  onClose,
}: {
  capacityData: ProductionCapacity | null;
  onClose: () => void;
}) {
  const status: ProductionCapacityStatus | null = capacityData
    ? capacityData.status ??
      (capacityData.top_items.length === 0
        ? "bom_not_registered"
        : capacityData.immediate > 0 || capacityData.maximum > 0
          ? "producible"
          : "not_producible")
    : null;

  const emptyMessage = (() => {
    if (capacityData == null) return "데이터를 불러오는 중…";
    switch (status) {
      case "no_target":
        return "생산 가능 품목이 없습니다. BOM/완제품 기준 확인 필요.";
```
