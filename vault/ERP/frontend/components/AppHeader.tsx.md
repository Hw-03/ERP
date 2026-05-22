---
type: file-explanation
source_path: "frontend/components/AppHeader.tsx"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# AppHeader.tsx — AppHeader.tsx 설명

## 이 파일은 무엇을 책임지나

`AppHeader.tsx`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/components/AppHeader.tsx` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `AppHeader`

## 연결되는 파일

- [[ERP/frontend/components/📁_components]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```tsx
"use client";

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
              Precision Manufacturing MES
            </p>
            <h1 className="text-xl font-semibold text-slate-100">DEXCOWIN MES</h1>
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
```
