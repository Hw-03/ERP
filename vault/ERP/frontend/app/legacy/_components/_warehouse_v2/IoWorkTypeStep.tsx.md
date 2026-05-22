---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_v2/IoWorkTypeStep.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# IoWorkTypeStep.tsx — IoWorkTypeStep.tsx 설명

## 이 파일은 무엇을 책임지나

`IoWorkTypeStep.tsx`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `IoWorkTypeStep`
- `IoSubTypeStep`
- `Step2Label`
- `DeptGrid`
- `DirectionCard`
- `DeptIoDirection`
- `WorkTypeProps`
- `SubTypeProps`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopWarehouseView.tsx]] — `DesktopWarehouseView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/stock-requests.ts]] — `stock-requests.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/stock_requests.py]] — 프론트의 입출고 요청 작성, 내 요청, 창고 승인함이 호출하는 API 입구입니다.
- [[ERP/backend/app/services/stock_requests.py]] — 현장 담당자가 요청을 제출하고 창고가 승인/반려/취소하는 흐름을 처리하는 서비스입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { MES_DEPARTMENT_COLORS } from "@/lib/mes-department";
import type { IoSubType, IoWorkType, OperatorLike } from "./types";
import { IO_SUB_TYPES, IO_WORK_TYPES, canSeeWorkType, deptVisibility, isExitWorkType, requiresDepartments, type DeptIoDirection } from "./ioWorkType";

interface WorkTypeProps {
  workType: IoWorkType;
  operator: OperatorLike | null;
  onWorkTypeChange: (workType: IoWorkType) => void;
}

/**
 * Step 1 본문 — 큰 작업 유형 카드 5개. WizardStepCard 안에 들어감.
 */
export function IoWorkTypeStep({ workType, operator, onWorkTypeChange }: WorkTypeProps) {
  const visibleWorkTypes = IO_WORK_TYPES.filter((row) => canSeeWorkType(row.id, operator));
  const n = visibleWorkTypes.length;
  const cols = n <= 3 ? n : n === 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  return (
    <div
      className="grid h-full min-h-0 gap-3"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
    >
      {visibleWorkTypes.map((row) => {
        const Icon = row.icon;
        const active = workType === row.id;
        const cardAccent = isExitWorkType(row.id) ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
        return (
          <button
            key={row.id}
            type="button"
            aria-pressed={active}
            onClick={() => onWorkTypeChange(row.id)}
            className="flex h-full min-h-0 flex-col items-start justify-between gap-6 rounded-[22px] border p-10 text-left transition-all hover:brightness-110"
            style={{
              background: active ? tint(cardAccent, 14) : LEGACY_COLORS.s2,
              borderColor: active ? cardAccent : LEGACY_COLORS.border,
              borderWidth: active ? 2 : 1,
              color: active ? cardAccent : LEGACY_COLORS.text,
            }}
          >
            <div className="flex items-center gap-5">
              <Icon className="h-10 w-10 shrink-0" />
              <span className="text-4xl font-black leading-tight">{row.label}</span>
            </div>
            <span
              className="text-xl font-bold leading-tight"
```
