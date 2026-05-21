---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/login/useLoginEmployees.ts
tags: [vault, code-note, auto-generated, stub]
---

# useLoginEmployees.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/login/useLoginEmployees.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { useEffect, useState } from "react";
import { api, type Employee } from "@/lib/api";

/**
 * OperatorLoginCard 의 active employees fetch 훅.
 *
 * Round-8 (R8-5) 추출. mount 시 1회 fetch — 로그인 화면 진입 시.
 * 활성 직원 목록만 필요 (activeOnly: true).
 */
export function useLoginEmployees(): Employee[] {
  const [employees, setEmployees] = useState<Employee[]>([]);
  useEffect(() => {
    void api
      .getEmployees({ activeOnly: true })
      .then((emps) => setEmployees(emps))
      .catch(() => {});
  }, []);
  return employees;
}
```
