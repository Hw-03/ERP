---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_inventory_sections/InventoryItemRow.tsx
status: active
updated: 2026-04-27
source_sha: 36d74799df6f
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# InventoryItemRow.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_inventory_sections/InventoryItemRow.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `6558` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_inventory_sections/_inventory_sections|frontend/app/legacy/_components/_inventory_sections]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { memo } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { Item } from "@/lib/api";
import {
  LEGACY_COLORS,
  employeeColor,
  erpCodeDept,
  formatNumber,
  getStockState,
} from "../legacyUi";

function safeQty(item: Item) {
  const n = Number(item.quantity);
  return isNaN(n) ? 0 : n;
}

function getMinStock(item: Item) {
  return item.min_stock == null ? 0 : Number(item.min_stock);
}

type Props = {
  item: Item;
  selected: boolean;
  onSelect: (item: Item | null) => void;
};

function InventoryItemRowImpl({ item, selected, onSelect }: Props) {
  const minStock = getMinStock(item);
  const stock = getStockState(safeQty(item), minStock === 0 ? null : minStock);
  const qty = safeQty(item);
  const isCritical = qty <= 0 || (minStock > 0 && qty < minStock);

  // 재고 분포 게이지 segments
  const total = Math.max(Number(item.quantity), 1);
  const wh = Number(item.warehouse_qty);
  const depts = (item.locations ?? []).filter((l) => Number(l.quantity) > 0);
  const segments: { pct: number; color: string; label: string }[] = [];
  let used = 0;
  if (wh > 0) {
    const pct = Math.min(100, (wh / total) * 100);
    segments.push({ pct, color: "#3ac4b0", label: `창고 ${formatNumber(wh)}` });
    used += pct;
  }
  for (const loc of depts) {
    const pct = Math.min(100 - used, (Number(loc.quantity) / total) * 100);
    if (pct <= 0) break;
    segments.push({
      pct,
      color: employeeColor(loc.department),
      label: `${loc.department} ${formatNumber(loc.quantity)}`,
    });
    used += pct;
  }

  // 부서 배지
  const badges: { key: string; label: string; color: string; dim?: boolean }[] = [];
  if (Number(item.warehouse_qty) > 0) badges.push({ key: "창고", label: "창고", color: "#3dd4a0" });
  for (const l of item.locations.filter((l) => Number(l.quantity) > 0))
    badges.push({ key: l.department, label: l.department, color: employeeColor(l.department) });
  if (badges.length === 0) {
    const dept = item.department ?? erpCodeDept(item.erp_code);
    if (dept) badges.push({ key: dept, label: dept, color: employeeColor(dept), dim: true });
  }
  const visibleBadges = badges.slice(0, 2);
  const extraBadges = badges.length - 2;

  // 색상 외에도 아이콘으로 두 채널 신호 (WCAG 1.4.1)
  const StockIcon = stock.label === "품절" ? XCircle : stock.label === "부족" ? AlertTriangle : CheckCircle2;

  const handleSelect = () => onSelect(selected ? null : item);

  return (
    <tr
      onClick={handleSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSelect();
        }
      }}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      className="group cursor-pointer transition-all hover:bg-[rgba(101,169,255,0.09)] hover:[box-shadow:inset_3px_0_0_rgba(101,169,255,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
      style={{
        background: selected ? "rgba(101,169,255,.10)" : "transparent",
        boxShadow: selected ? `inset 3px 0 0 ${LEGACY_COLORS.blue}` : undefined,
      }}
    >
      <td
        className="border-b px-4 py-2.5 align-middle whitespace-nowrap"
        style={{ borderColor: LEGACY_COLORS.border }}
      >
        <span
          className="inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold"
          style={{ color: stock.color, background: `color-mix(in srgb, ${stock.color} 12%, transparent)` }}
        >
          <StockIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {stock.label}
        </span>
      </td>
      <td className="border-b px-4 py-2.5 align-middle" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="font-semibold">{item.item_name}</div>
        <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          {item.spec || "-"}
        </div>
        {Number(item.quantity) === 0 ? (
          <div
            className="mt-2 h-[5px] overflow-hidden rounded-full"
            style={{ background: "#ef4444" }}
            title="품절"
          />
        ) : (
          <div
            className="mt-2 flex h-[5px] overflow-hidden rounded-full"
            style={{ background: LEGACY_COLORS.s3 }}
            title={segments.map((s) => s.label).join(" / ")}
            role="img"
            aria-label={`재고 분포: ${segments.map((s) => `${s.label} ${s.pct.toFixed(0)}%`).join(", ")}`}
          >
            {segments.map((s, i) => (
              <div
                key={i}
                className="h-full shrink-0"
                style={{ width: `${s.pct}%`, background: s.color }}
              />
            ))}
          </div>
        )}
      </td>
      <td
        className="border-b px-4 py-2.5 align-middle whitespace-nowrap text-sm"
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}
      >
        {item.erp_code ?? "-"}
      </td>
      <td
        className="border-b px-4 py-2.5 align-middle whitespace-nowrap"
        style={{ borderColor: LEGACY_COLORS.border }}
      >
        <div className="flex items-center gap-1.5">
          {visibleBadges.map((b) => (
            <span
              key={b.key}
              className={`text-sm font-bold${b.dim ? " opacity-50" : ""}`}
              style={{ color: b.color }}
            >
              {b.label}
            </span>
          ))}
          {extraBadges > 0 && (
            <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              +{extraBadges}
            </span>
          )}
        </div>
      </td>
      <td
        className="border-b px-4 py-2.5 text-center align-middle whitespace-nowrap text-sm font-bold"
        style={{
          borderColor: LEGACY_COLORS.border,
          color: isCritical ? stock.color : LEGACY_COLORS.text,
        }}
      >
        {formatNumber(item.quantity)}
      </td>
      <td
        className="border-b px-4 py-2.5 text-center align-middle whitespace-nowrap text-sm font-bold"
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
      >
        {item.min_stock == null ? "-" : formatNumber(item.min_stock)}
      </td>
    </tr>
  );
}

export const InventoryItemRow = memo(InventoryItemRowImpl);
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
