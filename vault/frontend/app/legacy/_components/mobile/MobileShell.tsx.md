---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/MobileShell.tsx
status: active
updated: 2026-04-27
source_sha: df67dafbcf64
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# MobileShell.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/MobileShell.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `4727` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/mobile|frontend/app/legacy/_components/mobile]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { useState } from "react";
import { Bell, Lock, Package, Warehouse, Wrench, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { LEGACY_COLORS } from "../legacyUi";
import { ELEVATION, TYPO } from "./tokens";
import { AlertsSheet } from "./AlertsSheet";
import { IconButton } from "./primitives";

export type TabId = "inventory" | "warehouse" | "dept" | "admin";

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "inventory", label: "재고", icon: Package },
  { id: "warehouse", label: "창고입출고", icon: Warehouse },
  { id: "dept", label: "부서입출고", icon: Wrench },
  { id: "admin", label: "관리자", icon: Lock },
];

export function MobileShell({
  activeTab,
  onTabChange,
  title,
  subtitle,
  headerRight,
  children,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  title: string;
  subtitle: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [alertsOpen, setAlertsOpen] = useState(false);

  return (
    <div className="h-screen overflow-hidden bg-black">
      <div
        className="mx-auto flex h-full max-w-[430px] flex-col overflow-hidden"
        style={{
          background: LEGACY_COLORS.bg,
          color: LEGACY_COLORS.text,
          boxShadow: "0 0 60px rgba(0,0,0,.8)",
        }}
      >
        <div
          className="shrink-0"
          style={{
            height: "env(safe-area-inset-top, 18px)",
            background: `linear-gradient(180deg, ${LEGACY_COLORS.s1 as string} 0%, ${LEGACY_COLORS.s1 as string} 100%)`,
          }}
        />

        <header
          className="relative flex shrink-0 items-end justify-between px-5 pb-3 pt-2"
          style={{
            background: LEGACY_COLORS.s1,
            boxShadow: ELEVATION.sticky,
          }}
        >
          <div className="min-w-0 flex-1">
            <div
              className={clsx(TYPO.overline, "font-bold uppercase tracking-[2.5px]")}
              style={{ color: LEGACY_COLORS.muted2 }}
            >
              {subtitle}
            </div>
            <div
              className={clsx(TYPO.headline, "font-black leading-tight")}
              style={{ color: LEGACY_COLORS.text }}
            >
              {title}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {headerRight}
            <IconButton icon={Bell} label="알림" size="md" onClick={() => setAlertsOpen(true)} />
          </div>
        </header>

        <main className="relative flex-1 overflow-y-auto">{children}</main>

        <nav
          className="shrink-0"
          style={{
            background: LEGACY_COLORS.s1,
            boxShadow: "0 -8px 20px rgba(0,0,0,.28)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 10px))",
          }}
        >
          <div className="flex px-2 pt-2">
            {TABS.map((tab) => {
              const active = tab.id === activeTab;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className="flex flex-1 flex-col items-center gap-[3px] py-1 transition-[transform] active:scale-[0.92]"
                  aria-label={tab.label}
                  aria-current={active ? "page" : undefined}
                >
                  <span
                    className={clsx(
                      "relative inline-flex h-9 w-[48px] items-center justify-center rounded-full transition-colors",
                    )}
                    style={{
                      background: active ? `${LEGACY_COLORS.blue as string}1f` : "transparent",
                    }}
                  >
                    <Icon
                      size={20}
                      strokeWidth={active ? 2.25 : 1.75}
                      color={active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted}
                    />
                  </span>
                  <div
                    className={clsx(TYPO.overline, active ? "font-black" : "font-semibold")}
                    style={{
                      color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted,
                      letterSpacing: "0.5px",
                    }}
                  >
                    {tab.label}
                  </div>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      <AlertsSheet open={alertsOpen} onClose={() => setAlertsOpen(false)} />
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
