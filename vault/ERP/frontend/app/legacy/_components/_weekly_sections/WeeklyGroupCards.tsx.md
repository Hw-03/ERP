---
type: file-explanation
source_path: "frontend/app/legacy/_components/_weekly_sections/WeeklyGroupCards.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# WeeklyGroupCards.tsx — WeeklyGroupCards.tsx 설명

## 이 파일은 무엇을 책임지나

`WeeklyGroupCards.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `WeeklyGroupCardsImpl`
- `WeeklyGroupCards`
- `Props`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_weekly_sections/📁__weekly_sections]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { memo, useState } from "react";
import { LEGACY_COLORS, employeeColor } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import type { WeeklyGroupReport } from "@/lib/api/types/weekly";

// 0/무변동 값 de-emphasis — 단 WCAG AA 충족 필요(투명 30% 는 미달) → 솔리드 muted2(5.55:1).
const ZERO_FADE = LEGACY_COLORS.muted2;

interface Props {
  groups: WeeklyGroupReport[];
  selected: string;
  onSelect: (code: string) => void;
  cols?: 1;
}

function WeeklyGroupCardsImpl({ groups, selected, onSelect }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 gap-1.5">
      {groups.map((g) => {
        const isActive = g.process_code === selected;
        const isHover = hovered === g.process_code;
        const isDecreasing = g.delta < 0;
        const isQuiet = g.delta === 0 && !isActive;
        const accentColor = employeeColor(g.dept_name);
        const tone = isDecreasing ? LEGACY_COLORS.red : accentColor;
        const deltaColor =
          g.delta > 0 ? LEGACY_COLORS.green
          : g.delta < 0 ? LEGACY_COLORS.red
          : ZERO_FADE;

        return (
          <button
            key={g.process_code}
            type="button"
            onClick={() => onSelect(g.process_code)}
            onMouseEnter={() => setHovered(g.process_code)}
            onMouseLeave={() => setHovered(null)}
            aria-pressed={isActive}
            className="relative overflow-hidden rounded-[12px] border text-left transition-colors hover:brightness-110"
            style={{
              background: isActive
                ? tint(tone, 8, LEGACY_COLORS.s2)
                : isHover
                ? LEGACY_COLORS.s2
                : LEGACY_COLORS.s1,
              borderColor: isActive
                ? tone
                : isDecreasing
                ? tint(LEGACY_COLORS.red, 30, LEGACY_COLORS.border)
                : isQuiet
```
