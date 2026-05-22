---
type: file-explanation
source_path: "frontend/app/legacy/_components/FilterPills.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# FilterPills.tsx — FilterPills.tsx 설명

## 이 파일은 무엇을 책임지나

`FilterPills.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `FilterPills`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/📁__components]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useState } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";

export function FilterPills({
  options,
  value,
  onChange,
  activeColor = LEGACY_COLORS.blue,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
  activeColor?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="mb-2 flex gap-[6px] overflow-x-auto pb-[2px]">
      {options.map((option) => {
        const active = option.value === value;
        const isHovered = hovered === option.value;
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            onMouseEnter={() => setHovered(option.value)}
            onMouseLeave={() => setHovered(null)}
            className="shrink-0 rounded-full border px-[11px] py-1 text-[10px] font-semibold transition-all duration-150 hover:scale-105"
            style={
              active
                ? {
                    background: activeColor,
                    borderColor: activeColor,
                    color: LEGACY_COLORS.white,
                  }
                : isHovered
                ? {
                    background: `color-mix(in srgb, ${activeColor} var(--pill-hover-mix, 14%), transparent)`,
                    borderColor: activeColor,
                    color: `color-mix(in srgb, ${activeColor}, #ffffff calc(var(--pill-inset-ring, 0) * 60%))`,
                    boxShadow: `inset 0 0 0 calc(var(--pill-inset-ring, 0) * 1px) ${activeColor}, 0 0 var(--pill-glow-blur, 0px) color-mix(in srgb, ${activeColor} var(--pill-glo...
                    transform: "translateY(-1px)",
                  }
                : {
                    background: LEGACY_COLORS.s2,
                    borderColor: LEGACY_COLORS.border,
                    color: LEGACY_COLORS.muted2,
                  }
            }
          >
            {option.label}
          </button>
        );
```
