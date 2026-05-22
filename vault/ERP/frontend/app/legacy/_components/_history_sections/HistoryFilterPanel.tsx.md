---
type: file-explanation
source_path: "frontend/app/legacy/_components/_history_sections/HistoryFilterPanel.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# HistoryFilterPanel.tsx — HistoryFilterPanel.tsx 설명

## 이 파일은 무엇을 책임지나

`HistoryFilterPanel.tsx`는 입출고 내역 화면에서 날짜, 목록, 상세, 묶음 작업을 보여주는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `HistoryFilterPanel`
- `Card`
- `Props`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopHistoryView.tsx]] — `DesktopHistoryView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/inventory/transactions.py]] — `transactions.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { Layers, Sparkles, TrendingUp } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { FilterChip } from "../common";
import { OPERATION_OPTIONS } from "./historyQuery";

// 3차: 유일 필터 패널. 3카드 모두 다중 선택.
// 부서 = 서버 departmentCounts 기반 동적("창고" 포함, 미상은 진짜 unknown만).
// 거래 종류 = 전 16종 고정(공정 R/A/F 카드 폐기). KPI 박스는 표시 전용이라 동기 없음.
type Props = {
  open: boolean;
  /** baseline summary 의 부서별 카운트 — 부서 칩 소스(동적). */
  departmentCounts: Record<string, number>;
  selectedDepts: string[];
  toggleDept: (v: string) => void;
  clearDepts: () => void;
  models: string[];
  selectedModels: string[];
  toggleModel: (v: string) => void;
  clearModels: () => void;
  selectedOps: string[];
  toggleOp: (v: string) => void;
  clearOps: () => void;
};

export function HistoryFilterPanel({
  open,
  departmentCounts,
  selectedDepts,
  toggleDept,
  clearDepts,
  models,
  selectedModels,
  toggleModel,
  clearModels,
  selectedOps,
  toggleOp,
  clearOps,
}: Props) {
  if (!open) return null;
  const deptEntries = Object.entries(departmentCounts)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="grid gap-2.5 xl:grid-cols-3">
      <Card icon={<Sparkles className="h-4 w-4" style={{ color: LEGACY_COLORS.green }} />} title="부서 구분">
        <FilterChip active={selectedDepts.length === 0} label="전체" onClick={clearDepts} tone={LEGACY_COLORS.green} className="w-full" />
        {deptEntries.map(([name, count]) => (
          <FilterChip
            key={name}
            active={selectedDepts.includes(name)}
            label={`${name} ${count.toLocaleString()}`}
            onClick={() => toggleDept(name)}
```
