---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_inventory_sections/InventoryCapacityPanel.tsx
status: active
updated: 2026-04-27
source_sha: 8a121c362e50
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# InventoryCapacityPanel.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_inventory_sections/InventoryCapacityPanel.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `2387` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_inventory_sections/_inventory_sections|frontend/app/legacy/_components/_inventory_sections]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { AlertTriangle, Zap } from "lucide-react";
import type { ProductionCapacity } from "@/lib/api";
import { LEGACY_COLORS, formatNumber } from "../legacyUi";

export function InventoryCapacityPanel({
  capacityData,
  onClick,
}: {
  capacityData: ProductionCapacity | null | undefined;
  onClick?: () => void;
}) {
  if (!capacityData) return null;
  const interactive = typeof onClick === "function";
  const baseStyle = {
    background: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 8%, transparent)`,
    borderColor: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 30%, transparent)`,
  };
  const className =
    "mt-3 flex w-full flex-wrap items-center gap-3 rounded-[14px] border px-4 py-2.5 text-left" +
    (interactive ? " cursor-pointer transition-opacity hover:opacity-90" : "");
  const inner = (
    <>
      <Zap className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.cyan }} />
      <span className="text-sm font-semibold" style={{ color: LEGACY_COLORS.cyan }}>생산 가능</span>
      {capacityData.immediate === 0 && capacityData.maximum === 0 ? (
        <span className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>미등록</span>
      ) : (
        <>
          <span className="text-sm font-black" style={{ color: LEGACY_COLORS.cyan }}>
            즉시 {formatNumber(capacityData.immediate)}
          </span>
          <span className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>/</span>
          <span className="text-sm font-black" style={{ color: LEGACY_COLORS.blue }}>
            최대 {formatNumber(capacityData.maximum)}
          </span>
        </>
      )}
      {capacityData.limiting_item && (
        <span
          className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 16%, transparent)`,
            color: LEGACY_COLORS.yellow,
          }}
        >
          <AlertTriangle className="h-3 w-3" />
          병목 부품: {capacityData.limiting_item}
        </span>
      )}
    </>
  );
  if (interactive) {
    return (
      <button type="button" className={className} style={baseStyle} onClick={onClick} title="생산 가능수량 상세">
        {inner}
      </button>
    );
  }
  return (
    <div className={className} style={baseStyle}>
      {inner}
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
