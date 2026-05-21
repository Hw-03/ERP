---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_archive/DeptIOTab.tsx
tags: [vault, code-note, auto-generated, stub]
---

# DeptIOTab.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_archive/DeptIOTab.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type Department, type Employee, type Item, type ShipPackage } from "@/lib/api";
import { BottomSheet } from "./BottomSheet";
import type { ToastState } from "./Toast";
import {
  DEPARTMENT_ICONS,
  LEGACY_COLORS,
  buildItemSearchLabel,
  employeeColor,
  firstEmployeeLetter,
  formatNumber,
  normalizeDepartment,
} from "./legacyUi";

const DEPARTMENTS = ["튜브", "고압", "진공", "튜닝", "조립", "출하"] as const;

function departmentToApiValue(label: (typeof DEPARTMENTS)[number]) {
  const map: Record<(typeof DEPARTMENTS)[number], Department> = {
    튜브: "?쒕툕" as Department,
    고압: "怨좎븬" as Department,
    진공: "吏꾧났" as Department,
    튜닝: "?쒕떇" as Department,
    조립: "議곕┰" as Department,
    출하: "異쒗븯" as Department,
  };
  return map[label];
}

```
