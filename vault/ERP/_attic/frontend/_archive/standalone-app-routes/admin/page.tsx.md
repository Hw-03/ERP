---
type: file-explanation
source_path: "_attic/frontend/_archive/standalone-app-routes/admin/page.tsx"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# page.tsx — page.tsx 설명

## 이 파일은 무엇을 책임지나

`page.tsx`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `AdminPage`
- `Department`
- `Employee`
- `EmployeeLevel`
- `Item`
- `ShipPackage`

## 연결되는 파일

- [[ERP/_attic/frontend/_archive/standalone-app-routes/admin/📁_admin]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, KeyRound, Lock, Plus, Trash2, Users } from "lucide-react";

import AppHeader from "@/components/AppHeader";
import {
  api,
  type Department,
  type Employee,
  type EmployeeLevel,
  type Item,
  type ShipPackage,
} from "@/lib/api";

const DEPARTMENTS: Department[] = [
  "조립",
  "고압",
  "진공",
  "튜닝",
  "튜브",
  "AS",
  "연구",
  "영업",
  "출하",
  "기타",
];

const LEVELS: EmployeeLevel[] = ["staff", "manager", "admin"];

export default function AdminPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinForm, setPinForm] = useState({
    current_pin: "",
    new_pin: "",
    confirm_pin: "",
  });

  const [employeeForm, setEmployeeForm] = useState({
    employee_code: "",
    name: "",
    role: "",
    phone: "",
    department: "조립" as Department,
    level: "staff" as EmployeeLevel,
  });
```
