---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_hooks/useAdminViewState.ts
tags: [vault, code-note, auto-generated, stub]
---

# useAdminViewState.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_hooks/useAdminViewState.ts]]

## 원본 첫 줄

```
"use client";

import { useCallback, useState } from "react";
import type { DepartmentMaster } from "@/lib/api";

/**
 * 관리자 화면의 UI 상태 묶음.
 *
 * Round-10B (#1) 추출. DesktopAdminView 의 top-level UI useState 5개 +
 * section→panel 강제오픈 effect 1개를 단일 hook 으로 묶었다.
 *
 * 데이터 / 도메인 상태는 useAdminBootstrap, useAdminSettings 가 담당하고,
 * 본 hook 은 잠금/탭/우측 패널/선택 부서 같은 화면 표현 상태만 책임진다.
 */
export type AdminSection =
  | "items"
  | "employees"
  | "models"
  | "bom"
  | "export"
  | "audit"
  | "settings"
  | "departments";

export interface UseAdminViewStateResult {
  unlocked: boolean;
  adminPin: string;
  section: AdminSection;
  showRightPanel: boolean;
  selectedDept: DepartmentMaster | null;
```
