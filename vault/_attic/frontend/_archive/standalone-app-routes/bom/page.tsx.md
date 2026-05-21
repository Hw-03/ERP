---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/frontend/_archive/standalone-app-routes/bom/page.tsx
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# page.tsx

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/frontend/_archive/standalone-app-routes/bom/page.tsx]]

## 원본 첫 줄 (또는 메타)

```
"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, Save, Trash2 } from "lucide-react";

import AppHeader from "@/components/AppHeader";
import {
  api,
  type BOMEntry,
  type BOMTreeNode,
  type Item,
  type ProductionCheckResponse,
  type ProductionReceiptResponse,
} from "@/lib/api";

function TreeNode({ node, depth = 0 }: { node: BOMTreeNode; depth?: number }) {
  return (
    <div className="space-y-2">
      <div
        className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3"
        style={{ marginLeft: depth * 16 }}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-slate-100">{node.item_name}</p>
```
