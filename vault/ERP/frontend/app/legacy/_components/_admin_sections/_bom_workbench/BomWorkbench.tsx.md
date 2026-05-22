---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_sections/_bom_workbench/BomWorkbench.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# BomWorkbench.tsx — BomWorkbench.tsx 설명

## 이 파일은 무엇을 책임지나

`BomWorkbench.tsx`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `BomWorkbench`
- `StatusFilter`
- `DeptLetter`
- `Mode`
- `DeleteRequest`
- `Props`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopAdminView.tsx]] — `DesktopAdminView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/admin.ts]] — `admin.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/settings.py]] — `settings.py`는 `settings` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/backend/app/routers/employees.py]] — `employees.py`는 `employees` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Download, Network, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import type { BOMDetailEntry, BOMEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { AdminPageHeader } from "../_admin_primitives";
import { BomDeptTabs } from "./BomDeptTabs";
import { BomParentList } from "./BomParentList";
import { BomChildAddBox } from "./BomChildAddBox";
import { BomEditPanel } from "./BomEditPanel";
import { BomReviewModal } from "./BomReviewModal";
import { BomStatsRow, type StatusFilter } from "./BomStatsRow";
import { BomWhereUsedPanel } from "./BomWhereUsedPanel";
import { BomUnmatchedRawsDrawer } from "./BomUnmatchedRawsDrawer";
import { bomStatusOf, stageOf, type DeptLetter } from "./bomDept";

interface Props {
  items: Item[];
  allBomRows: BOMDetailEntry[];
  refreshAllBom: () => void;
  refreshItems: () => Promise<void>;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
}

type Mode = "edit" | "whereused";
type DeleteRequest = { bomId: string; childName: string };

export function BomWorkbench({
  items,
  allBomRows,
  refreshAllBom,
  refreshItems,
  onStatusChange,
  onError,
}: Props) {
  const [dept, setDept] = useState<DeptLetter>("A");
  const [parentId, setParentId] = useState("");
  const [mode, setMode] = useState<Mode>("edit");
  const [bomRows, setBomRows] = useState<BOMEntry[]>([]);
  const [whereUsedRows, setWhereUsedRows] = useState<BOMDetailEntry[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const completedSet = useMemo(
    () => new Set(items.filter((i) => i.bom_completed_at).map((i) => i.item_id)),
    [items],
  );
  const childCountMap = useMemo(() => {
    const m = new Map<string, number>();
```
