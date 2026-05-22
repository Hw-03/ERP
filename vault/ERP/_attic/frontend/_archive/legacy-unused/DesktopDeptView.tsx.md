---
type: file-explanation
source_path: "_attic/frontend/_archive/legacy-unused/DesktopDeptView.tsx"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DesktopDeptView.tsx — DesktopDeptView.tsx 설명

## 이 파일은 무엇을 책임지나

`DesktopDeptView.tsx`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DesktopDeptView`
- `Department`
- `Employee`
- `Item`
- `ShipPackage`

## 연결되는 파일

- [[ERP/_attic/frontend/_archive/legacy-unused/📁_legacy-unused]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```tsx
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
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [department, setDepartment] = useState<(typeof DEPARTMENT_OPTIONS)[number]>("조립");
  const [mode, setMode] = useState<"in" | "out">("out");
  const [usePackage, setUsePackage] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [itemId, setItemId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [localSearch, setLocalSearch] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadData() {
    const [nextEmployees, nextItems, nextPackages] = await Promise.all([
      api.getEmployees({ activeOnly: true }),
      api.getItems({ limit: 2000, search: globalSearch.trim() || undefined }),
      api.getShipPackages(),
    ]);
    setEmployees(nextEmployees);
    setItems(nextItems);
    setPackages(nextPackages);
    onStatusChange(`${department} 부서 입출고 준비를 마쳤습니다.`);
```
