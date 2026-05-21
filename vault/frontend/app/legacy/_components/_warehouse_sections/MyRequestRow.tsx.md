---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_sections/MyRequestRow.tsx
tags: [vault, code-note, auto-generated, stub]
---

# MyRequestRow.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_warehouse_sections/MyRequestRow.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import type { StockRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { normalizeDepartment } from "@/lib/mes/department";
import { formatQty } from "@/lib/mes/format";
import { REQUEST_TYPE_LABEL } from "./ioRequestLabels";

const STATUS_LABEL: Record<string, string> = {
  draft: "임시저장",
  submitted: "제출됨",
  reserved: "승인 대기",
  rejected: "반려",
  cancelled: "취소",
  completed: "완료",
  failed_approval: "승인 실패",
};

const STATUS_COLOR: Record<string, string> = {
  draft: LEGACY_COLORS.muted2,
  submitted: LEGACY_COLORS.cyan,
  reserved: LEGACY_COLORS.yellow,
  rejected: LEGACY_COLORS.red,
  cancelled: LEGACY_COLORS.muted2,
  completed: LEGACY_COLORS.green,
  failed_approval: LEGACY_COLORS.red,
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
```
