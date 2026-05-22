---
type: file-explanation
source_path: "frontend/app/legacy/_components/login/OperatorLoginCard.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# OperatorLoginCard.tsx — OperatorLoginCard.tsx 설명

## 이 파일은 무엇을 책임지나

`OperatorLoginCard.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `OperatorLoginCard`
- `KeyboardEvent`
- `Employee`
- `Operator`
- `OperatorLoginCardProps`

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

/**
 * 작업자 식별용 PIN 로그인 카드 — 단일 카드 구조.
 *
 * 로그인된 작업자 정보는 입출고/수정 작업의 produced_by 기본값으로 사용된다.
 * 실제 보안 인증이 아닌 식별용.
 */

import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, Loader2, Lock, RotateCcw } from "lucide-react";
import { api, type Employee } from "@/lib/api";
import { setCurrentOperator, type Operator } from "./useCurrentOperator";
import { useLoginEmployees } from "./useLoginEmployees";
import { EmployeeCombobox } from "./EmployeeCombobox";

interface OperatorLoginCardProps {
  onLogin: () => void;
}

const PIN_LENGTH = 4;

export function OperatorLoginCard({ onLogin }: OperatorLoginCardProps) {
  const employees = useLoginEmployees();
  const [selected, setSelected] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = !!selected && pin.length === PIN_LENGTH && !loading;

  const handlePinChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, PIN_LENGTH);
    setPin(digits);
    if (error) setError("");
  };

  const submit = useCallback(async () => {
    if (!selected || pin.length !== PIN_LENGTH || loading) return;
    setLoading(true);
    setError("");
    try {
      const emp = await api.verifyEmployeePin(selected.employee_id, pin);
      const op: Operator = {
        employee_id: emp.employee_id,
        name: emp.name,
        department: emp.department,
        level: emp.level,
        employee_code: emp.employee_code,
        warehouse_role: emp.warehouse_role ?? "none",
        department_role: emp.department_role ?? "none",
        theme: emp.theme ?? null,
        assigned_model_slots: emp.assigned_model_slots ?? [],
      };
```
