---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_v2/useIoDraft.ts
tags: [vault, code-note, auto-generated, stub]
---

# useIoDraft.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_warehouse_v2/useIoDraft.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
import { useState } from "react";
import { api, type IoBundle, type IoSubType, type IoWorkType } from "@/lib/api";

export function useIoDraft() {
  const [drafting, setDrafting] = useState(false);

  async function saveDraft(payload: {
    employeeId: string;
    workType: IoWorkType;
    subType: IoSubType;
    fromDepartment?: string | null;
    toDepartment?: string | null;
    referenceNo?: string | null;
    notes?: string | null;
    bundles: IoBundle[];
  }) {
    setDrafting(true);
    try {
      return await api.saveDraft({
        requester_employee_id: payload.employeeId,
        work_type: payload.workType,
        sub_type: payload.subType,
        from_department: payload.fromDepartment || null,
        to_department: payload.toDepartment || null,
        reference_no: payload.referenceNo || null,
        notes: payload.notes || null,
        bundles: payload.bundles,
      });
    } finally {
      setDrafting(false);
```
