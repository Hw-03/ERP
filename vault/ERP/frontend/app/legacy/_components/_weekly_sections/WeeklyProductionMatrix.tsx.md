---
type: file-explanation
source_path: "frontend/app/legacy/_components/_weekly_sections/WeeklyProductionMatrix.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# WeeklyProductionMatrix.tsx — WeeklyProductionMatrix.tsx 설명

## 이 파일은 무엇을 책임지나

`WeeklyProductionMatrix.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `WeeklyProductionMatrix`
- `NumCol`
- `Props`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_weekly_sections/📁__weekly_sections]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import React from "react";
import { LEGACY_COLORS, getDepartmentFallbackColor } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import type { WeeklyProductionModelRow } from "@/lib/api/types/weekly";

type NumCol = keyof Pick<
  WeeklyProductionModelRow,
  "tf_qty" | "hf_qty" | "vf_qty" | "nf_qty" | "af_qty" | "pf_qty"
>;

const COLS: { key: NumCol; label: string; dept: string }[] = [
  { key: "tf_qty", label: "튜브", dept: "튜브" },
  { key: "hf_qty", label: "고압", dept: "고압" },
  { key: "vf_qty", label: "진공", dept: "진공" },
  { key: "nf_qty", label: "튜닝", dept: "튜닝" },
  { key: "af_qty", label: "조립", dept: "조립" },
  { key: "pf_qty", label: "출하", dept: "출하" },
];

function fmt(n: number): string {
  return n === 0 ? "—" : Math.round(n).toLocaleString();
}

// 0 값 de-emphasis — WCAG AA 충족(투명 30% 는 미달) → 솔리드 muted2(5.55:1).
const ZERO_FADE = LEGACY_COLORS.muted2;

interface Props {
  rows: WeeklyProductionModelRow[];
}

export const WeeklyProductionMatrix = React.memo(function WeeklyProductionMatrix({
  rows,
}: Props) {
  const altBg = tint(LEGACY_COLORS.s2, 50, LEGACY_COLORS.s1);

  // 열별 최댓값 계산 (농도 비례 히트맵용)
  const colMax: Record<NumCol, number> = {} as Record<NumCol, number>;
  for (const c of COLS) {
    colMax[c.key] = Math.max(...rows.map((r) => r[c.key]), 1);
  }

  return (
    <div
      className="overflow-x-auto"
      role="region"
      aria-label="모델별 공정 생산 매트릭스"
      tabIndex={0}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ background: LEGACY_COLORS.s2 }}>
            <th
              scope="col"
```
