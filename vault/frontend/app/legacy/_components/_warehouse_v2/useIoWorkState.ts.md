---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_v2/useIoWorkState.ts
tags: [vault, code-note, auto-generated, stub]
---

# useIoWorkState.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_warehouse_v2/useIoWorkState.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
import { useMemo, useState } from "react";
import type { IoBundle, IoLine, IoSubType, IoWorkType } from "./types";
import { DEFAULT_SUB_TYPE, type DeptIoDirection } from "./ioWorkType";

export type IoStep = 1 | 2 | 3 | 4 | 5;

export const IO_STEP_LABELS: Record<IoStep, string> = {
  1: "작업 유형",
  2: "세부 작업",
  3: "대상 선택",
  4: "실제 반영",
  5: "제출 확인",
};

export function useIoWorkState(initialWorkType?: IoWorkType, initialDepartment?: string | null) {
  const [workType, setWorkTypeBase] = useState<IoWorkType>(initialWorkType ?? "receive");
  const [subType, setSubType] = useState<IoSubType>("receive_supplier");
  const [fromDepartment, setFromDepartment] = useState<string>(initialDepartment || "조립");
  const [toDepartment, setToDepartment] = useState<string>(initialDepartment || "조립");
  const [bundles, setBundles] = useState<IoBundle[]>([]);
  const [notes, setNotes] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [step, setStep] = useState<IoStep>(1);
  // process workType 한정: 방향(입고/출고) 선택. null = 미선택 → Step 2 advance 차단.
  const [deptIoDirection, setDeptIoDirectionBase] = useState<DeptIoDirection | null>(null);

  function setWorkType(next: IoWorkType) {
    setWorkTypeBase(next);
    setSubType(DEFAULT_SUB_TYPE[next]);
    setDeptIoDirectionBase(null);
```
