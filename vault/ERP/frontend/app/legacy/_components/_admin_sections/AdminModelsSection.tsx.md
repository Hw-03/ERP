---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_sections/AdminModelsSection.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# AdminModelsSection.tsx — AdminModelsSection.tsx 설명

## 이 파일은 무엇을 책임지나

`AdminModelsSection.tsx`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `AdminModelsSection`
- `ModelAddForm`
- `ModelDetailView`
- `DetailGrid`
- `SummaryStat`
- `Props`
- `ModelAddFormProps`
- `ModelDetailViewProps`

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
import { Layers, Plus, Trash2, X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { BOMDetailEntry, Item, ProductModel } from "@/lib/api";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { EmptyState } from "../common";
import { StatusPill } from "../common/StatusPill";
import {
  AdminDetailCard,
  AdminKpiBar,
  AdminListPanel,
  AdminPageHeader,
} from "./_admin_primitives";
import { useAdminModelsContext } from "./AdminModelsContext";

interface Props {
  items: Item[];
  allBomRows: BOMDetailEntry[];
}

export function AdminModelsSection({ items, allBomRows }: Props) {
  const ctx = useAdminModelsContext();
  const {
    productModels,
    modelAddName,
    setModelAddName,
    modelAddSymbol,
    setModelAddSymbol,
    addModel,
    deleteModel,
  } = ctx;

  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const inUse = useMemo(
    () => productModels.filter((m) => Boolean(m.model_name)),
    [productModels],
  );
  const idle = productModels.length - inUse.length;

  // KPI: 연결 품목 총합 (선택과 무관하게 전체 모델별 매핑된 품목 수)
  const totalLinkedItems = useMemo(() => {
    let count = 0;
    for (const it of items) {
      if (Array.isArray(it.model_slots) && it.model_slots.length > 0) count += 1;
    }
    return count;
  }, [items]);

  // 첫 항목 자동 선택 (사용 중인 모델이 있으면 첫 번째)
  useEffect(() => {
```
