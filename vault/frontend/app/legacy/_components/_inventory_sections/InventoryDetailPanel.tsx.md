---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_inventory_sections/InventoryDetailPanel.tsx
status: active
updated: 2026-04-27
source_sha: a6912f78b769
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# InventoryDetailPanel.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_inventory_sections/InventoryDetailPanel.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `8285` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_inventory_sections/_inventory_sections|frontend/app/legacy/_components/_inventory_sections]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import type { Item, TransactionLog } from "@/lib/api";
import {
  LEGACY_COLORS,
  employeeColor,
  formatNumber,
  normalizeModel,
  transactionColor,
  transactionLabel,
} from "../legacyUi";

type Props = {
  item: Item;
  logs: TransactionLog[];
  onGoToWarehouse: (item: Item) => void;
};

export function InventoryDetailPanel({ item, logs, onGoToWarehouse }: Props) {
  return (
    <div className="space-y-4">
      {/* 품목 정보 */}
      <section
        className="rounded-[28px] border p-5"
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
      >
        <div className="mb-3 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
          품목 정보
        </div>
        <div className="grid gap-3 text-base">
          {item.erp_code && (
            <div
              className="rounded-[18px] border px-4 py-3"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
              <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                ERP 코드
              </div>
              <div className="mt-1 text-base font-bold" style={{ color: LEGACY_COLORS.blue }}>
                {item.erp_code}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div
              className="rounded-[18px] border px-4 py-3"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
              <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                현재고
              </div>
              <div className="mt-1 text-xl font-black">{formatNumber(item.quantity)}</div>
            </div>
            <div
              className="rounded-[18px] border px-4 py-3"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
              <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                안전재고
              </div>
              <div className="mt-1 text-xl font-black">
                {item.min_stock == null ? "-" : formatNumber(item.min_stock)}
              </div>
            </div>
          </div>
          <div
            className="rounded-[18px] border px-4 py-3"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              모델
            </div>
            <div className="mt-1 text-base">{normalizeModel(item.legacy_model)}</div>
          </div>
          {(item.unit || item.supplier) && (
            <div className="grid grid-cols-2 gap-3">
              <div
                className="rounded-[18px] border px-4 py-3"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              >
                <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  단위
                </div>
                <div className="mt-1 text-base">{item.unit || "-"}</div>
              </div>
              <div
                className="rounded-[18px] border px-4 py-3"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              >
                <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  공급처
                </div>
                <div className="mt-1 text-sm truncate">{item.supplier || "-"}</div>
              </div>
            </div>
          )}
          {item.spec && (
            <div
              className="rounded-[18px] border px-4 py-3"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
              <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                스펙
              </div>
              <div className="mt-1 text-base">{item.spec}</div>
            </div>
          )}
        </div>
      </section>

      {/* 위치별 재고 */}
      {(Number(item.warehouse_qty) > 0 || (item.locations ?? []).some((l) => Number(l.quantity) > 0)) && (
        <section
          className="rounded-[28px] border p-5"
          style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
        >
          <div className="mb-3 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
            위치별 재고
          </div>
          <div className="space-y-2">
            {Number(item.warehouse_qty) > 0 && (
              <div
                className="flex items-center gap-3 rounded-[14px] border px-3 py-2.5"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              >
                <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LEGACY_COLORS.muted2 }} />
                <span className="flex-1 text-base font-semibold">창고</span>
                <span className="text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
                  {formatNumber(item.warehouse_qty)}
                </span>
              </div>
            )}
            {(item.locations ?? [])
              .filter((l) => Number(l.quantity) > 0)
              .map((l) => (
                <div
                  key={l.department}
                  className="flex items-center gap-3 rounded-[14px] border px-3 py-2.5"
                  style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
                >
                  <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: employeeColor(l.department) }} />
                  <span className="flex-1 text-base font-semibold">{l.department}</span>
                  <span className="text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
                    {formatNumber(l.quantity)}
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* 빠른 작업 */}
      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
          빠른 작업
        </div>
        <button
          onClick={() => onGoToWarehouse(item)}
          className="w-full rounded-[18px] px-4 py-3.5 text-base font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: LEGACY_COLORS.blue }}
        >
          입출고 진행
        </button>
      </div>

      {/* 최근 이력 */}
      <section
        className="rounded-[28px] border p-5"
        style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
      >
        <div className="mb-3 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
          최근 이력
        </div>
        <div className="space-y-2">
          {logs.length === 0 ? (
            <div className="text-base" style={{ color: LEGACY_COLORS.muted2 }}>
              최근 거래 이력이 없습니다.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.log_id}
                className="rounded-[18px] border p-3"
                style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold" style={{ color: transactionColor(log.transaction_type) }}>
                    {transactionLabel(log.transaction_type)}
                  </span>
                  <span className="text-sm">{formatNumber(log.quantity_change)}</span>
                </div>
                <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  {log.notes || "메모 없음"}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
