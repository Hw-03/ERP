---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_inventory_sections/InventoryActionRequired.tsx
status: active
updated: 2026-04-27
source_sha: 14f9cf29bc87
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# InventoryActionRequired.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_inventory_sections/InventoryActionRequired.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `1546` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_inventory_sections/_inventory_sections|frontend/app/legacy/_components/_inventory_sections]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { AlertTriangle, ArrowRight } from "lucide-react";
import { LEGACY_COLORS, formatNumber } from "../legacyUi";

type Props = {
  lowCount: number;
  zeroCount: number;
  onGoToWarehouseTab?: () => void;
};

export function InventoryActionRequired({ lowCount, zeroCount, onGoToWarehouseTab }: Props) {
  const total = lowCount + zeroCount;
  if (total === 0) return null;
  const tone = zeroCount > 0 ? LEGACY_COLORS.red : LEGACY_COLORS.yellow;
  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-3 rounded-[14px] border px-4 py-2.5"
      style={{
        background: `color-mix(in srgb, ${tone} 10%, transparent)`,
        borderColor: `color-mix(in srgb, ${tone} 40%, transparent)`,
      }}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: tone }} />
      <span className="text-sm font-bold" style={{ color: tone }}>
        조치 필요
      </span>
      <span className="text-sm font-semibold" style={{ color: LEGACY_COLORS.text }}>
        부족 {formatNumber(lowCount)}건 · 품절 {formatNumber(zeroCount)}건
      </span>
      {onGoToWarehouseTab && (
        <button
          onClick={onGoToWarehouseTab}
          className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: tone }}
        >
          입출고 화면 열기 <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
