---
type: file-explanation
source_path: "frontend/app/legacy/_components/_archive/DeptIOTab.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DeptIOTab.tsx — DeptIOTab.tsx 설명

## 이 파일은 무엇을 책임지나

`DeptIOTab.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DeptIOTab`
- `Department`
- `Employee`
- `Item`
- `ShipPackage`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_archive/📁__archive]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
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

export function DeptIOTab({
  showToast,
  onOpenHistory,
}: {
  showToast: (toast: ToastState) => void;
  onOpenHistory: () => void;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [department, setDepartment] = useState<(typeof DEPARTMENTS)[number]>("조립");
  const [mode, setMode] = useState<"in" | "out">("out");
  const [employeeId, setEmployeeId] = useState("");
  const [usePackage, setUsePackage] = useState(false);
  const [search, setSearch] = useState("");
  const [itemId, setItemId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
```
