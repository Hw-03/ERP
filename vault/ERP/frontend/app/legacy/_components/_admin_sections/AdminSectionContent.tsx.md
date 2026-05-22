---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/AdminSectionContent.tsx
tags: [vault, code-note, auto-generated, stub]
---

# AdminSectionContent.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/AdminSectionContent.tsx]]

## 원본 첫 줄

```
"use client";

import type { Dispatch, SetStateAction } from "react";
import type { BOMDetailEntry, DepartmentMaster, Employee, Item, ProductModel } from "@/lib/api";
import { api } from "@/lib/api";
import { AdminMasterItemsSection } from "./AdminMasterItemsSection";
import { AdminEmployeesSection } from "./AdminEmployeesSection";
import { BomWorkbench } from "./_bom_workbench/BomWorkbench";
import { AdminMasterItemsProvider } from "./AdminMasterItemsContext";
import { AdminEmployeesProvider } from "./AdminEmployeesContext";
import { AdminModelsProvider } from "./AdminModelsContext";
import { AdminModelsSection } from "./AdminModelsSection";
import { AdminExportSection } from "./AdminExportSection";
import { AdminAuditLogSection } from "./AdminAuditLogSection";
import { AdminDangerZone } from "./AdminDangerZone";
import { AdminDepartmentsProvider } from "./AdminDepartmentsContext";
import { AdminDepartmentsSection } from "./AdminDepartmentsSection";

/**
 * Round-11A (#4) 추출 — DesktopAdminView 의 section 별 콘텐츠 분기.
 *
 * 7 section (items / employees / bom / models / departments / export / settings)
 * 의 Provider + Section 매핑을 부모 파일에서 분리해 본 컴포넌트로 흡수.
 */
type PinForm = { current_pin: string; new_pin: string; confirm_pin: string };

export interface AdminSectionContentProps {
  section: string;
  globalSearch: string;
  onStatusChange: (status: string) => void;
```
