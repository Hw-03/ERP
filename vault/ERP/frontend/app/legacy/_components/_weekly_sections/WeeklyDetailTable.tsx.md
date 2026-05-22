---
type: file-explanation
source_path: "frontend/app/legacy/_components/_weekly_sections/WeeklyDetailTable.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# WeeklyDetailTable.tsx — WeeklyDetailTable.tsx 설명

## 이 파일은 무엇을 책임지나

`WeeklyDetailTable.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `WeeklyDetailTableImpl`
- `Num`
- `WeeklyDetailTable`
- `Props`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_weekly_sections/📁__weekly_sections]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { memo } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import type { WeeklyGroupReport } from "@/lib/api/types/weekly";
import { EmptyState } from "../common/EmptyState";

// 0 값 de-emphasis — WCAG AA 충족(투명 30% 는 미달) → 솔리드 muted2(5.55:1).
const ZERO_FADE = LEGACY_COLORS.muted2;

interface Props {
  group: WeeklyGroupReport | undefined;
}

function WeeklyDetailTableImpl({ group }: Props) {
  if (!group || group.items.length === 0) {
    return (
      <EmptyState
        variant="no-data"
        title="해당 공정완료품 데이터가 없습니다."
        description="선택한 주차에 집계할 품목 또는 거래 내역이 없습니다."
        compact
      />
    );
  }

  return (
    <div className="flex flex-col gap-0 min-w-0">
      {/* 공정 요약 */}
      <div
        className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 pb-1.5"
        style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
      >
        <span className="text-[13px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
          {group.dept_name}
          <span
            className="ml-1 text-[11px] font-bold"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            · {group.process_code}
          </span>
        </span>
        <span className="text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
          현재 재고 {formatQty(group.current_qty)}
        </span>
        <span
          className="text-[12px]"
          style={{ color: group.in_qty > 0 ? LEGACY_COLORS.green : ZERO_FADE }}
        >
          생산 {formatQty(group.in_qty)}
        </span>
        <span
          className="text-[12px]"
          style={{ color: group.out_qty > 0 ? LEGACY_COLORS.red : ZERO_FADE }}
```
