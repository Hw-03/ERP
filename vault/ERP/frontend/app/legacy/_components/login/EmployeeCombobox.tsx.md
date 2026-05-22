---
type: file-explanation
source_path: "frontend/app/legacy/_components/login/EmployeeCombobox.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# EmployeeCombobox.tsx — EmployeeCombobox.tsx 설명

## 이 파일은 무엇을 책임지나

`EmployeeCombobox.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `EmployeeCombobox`
- `KeyboardEvent`
- `EmployeeComboboxProps`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/page.tsx]] — `page.tsx`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/app/legacy/page.tsx` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.
- [[ERP/backend/app/routers/employees.py]] — `employees.py`는 `employees` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/backend/app/services/pin_auth.py]] — `pin_auth.py`는 `pin_auth` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
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
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q) ||
        e.employee_code.toLowerCase().includes(q),
    );
  }, [employees, query]);

  useEffect(() => {
    setActive(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
```
