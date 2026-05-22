---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_sections/_bom_workbench/BomStatsRow.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# BomStatsRow.tsx — BomStatsRow.tsx 설명

## 이 파일은 무엇을 책임지나

`BomStatsRow.tsx`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `BomStatsRow`
- `StatusFilter`
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

import { LEGACY_COLORS } from "@/lib/mes/color";
import type { BomStatus } from "./bomDept";

/**
 * 통계카드 4장 — 전체 / 완료 / 작업중 / 미착수.
 *
 * KPI 가 곧 부모 리스트 상태 필터 컨트롤. 카드 클릭 시 onChange 로 필터 전환.
 * 같은 카드를 다시 누르면(또는 "전체") ALL 로 해제.
 */
export type StatusFilter = "ALL" | BomStatus;

interface Props {
  total: number;
  done: number;
  wip: number;
  todo: number;
  active: StatusFilter;
  onChange: (next: StatusFilter) => void;
}

const CARDS: { id: StatusFilter; label: string; color: string }[] = [
  { id: "ALL", label: "전체", color: LEGACY_COLORS.muted },
  { id: "done", label: "완료", color: LEGACY_COLORS.green },
  { id: "wip", label: "작업중", color: LEGACY_COLORS.blue },
  { id: "todo", label: "미착수", color: LEGACY_COLORS.yellow },
];

export function BomStatsRow({ total, done, wip, todo, active, onChange }: Props) {
  const values: Record<StatusFilter, number> = { ALL: total, done, wip, todo };

  return (
    <div className="grid grid-cols-4 gap-2">
      {CARDS.map((c) => {
        const isActive = active === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(isActive && c.id !== "ALL" ? "ALL" : c.id)}
            className="rounded-xl border px-3 py-2 text-left transition-colors hover:brightness-105"
            style={{
              background: isActive
                ? `color-mix(in srgb, ${c.color} 14%, transparent)`
                : LEGACY_COLORS.s1,
              borderColor: isActive ? c.color : LEGACY_COLORS.border,
            }}
            title={c.id === "ALL" ? "전체 보기" : `${c.label}만 보기`}
          >
            <div
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              {c.label}
```
