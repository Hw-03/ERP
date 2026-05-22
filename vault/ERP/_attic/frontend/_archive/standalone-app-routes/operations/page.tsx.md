---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/frontend/_archive/standalone-app-routes/operations/page.tsx
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# page.tsx

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/frontend/_archive/standalone-app-routes/operations/page.tsx]]

## 원본 첫 줄 (또는 메타)

```
"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Minus,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  PackageSearch,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";

import AppHeader from "@/components/AppHeader";
import { api, type Department, type Employee, type Item, type ShipPackage, type TransactionLog } from "@/lib/api";

const DEPARTMENTS: Department[] = ["조립", "고압", "진공", "튜닝", "튜브", "AS", "연구", "영업", "출하", "기타"];

type OpMode = "wh_in" | "wh_out" | "wh2dept" | "dept2wh" | "dept_in" | "dept_pkg";

const OP_MODES: {
```
