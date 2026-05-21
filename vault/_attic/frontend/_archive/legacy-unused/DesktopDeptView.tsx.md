---
type: code-note
project: DEXCOWIN MES
layer: attic
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/_attic/frontend/_archive/legacy-unused/DesktopDeptView.tsx
tags: [vault, code-note, auto-generated, stub, mirror-fill]
---

# DesktopDeptView.tsx

> [!info] 1:1 미러 stub
> 탐색기에 보이는 폴더 구조를 vault 에 그대로 반영하기 위한 stub.
> 원본: [[erp/_attic/frontend/_archive/legacy-unused/DesktopDeptView.tsx]]

## 원본 첫 줄 (또는 메타)

```
"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, PackageCheck, RefreshCw, UserRound } from "lucide-react";
import { api, type Department, type Employee, type Item, type ShipPackage } from "@/lib/api";
import { DesktopRightPanel } from "./DesktopRightPanel";
import {
  DEPARTMENT_ICONS,
  LEGACY_COLORS,
  buildItemSearchLabel,
  employeeColor,
  firstEmployeeLetter,
  formatNumber,
  normalizeDepartment,
} from "./legacyUi";

const DEPARTMENT_OPTIONS = ["조립", "고압", "진공", "튜닝", "튜브", "출하"] as const;

function departmentToApiValue(label: (typeof DEPARTMENT_OPTIONS)[number]): Department {
  return label as Department;
}

export function DesktopDeptView({
  globalSearch,
  onStatusChange,
```
