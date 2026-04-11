"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Factory, PackageSearch, ScrollText, Spline, Zap } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "대시보드", icon: Zap },
  { href: "/inventory", label: "품목 리스트", icon: PackageSearch },
  { href: "/history", label: "거래 이력", icon: ScrollText },
  { href: "/bom", label: "BOM / 생산", icon: Spline },
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
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Precision Manufacturing ERP
            </p>
            <h1 className="text-lg font-semibold text-slate-100">X-Ray 제조 ERP</h1>
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
