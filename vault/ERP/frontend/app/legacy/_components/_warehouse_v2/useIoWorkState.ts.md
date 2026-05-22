---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_v2/useIoWorkState.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useIoWorkState.ts — useIoWorkState.ts 설명

## 이 파일은 무엇을 책임지나

`useIoWorkState.ts`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `useIoWorkState`
- `IO_STEP_LABELS`
- `DeptIoDirection`
- `IoStep`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopWarehouseView.tsx]] — `DesktopWarehouseView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/stock-requests.ts]] — `stock-requests.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/stock_requests.py]] — 프론트의 입출고 요청 작성, 내 요청, 창고 승인함이 호출하는 API 입구입니다.
- [[ERP/backend/app/services/stock_requests.py]] — 현장 담당자가 요청을 제출하고 창고가 승인/반려/취소하는 흐름을 처리하는 서비스입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
import { useMemo, useState } from "react";
import type { IoBundle, IoLine, IoSubType, IoWorkType } from "./types";
import { DEFAULT_SUB_TYPE, isDefectInventorySubType, type DeptIoDirection } from "./ioWorkType";
import type { DefectLocation } from "@/lib/api/types/defects";
import type { ChildDecision } from "../_defect_hub/DisassembleTree";

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
  const [defectSelectedLocation, setDefectSelectedLocation] = useState<DefectLocation | null>(null);
  const [defectAction, setDefectAction] = useState<"scrap" | "restore" | "supplier_return" | "disassemble" | null>(null);
  const [defectReasonCategory, setDefectReasonCategory] = useState("");
  const [defectReasonMemo, setDefectReasonMemo] = useState("");
  const [defectBomDecisions, setDefectBomDecisions] = useState<ChildDecision[]>([]);

  function setWorkType(next: IoWorkType) {
    setWorkTypeBase(next);
    setSubType(DEFAULT_SUB_TYPE[next]);
    setDeptIoDirectionBase(null);
    setBundles([]);
    setDefectSelectedLocation(null);
    setDefectAction(null);
    setDefectReasonCategory("");
    setDefectReasonMemo("");
    setDefectBomDecisions([]);
    setStep(1);
  }

  // process workType 방향 설정 — bundle 비우고 sub_type 기본값 재설정
  function setDeptIoDirection(dir: DeptIoDirection) {
    setDeptIoDirectionBase(dir);
    setBundles([]);
    setSubType(dir === "in" ? "produce" : "disassemble");
  }

  // draft 복원 전용 — bundle 보존, raw set
  function setDeptIoDirectionRaw(dir: DeptIoDirection | null) {
```
