---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_warehouse_sections/WarehouseCompletionOverlay.tsx
status: active
updated: 2026-04-27
source_sha: 5f046b0f2888
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# WarehouseCompletionOverlay.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_warehouse_sections/WarehouseCompletionOverlay.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `1596` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_warehouse_sections/_warehouse_sections|frontend/app/legacy/_components/_warehouse_sections]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { LEGACY_COLORS } from "../legacyUi";

type Flyout = { nonce: number; kind: "in" | "out"; count: number };

type Props = {
  flyout: Flyout | null;
  phase: "show" | "out";
};

export function WarehouseCompletionOverlay({ flyout, phase }: Props) {
  if (!flyout) return null;
  const isIn = flyout.kind === "in";
  const tone = isIn ? LEGACY_COLORS.green : LEGACY_COLORS.yellow;
  const heading = isIn ? "입고 완료" : "출고 완료";
  return (
    <div
      key={flyout.nonce}
      className="pointer-events-none fixed left-1/2 top-1/2 z-[400]"
      style={{
        transition: "opacity 380ms ease-out, transform 380ms ease-out",
        willChange: "transform, opacity",
        transform:
          phase === "out"
            ? "translate(-50%, -50%) scale(0.94)"
            : "translate(-50%, -50%) scale(1)",
        opacity: phase === "out" ? 0 : 1,
      }}
    >
      <div
        className="rounded-[36px] border-2 px-16 py-12 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.5)]"
        style={{
          background: `linear-gradient(135deg, ${tone}, color-mix(in srgb, ${tone} 68%, #000 32%))`,
          borderColor: `color-mix(in srgb, ${tone} 55%, #fff 45%)`,
          color: "#ffffff",
          minWidth: 380,
        }}
      >
        <div className="text-center text-[48px] font-black leading-none tracking-[-0.02em]">
          {heading}
        </div>
        <div className="mt-4 text-center text-xl font-bold opacity-90">
          {flyout.count}건
        </div>
      </div>
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
