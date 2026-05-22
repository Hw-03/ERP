---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/frontend/_archive/standalone-app-routes/inventory/page.tsx
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# page.tsx

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/frontend/_archive/standalone-app-routes/inventory/page.tsx]]

## 원본 첫 줄 (또는 메타)

```
﻿"use client";

import { Suspense, useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownUp,
  ArchiveX,
  Boxes,
  Minus,
  PackageSearch,
  Pencil,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";

import AppHeader from "@/components/AppHeader";
import { api, type Category, type Item, type TransactionLog } from "@/lib/api";

const CATEGORY_OPTIONS: { label: string; value: Category | "ALL" }[] = [
  { label: "전체", value: "ALL" },
  { label: "원자재", value: "RM" },
  { label: "튜브 반제품", value: "TA" },
  { label: "튜브 완제품", value: "TF" },
```
