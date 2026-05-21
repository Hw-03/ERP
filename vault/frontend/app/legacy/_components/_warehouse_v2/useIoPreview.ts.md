---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_v2/useIoPreview.ts
tags: [vault, code-note, auto-generated, stub]
---

# useIoPreview.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_warehouse_v2/useIoPreview.ts]]

## 원본 첫 줄

```
import { useState } from "react";
import { api, type IoPreviewTarget } from "@/lib/api";
import type { IoSubType, IoWorkType } from "./types";

export function useIoPreview() {
  const [previewing, setPreviewing] = useState(false);

  async function previewTarget(options: {
    employeeId?: string | null;
    workType: IoWorkType;
    subType: IoSubType;
    fromDepartment?: string | null;
    toDepartment?: string | null;
    target: IoPreviewTarget;
  }) {
    setPreviewing(true);
    try {
      return await api.preview({
        requester_employee_id: options.employeeId || null,
        work_type: options.workType,
        sub_type: options.subType,
        from_department: options.fromDepartment || null,
        to_department: options.toDepartment || null,
        targets: [options.target],
      });
    } finally {
      setPreviewing(false);
    }
  }

```
