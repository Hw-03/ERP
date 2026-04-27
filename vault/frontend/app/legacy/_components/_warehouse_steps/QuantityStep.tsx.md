---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_warehouse_steps/QuantityStep.tsx
status: active
updated: 2026-04-27
source_sha: f7cc36a3cfd3
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# QuantityStep.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_warehouse_steps/QuantityStep.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `5654` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_warehouse_steps/_warehouse_steps|frontend/app/legacy/_components/_warehouse_steps]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { X } from "lucide-react";
import type { Item, ShipPackage } from "@/lib/api";
import { SelectedItemsPanel } from "../SelectedItemsPanel";
import { LEGACY_COLORS, formatNumber } from "../legacyUi";
import type { WorkType } from "./_constants";

export function QuantityStep({
  workType,
  selectedEntries,
  isOutbound,
  selectedPackage,
  onQuantityChange,
  onRemove,
  onClearPackage,
  notes,
  setNotes,
  totalQty,
}: {
  workType: WorkType;
  selectedEntries: { item: Item; quantity: number }[];
  isOutbound: boolean;
  selectedPackage: ShipPackage | null;
  onQuantityChange: (itemId: string, qty: number) => void;
  onRemove: (itemId: string) => void;
  onClearPackage: () => void;
  notes: string;
  setNotes: (v: string) => void;
  totalQty: number;
}) {
  const isPackage = workType === "package-out";

  return (
    <div className="space-y-4">
      {/* 합계 표시 */}
      {!isPackage && selectedEntries.length > 0 && (
        <div
          className="flex items-center justify-between rounded-[14px] border px-4 py-2.5"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 6%, transparent)`,
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 24%, transparent)`,
          }}
        >
          <span className="text-[11px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
            {selectedEntries.length}개 품목 · 총 수량
          </span>
          <span className="text-2xl font-black tabular-nums" style={{ color: LEGACY_COLORS.blue }}>
            {formatNumber(totalQty)}
          </span>
        </div>
      )}

      {/* 본문 */}
      {isPackage ? (
        selectedPackage ? (
          <div
            className="rounded-[18px] border-2 p-4"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.purple} 6%, transparent)`,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.purple} 40%, transparent)`,
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  선택된 패키지
                </div>
                <div className="mt-1 truncate text-xl font-black" style={{ color: LEGACY_COLORS.text }}>
                  {selectedPackage.name}
                </div>
                <div className="mt-1 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                  {selectedPackage.package_code} · {selectedPackage.items.length}종 구성
                </div>
              </div>
              <button
                onClick={onClearPackage}
                className="shrink-0 rounded-full p-1 transition-colors hover:bg-white/10"
                style={{ color: LEGACY_COLORS.muted2 }}
                title="선택 해제"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {selectedPackage.items.length > 0 && (
              <ul
                className="mt-4 divide-y rounded-[12px] border"
                style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
              >
                {selectedPackage.items.map((pi, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between px-3 py-2 text-xs"
                    style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                  >
                    <span className="truncate">{pi.item_name ?? pi.item_id}</span>
                    <span className="shrink-0 font-black tabular-nums" style={{ color: LEGACY_COLORS.muted2 }}>
                      ×{formatNumber(pi.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null
      ) : (
        <div
          className="overflow-hidden rounded-[16px] border"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          <SelectedItemsPanel
            entries={selectedEntries}
            outgoing={isOutbound}
            onQuantityChange={onQuantityChange}
            onRemove={onRemove}
          />
        </div>
      )}

      {/* 메모 */}
      <label className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
            메모 (선택)
          </span>
          <span
            className="text-[10px] font-bold tabular-nums"
            style={{
              color: notes.length > 200 ? LEGACY_COLORS.red : LEGACY_COLORS.muted2,
            }}
          >
            {notes.length}/200
          </span>
        </div>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="메모를 입력하세요"
          className="rounded-[12px] border px-3 py-2 text-sm outline-none"
          style={{
            background: LEGACY_COLORS.s2,
            borderColor:
              notes.length > 200
                ? `color-mix(in srgb, ${LEGACY_COLORS.red} 50%, transparent)`
                : LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
        />
      </label>
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
