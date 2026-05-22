---
type: file-explanation
source_path: "frontend/app/legacy/_components/_inventory_sections/InventoryFilterBar.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# InventoryFilterBar.tsx — InventoryFilterBar.tsx 설명

## 이 파일은 무엇을 책임지나

`InventoryFilterBar.tsx`는 대시보드/재고 화면의 목록, 상세, 필터, KPI 표시를 구성하는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `InventoryFilters`
- `InventoryTableStickyHeader`
- `FiltersProps`
- `StickyHeaderProps`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopInventoryView.tsx]] — `DesktopInventoryView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/inventory/query.py]] — `query.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.
- [[ERP/backend/app/services/inventory.py]] — 입고, 출고, 부서 이동, 불량 처리처럼 실제 재고 숫자를 바꾸는 업무 규칙을 담은 핵심 파일입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { Layers, Search, Sparkles, TrendingUp } from "lucide-react";
import type { ProductModel } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { FilterChip } from "../common";

const DEPT_CHIPS = ["튜브", "고압", "진공", "튜닝", "조립", "출하"] as const;

const PROCESS_STEP_CHIPS: { value: "R" | "A" | "F"; label: string }[] = [
  { value: "R", label: "원자재" },
  { value: "A", label: "중간공정" },
  { value: "F", label: "공정완료" },
];

type FiltersProps = {
  open: boolean;
  selectedDepts: string[];
  selectedModels: string[];
  selectedProcessSteps: string[];
  productModels: ProductModel[];
  toggleDept: (v: string) => void;
  toggleModel: (v: string) => void;
  toggleProcessStep: (v: string) => void;
  onClearDepts: () => void;
  onClearModels: () => void;
  onClearProcessSteps: () => void;
};

export function InventoryFilters({
  open,
  selectedDepts,
  selectedModels,
  selectedProcessSteps,
  productModels,
  toggleDept,
  toggleModel,
  toggleProcessStep,
  onClearDepts,
  onClearModels,
  onClearProcessSteps,
}: FiltersProps) {
  if (!open) return null;
  return (
    <div id="inventory-filter-panel" className="mt-2.5 grid gap-2.5 xl:grid-cols-3">
      <div className="rounded-[16px] border p-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
        <div className="mb-2 flex items-center gap-2 text-sm font-bold">
          <Sparkles className="h-4 w-4" style={{ color: LEGACY_COLORS.green }} />
          부서 구분
        </div>
        <div className="grid grid-cols-3 gap-2">
          <FilterChip active={selectedDepts.length === 0} label="전체" onClick={onClearDepts} tone={LEGACY_COLORS.green} className="w-full" />
          <FilterChip
            active={selectedDepts.includes("창고")}
            label="창고"
```
