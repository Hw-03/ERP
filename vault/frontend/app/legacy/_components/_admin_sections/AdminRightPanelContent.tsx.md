---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/AdminRightPanelContent.tsx
tags: [vault, code-note, auto-generated, stub]
---

# AdminRightPanelContent.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/AdminRightPanelContent.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import type { Dispatch, SetStateAction } from "react";
import type { BOMDetailEntry, DepartmentMaster, Employee, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { DeptManagementPanel } from "./DeptManagementPanel";

/**
 * Round-11A (#4) 추출 — DesktopAdminView 우측 요약/안내 패널.
 *
 * `section === "departments"` 분기는 DeptManagementPanel 또는 안내 카드,
 * 그 외 section 은 안내 카드 + 현재 상태 요약.
 */
export interface AdminRightPanelContentProps {
  section: string;
  selectedDept: DepartmentMaster | null;
  setSelectedDept: Dispatch<SetStateAction<DepartmentMaster | null>>;
  departments: DepartmentMaster[];
  setDepartments: Dispatch<SetStateAction<DepartmentMaster[]>>;
  adminPin: string;
  onStatusChange: (status: string) => void;
  setMessage: (m: string) => void;

  items: Item[];
  employees: Employee[];
  allBomRows: BOMDetailEntry[];
}

export function AdminRightPanelContent({
```
