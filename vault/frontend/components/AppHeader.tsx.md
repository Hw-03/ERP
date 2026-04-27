---
type: code-note
project: ERP
layer: frontend
source_path: frontend/components/AppHeader.tsx
status: active
updated: 2026-04-27
source_sha: 74f2dc4ba734
tags:
  - erp
  - frontend
  - source-file
  - tsx
---

# AppHeader.tsx

> [!summary] 역할
> 원본 프로젝트의 `AppHeader.tsx` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `frontend/components/AppHeader.tsx`
- Layer: `frontend`
- Kind: `source-file`
- Size: `2254` bytes

## 연결

- Parent hub: [[frontend/components/components|frontend/components]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````tsx
﻿"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Factory, PackageSearch, ScrollText, Settings2, Spline, Truck, Zap } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "대시보드", icon: Zap },
  { href: "/inventory", label: "품목 리스트", icon: PackageSearch },
  { href: "/operations", label: "입출고", icon: Truck },
  { href: "/history", label: "거래 이력", icon: ScrollText },
  { href: "/bom", label: "BOM / 생산", icon: Spline },
  { href: "/admin", label: "관리자", icon: Settings2 },
];

export default function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-900/40">
            <Factory className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              Precision Manufacturing ERP
            </p>
            <h1 className="text-xl font-semibold text-slate-100">X-Ray 제조 ERP</h1>
          </div>
        </div>

        <nav className="flex flex-wrap gap-2">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                  active
                    ? "border-blue-500 bg-blue-500 text-white"
                    : "border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
