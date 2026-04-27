---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_inventory_sections/InventoryKpiPanel.tsx
status: active
updated: 2026-04-27
source_sha: fdca8721ab50
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# InventoryKpiPanel.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_inventory_sections/InventoryKpiPanel.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `2160` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_inventory_sections/_inventory_sections|frontend/app/legacy/_components/_inventory_sections]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { useState } from "react";
import { LEGACY_COLORS, formatNumber } from "../legacyUi";

export type KpiFilter = "ALL" | "NORMAL" | "LOW" | "ZERO";
export type KpiCard = { label: string; value: number; hint: string; tone: string; key: KpiFilter };

type Props = {
  cards: KpiCard[];
  activeKey: KpiFilter;
  onChange: (key: KpiFilter) => void;
};

export function InventoryKpiPanel({ cards, activeKey, onChange }: Props) {
  const [hovered, setHovered] = useState<KpiFilter | null>(null);
  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      {cards.map((card) => {
        const isActive = activeKey === card.key;
        const isHover = hovered === card.key;
        return (
          <button
            key={card.key}
            onClick={() => onChange(card.key)}
            onMouseEnter={() => setHovered(card.key)}
            onMouseLeave={() => setHovered(null)}
            className="rounded-[16px] border px-4 py-4 text-left transition-colors hover:brightness-110"
            style={{
              background: isActive
                ? `color-mix(in srgb, ${card.tone} 22%, transparent)`
                : isHover
                ? `color-mix(in srgb, ${card.tone} 16%, transparent)`
                : `color-mix(in srgb, ${card.tone} 8%, transparent)`,
              borderColor: isActive || isHover
                ? card.tone
                : `color-mix(in srgb, ${card.tone} 35%, transparent)`,
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-[20px] font-black tracking-[-0.02em]" style={{ color: card.tone }}>
                {card.label}
              </div>
              <div className="text-[22px] font-black leading-none" style={{ color: card.tone }}>
                {formatNumber(card.value)}
              </div>
            </div>
            <div className="mt-1.5 text-[11px] font-semibold" style={{ color: card.tone, opacity: 0.7 }}>
              {card.hint}
            </div>
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
