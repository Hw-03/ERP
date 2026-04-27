---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/DesktopAdminView.tsx
status: active
updated: 2026-04-27
source_sha: 7284358b582e
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# DesktopAdminView.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/DesktopAdminView.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `21095` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_components|frontend/app/legacy/_components]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

> 전체 534줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````tsx
"use client";

import type { ElementType } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  FileDown,
  KeyRound,
  Layers,
  PackagePlus,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  api,
  type BOMDetailEntry,
  type BOMEntry,
  type Employee,
  type Item,
  type ProductModel,
  type ShipPackage,
} from "@/lib/api";
import { DesktopRightPanel } from "./DesktopRightPanel";
import { PinLock } from "./PinLock";
import { DEPARTMENT_LABELS, LEGACY_COLORS, formatNumber } from "./legacyUi";
import { AdminMasterItemsSection } from "./_admin_sections/AdminMasterItemsSection";
import { AdminEmployeesSection } from "./_admin_sections/AdminEmployeesSection";
import { AdminBomSection } from "./_admin_sections/AdminBomSection";
import { AdminBomProvider } from "./_admin_sections/AdminBomContext";
import { AdminPackagesProvider } from "./_admin_sections/AdminPackagesContext";
import { AdminMasterItemsProvider } from "./_admin_sections/AdminMasterItemsContext";
import { AdminEmployeesProvider } from "./_admin_sections/AdminEmployeesContext";
import { AdminModelsProvider } from "./_admin_sections/AdminModelsContext";
import { AdminPackagesSection } from "./_admin_sections/AdminPackagesSection";
import { AdminModelsSection } from "./_admin_sections/AdminModelsSection";
import { AdminExportSection } from "./_admin_sections/AdminExportSection";
import { AdminDangerZone } from "./_admin_sections/AdminDangerZone";
import { EMPTY_ADD_FORM, EMPTY_EMPLOYEE_FORM } from "./_admin_sections/adminShared";

type AdminSection = "items" | "employees" | "models" | "bom" | "packages" | "export" | "settings";

const SECTIONS: { id: AdminSection; label: string; description: string; icon: ElementType }[] = [
  { id: "models", label: "모델", description: "제품 모델 추가/삭제", icon: Layers },
  { id: "items", label: "품목", description: "품목 기본 정보 수정", icon: PackagePlus },
  { id: "employees", label: "직원", description: "직원 활성 상태 관리", icon: Users },
  { id: "bom", label: "BOM", description: "부모-자식 자재 구성", icon: Settings2 },
  { id: "packages", label: "출하묶음", description: "패키지 구성 관리", icon: ShieldCheck },
  { id: "export", label: "내보내기", description: "엑셀 데이터 내보내기", icon: FileDown },
];

const SETTINGS_ENTRY = { id: "settings" as AdminSection, label: "설정", description: "PIN, CSV, 초기화", icon: KeyRound };

function SectionHeader({
  icon: Icon,
  label,
  description,
  danger = false,
}: {
  icon: ElementType;
  label: string;
  description: string;
  danger?: boolean;
}) {
  return (
    <div className="mb-4 shrink-0">
      <div className="text-sm font-bold uppercase tracking-[0.22em]" style={{ color: LEGACY_COLORS.muted2 }}>
        Workspace
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-[14px]"
          style={{
            background: danger
              ? `color-mix(in srgb, ${LEGACY_COLORS.red} 14%, transparent)`
              : `color-mix(in srgb, ${LEGACY_COLORS.purple} 14%, transparent)`,
            color: danger ? LEGACY_COLORS.red : LEGACY_COLORS.purple,
          }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-2xl font-black">{label} 관리</div>
        {danger && (
          <span
            className="ml-1 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.red} 14%, transparent)`,
              color: LEGACY_COLORS.red,
            }}
          >
            <AlertTriangle className="h-3 w-3" />
            위험 영역
          </span>
        )}
      </div>
      <div className="mt-1 text-base" style={{ color: LEGACY_COLORS.muted2 }}>
        {description}
      </div>
    </div>
  );
}

function OverviewBar({
  items,
  employees,
  productModels,
  packages,
  allBomRows,
}: {
  items: Item[];
  employees: Employee[];
  productModels: ProductModel[];
  packages: ShipPackage[];
  allBomRows: BOMDetailEntry[];
}) {
  const belowMin = useMemo(
    () =>
      items.filter(
        (i) => i.min_stock != null && Number(i.quantity) < Number(i.min_stock),
      ).length,
    [items],
  );
  const stats = useMemo(
    () => [
      { label: "품목", value: items.length, color: LEGACY_COLORS.blue },
      { label: "직원", value: employees.length, color: LEGACY_COLORS.green },
      { label: "모델", value: productModels.length, color: LEGACY_COLORS.purple },
      { label: "출하묶음", value: packages.length, color: LEGACY_COLORS.cyan },
      { label: "BOM 구성", value: allBomRows.length, color: LEGACY_COLORS.yellow },
      { label: "안전재고 미달", value: belowMin, color: LEGACY_COLORS.red },
    ],
    [items.length, employees.length, productModels.length, packages.length, allBomRows.length, belowMin],
  );
  return (
    <div
      className="mb-4 shrink-0 flex flex-wrap gap-2 rounded-[20px] border px-4 py-3"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      {stats.map(({ label, value, color }) => (
        <div
          key={label}
          className="flex items-center gap-1.5 rounded-[12px] px-3 py-1.5"
          style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}
        >
          <span className="text-sm font-black" style={{ color }}>{formatNumber(value)}</span>
          <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{label}</span>
        </div>
      ))}
      <span className="ml-auto self-center text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
        현재 로드 기준
      </span>
    </div>
  );
}

function SidebarButton({
  entry,
  active,
  onClick,
  danger = false,
}: {
  entry: { id: AdminSection; label: string; description: string; icon: ElementType };
  active: boolean;
  onClick: () => void;
  danger?: boolean;
}) {
  const Icon = entry.icon;
  const tone = danger ? LEGACY_COLORS.red : LEGACY_COLORS.purple;
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[20px] border px-3 py-3 text-left transition-colors hover:bg-white/[0.12]"
      style={{
        background: active
          ? `color-mix(in srgb, ${tone} ${danger ? 14 : 16}%, transparent)`
          : danger
          ? `color-mix(in srgb, ${LEGACY_COLORS.red} 5%, transparent)`
          : LEGACY_COLORS.s2,
        borderColor: active
          ? tone
          : danger
          ? `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, transparent)`
          : LEGACY_COLORS.border,
      }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px]"
        style={{
          background: active
            ? tone
            : danger
            ? `color-mix(in srgb, ${LEGACY_COLORS.red} 18%, transparent)`
            : LEGACY_COLORS.s1,
          color: active ? "#fff" : danger ? LEGACY_COLORS.red : LEGACY_COLORS.muted2,
        }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div
          className="text-base font-bold truncate"
          style={danger ? { color: LEGACY_COLORS.red } : undefined}
        >
          {entry.label}
        </div>
        <div className="mt-0.5 text-xs leading-4 truncate" style={{ color: LEGACY_COLORS.muted2 }}>
          {entry.description}
        </div>
      </div>
    </button>
  );
}

export function DesktopAdminView({
  globalSearch,
  onStatusChange,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
}) {
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
