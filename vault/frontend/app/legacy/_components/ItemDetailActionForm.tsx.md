---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/ItemDetailActionForm.tsx
tags: [vault, code-note, auto-generated, stub]
---

# ItemDetailActionForm.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/ItemDetailActionForm.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";

export type ItemDetailActionMode = "ADJUST" | "RECEIVE";

/**
 * Round-13 (#14) 추출 — ItemDetailSheet 의 mode 선택 + 수량 입력 + 비고 + 제출 폼.
 */
export interface ItemDetailActionFormProps {
  mode: ItemDetailActionMode;
  qty: string;
  notes: string;
  error: string | null;
  saving: boolean;
  initialQuantity: number;
  setMode: (m: ItemDetailActionMode) => void;
  setQty: (v: string) => void;
  setNotes: (v: string) => void;
  bump: (delta: number) => void;
  onSubmit: () => void;
}

export function ItemDetailActionForm({
  mode,
  qty,
  notes,
  error,
  saving,
  initialQuantity,
```
