---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/login/EmployeeCombobox.tsx
tags: [vault, code-note, auto-generated, stub]
---

# EmployeeCombobox.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/login/EmployeeCombobox.tsx]]

## 원본 첫 줄

```
"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ChevronDown, User as UserIcon } from "lucide-react";
import type { Employee } from "@/lib/api";

export interface EmployeeComboboxProps {
  employees: Employee[];
  value: Employee | null;
  onChange: (emp: Employee) => void;
  autoFocus?: boolean;
  disabled?: boolean;
}

export function EmployeeCombobox({
  employees,
  value,
  onChange,
  autoFocus,
  disabled,
}: EmployeeComboboxProps) {
  const [query, setQuery] = useState("");
```
