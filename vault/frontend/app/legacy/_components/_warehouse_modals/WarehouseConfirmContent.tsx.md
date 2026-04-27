---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_warehouse_modals/WarehouseConfirmContent.tsx
status: active
updated: 2026-04-27
source_sha: bbfd80d96e49
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# WarehouseConfirmContent.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_warehouse_modals/WarehouseConfirmContent.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `3497` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_warehouse_modals/_warehouse_modals|frontend/app/legacy/_components/_warehouse_modals]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import type { Employee, Item, ShipPackage } from "@/lib/api";
import { LEGACY_COLORS, formatNumber, normalizeDepartment } from "../legacyUi";
import type { WorkType } from "../_warehouse_steps";

type Props = {
  selectedEmployee: Employee | null;
  effectiveLabel: string;
  workType: WorkType;
  selectedEntries: { item: Item; quantity: number }[];
  selectedPackage: ShipPackage | null;
  totalQty: number;
  notes: string;
};

export function WarehouseConfirmContent({
  selectedEmployee,
  effectiveLabel,
  workType,
  selectedEntries,
  selectedPackage,
  totalQty,
  notes,
}: Props) {
  return (
    <>
      <dl
        className="mb-4 grid grid-cols-[100px_1fr] gap-x-3 gap-y-2 rounded-[14px] border p-3 text-sm"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <dt className="font-bold" style={{ color: LEGACY_COLORS.muted2 }}>담당자</dt>
        <dd className="font-black" style={{ color: LEGACY_COLORS.text }}>
          {selectedEmployee
            ? `${selectedEmployee.name} · ${normalizeDepartment(selectedEmployee.department)}`
            : "-"}
        </dd>
        <dt className="font-bold" style={{ color: LEGACY_COLORS.muted2 }}>작업</dt>
        <dd className="font-black" style={{ color: LEGACY_COLORS.text }}>{effectiveLabel}</dd>
        {workType !== "package-out" ? (
          <>
            <dt className="font-bold" style={{ color: LEGACY_COLORS.muted2 }}>품목 수</dt>
            <dd className="font-black" style={{ color: LEGACY_COLORS.text }}>{selectedEntries.length}건</dd>
            <dt className="font-bold" style={{ color: LEGACY_COLORS.muted2 }}>총 수량</dt>
            <dd className="font-black tabular-nums" style={{ color: LEGACY_COLORS.text }}>
              {formatNumber(totalQty)} EA
            </dd>
          </>
        ) : (
          <>
            <dt className="font-bold" style={{ color: LEGACY_COLORS.muted2 }}>패키지</dt>
            <dd className="font-black" style={{ color: LEGACY_COLORS.text }}>{selectedPackage?.name ?? "-"}</dd>
          </>
        )}
        {notes && (
          <>
            <dt className="font-bold" style={{ color: LEGACY_COLORS.muted2 }}>메모</dt>
            <dd className="truncate" style={{ color: LEGACY_COLORS.text }}>{notes}</dd>
          </>
        )}
      </dl>

      {workType !== "package-out" && selectedEntries.length > 0 && (
        <div
          className="mb-1 max-h-[180px] overflow-y-auto rounded-[14px] border"
          style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2, overscrollBehavior: "contain" }}
        >
          <ul className="divide-y" style={{ borderColor: LEGACY_COLORS.border }}>
            {selectedEntries.map((entry) => (
              <li
                key={entry.item.item_id}
                className="flex items-center justify-between px-3 py-2 text-xs"
                style={{ borderColor: LEGACY_COLORS.border }}
              >
                <span className="truncate" style={{ color: LEGACY_COLORS.text }}>
                  {entry.item.item_name}
                </span>
                <span className="shrink-0 font-black tabular-nums" style={{ color: LEGACY_COLORS.muted2 }}>
                  ×{formatNumber(entry.quantity)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
