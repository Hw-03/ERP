---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_hooks/useAdminDepartments.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useAdminDepartments.ts — useAdminDepartments.ts 설명

## 이 파일은 무엇을 책임지나

`useAdminDepartments.ts`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `useAdminDepartments`
- `COLOR_PALETTE`
- `UseAdminDepartmentsArgs`
- `AdminDepartmentsState`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopAdminView.tsx]] — `DesktopAdminView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/admin.ts]] — `admin.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/settings.py]] — `settings.py`는 `settings` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/backend/app/routers/employees.py]] — `employees.py`는 `employees` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
"use client";

import { useState } from "react";
import type { DepartmentMaster } from "@/lib/api";
import { api } from "@/lib/api";
import { employeeColor } from "@/lib/mes/color";
import { useRefreshDepartments } from "../DepartmentsContext";

export const COLOR_PALETTE = [
  "#1d4ed8", "#c2410c", "#6d28d9", "#0e7490",
  "#be185d", "#b45309", "#0f766e", "#4d7c0f",
  "#9333ea", "#0284c7", "#dc2626", "#059669",
];

function hexToHue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h =
    max === r ? (g - b) / d + (g < b ? 6 : 0)
    : max === g ? (b - r) / d + 2
    : (r - g) / d + 4;
  return (h / 6) * 360;
}

function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function pickAutoColor(existingDepts: DepartmentMaster[]): string {
  const usedColors = existingDepts.map((d) => (d.color_hex ?? employeeColor(d.name)).toLowerCase());
  const unused = COLOR_PALETTE.find((c) => !usedColors.includes(c.toLowerCase()));
  if (unused) return unused;
  const usedHues = usedColors.map(hexToHue);
  let bestColor = COLOR_PALETTE[0]!;
  let bestMinDist = -1;
  for (const c of COLOR_PALETTE) {
    const h = hexToHue(c);
    const minDist = Math.min(...usedHues.map((uh) => hueDist(h, uh)));
    if (minDist > bestMinDist) {
      bestMinDist = minDist;
      bestColor = c;
    }
  }
  return bestColor;
}

export type UseAdminDepartmentsArgs = {
  departments: DepartmentMaster[];
  setDepartments: (updater: (prev: DepartmentMaster[]) => DepartmentMaster[]) => void;
```
