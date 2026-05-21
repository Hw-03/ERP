---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/DeptManagementPanel.tsx
tags: [vault, code-note, auto-generated, stub]
---

# DeptManagementPanel.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/DeptManagementPanel.tsx]]

## 원본 첫 줄

```
"use client";

import { useEffect, useRef, useState } from "react";
import { api, type DepartmentMaster } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { employeeColor } from "@/lib/mes/color";
import { useRefreshDepartments } from "../DepartmentsContext";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";

/**
 * 우측 패널의 부서 상세 편집 영역.
 *
 * DesktopAdminView 본체에서 분리 — 부서 색상 변경 / 활성 토글 / 영구 삭제만 담당.
 * 화면 구조 / 동작 / 스타일은 그대로 유지한다.
 */
export interface DeptManagementPanelProps {
  dept: DepartmentMaster;
  adminPin: string;
  /**
   * 호출처에서 전달하지만 패널 본문에서는 사용하지 않는다 (호환 유지용).
   * 미래에 부서 목록 기반 조작이 들어올 자리.
   */
  departments: DepartmentMaster[];
  setDepartments: (updater: (prev: DepartmentMaster[]) => DepartmentMaster[]) => void;
  setSelectedDept: (d: DepartmentMaster | null) => void;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
}

export function DeptManagementPanel({
```
