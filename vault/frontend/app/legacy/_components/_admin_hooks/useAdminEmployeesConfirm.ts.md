---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_hooks/useAdminEmployeesConfirm.ts
tags: [vault, code-note, auto-generated, stub]
---

# useAdminEmployeesConfirm.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_hooks/useAdminEmployeesConfirm.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { useState } from "react";
import type { Employee } from "@/lib/api";

/**
 * Round-15 (#2) 추출 — useAdminEmployees 의 3 confirmation modal state.
 *
 * 책임:
 *   - 활성/비활성 토글 confirm
 *   - PIN 초기화 confirm (관리자 PIN 입력)
 *   - 삭제 confirm
 */
export function useAdminEmployeesConfirm() {
  const [confirmTarget, setConfirmTarget] = useState<Employee | null>(null);
  const [pinResetTarget, setPinResetTarget] = useState<Employee | null>(null);
  const [pinResetAdminPin, setPinResetAdminPin] = useState("");
  const [pinResetError, setPinResetError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);

  function requestPinReset(e: Employee) {
    setPinResetTarget(e);
    setPinResetAdminPin("");
    setPinResetError("");
  }

  function cancelPinReset() {
    setPinResetTarget(null);
    setPinResetAdminPin("");
    setPinResetError("");
```
