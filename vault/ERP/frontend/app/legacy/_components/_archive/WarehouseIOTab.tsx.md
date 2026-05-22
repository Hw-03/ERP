---
type: file-explanation
source_path: "frontend/app/legacy/_components/_archive/WarehouseIOTab.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# WarehouseIOTab.tsx — WarehouseIOTab.tsx 설명

## 이 파일은 무엇을 책임지나

`WarehouseIOTab.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `WarehouseIOTab`
- `Employee`
- `Item`
- `WMode`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_archive/📁__archive]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { api, type Employee, type Item } from "@/lib/api";
import { BottomSheet } from "./BottomSheet";
import type { ToastState } from "./Toast";
import {
  LEGACY_COLORS,
  buildItemSearchLabel,
  employeeColor,
  firstEmployeeLetter,
  formatNumber,
  normalizeDepartment,
} from "./legacyUi";

type WMode = "wh2d" | "d2wh" | "whin";

const MODES: { id: WMode; icon: string; label: string }[] = [
  { id: "wh2d", icon: "🏭→🔧", label: "창고→생산부" },
  { id: "d2wh", icon: "🔧→🏭", label: "생산부→창고" },
  { id: "whin", icon: "📥", label: "창고 입고" },
];

function previewFlow(mode: WMode) {
  if (mode === "wh2d") return { from: "🏭 창고", to: "🔧 생산부" };
  if (mode === "d2wh") return { from: "🔧 생산부", to: "🏭 창고" };
  return { from: "🚚 외부", to: "🏭 창고" };
}

export function WarehouseIOTab({
  showToast,
  onOpenHistory,
}: {
  showToast: (toast: ToastState) => void;
  onOpenHistory: () => void;
}) {
  const [mode, setMode] = useState<WMode>("wh2d");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [selectedItems, setSelectedItems] = useState<Map<string, number>>(new Map());
  const [note, setNote] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([api.getEmployees({ activeOnly: true }), api.getItems({ limit: 2000 })]).then(
```
