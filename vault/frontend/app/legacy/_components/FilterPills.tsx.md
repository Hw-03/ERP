---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/FilterPills.tsx
status: active
updated: 2026-04-27
source_sha: e7f754824600
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# FilterPills.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/FilterPills.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `2069` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_components|frontend/app/legacy/_components]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { useState } from "react";
import { LEGACY_COLORS } from "./legacyUi";

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
                    color: "#fff",
                  }
                : isHovered
                ? {
                    background: `color-mix(in srgb, ${activeColor} var(--pill-hover-mix, 14%), transparent)`,
                    borderColor: activeColor,
                    color: `color-mix(in srgb, ${activeColor}, #ffffff calc(var(--pill-inset-ring, 0) * 60%))`,
                    boxShadow: `inset 0 0 0 calc(var(--pill-inset-ring, 0) * 1px) ${activeColor}, 0 0 var(--pill-glow-blur, 0px) color-mix(in srgb, ${activeColor} var(--pill-glow-strength, 0%), transparent)`,
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
      })}
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
