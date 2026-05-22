---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/AdminDepartmentsSection.tsx
tags: [vault, code-note, auto-generated, stub]
---

# AdminDepartmentsSection.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/AdminDepartmentsSection.tsx]]

## 원본 첫 줄

```
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Palette, Plus, Trash2, X } from "lucide-react";
import {
  api,
  type DepartmentMaster,
  type Employee,
  type Item,
} from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { getDepartmentFallbackColor, normalizeDepartment } from "@/lib/mes/department";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { EmptyState } from "../common";
import { FilterChip } from "../common/FilterChip";
import { StatusPill } from "../common/StatusPill";
import {
  AdminDetailCard,
  AdminKpiBar,
  AdminListPanel,
  AdminPageHeader,
} from "./_admin_primitives";
import { useAdminDepartmentsContext } from "./AdminDepartmentsContext";
import { useRefreshDepartments } from "../DepartmentsContext";

function deptColor(d: DepartmentMaster): string {
  return d.color_hex ?? getDepartmentFallbackColor(d.name);
}

interface Props {
```
