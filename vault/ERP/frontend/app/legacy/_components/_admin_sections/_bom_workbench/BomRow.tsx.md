---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/_bom_workbench/BomRow.tsx
tags: [vault, code-note, auto-generated, stub]
---

# BomRow.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/_bom_workbench/BomRow.tsx]]

## 원본 첫 줄

```
"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { BOMEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { TruncatedText } from "@/lib/ui";
import { BomBadge } from "./BomBadge";

/**
 * BOM 그리드 한 행 — 자식 품목 정보 + 수량(인라인 편집) + 삭제.
 *
 * 인라인 수량 편집:
 *   - 수량 칸 클릭 → input 노출 + 자동 select
 *   - Enter / blur 저장 (parseFloat > 0 검증)
 *   - Esc 취소
 *
 * 삭제는 부모에서 ConfirmModal 띄우도록 onRequestDelete 콜백.
 */
interface Props {
  row: BOMEntry;
  childItem: Item | undefined;
  onSaveQty: (bomId: string, qty: number) => void | Promise<void>;
  onRequestDelete: (row: BOMEntry, childName: string) => void;
}

export function BomRow({ row, childItem, onSaveQty, onRequestDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(row.quantity));
```
