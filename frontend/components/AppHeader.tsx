"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PackageSearch, ScrollText, Settings2, Spline, Truck, Zap } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "대시보드", icon: Zap },
  { href: "/inventory", label: "품목 리스트", icon: PackageSearch },
  { href: "/operations", label: "입출고", icon: Truck },
  { href: "/history", label: "거래 이력", icon: ScrollText },
  { href: "/bom", label: "BOM / 생산", icon: Spline },
  { href: "/admin", label: "관리자", icon: Settings2 },
];

function DexcowinLogo() {
  return (
    <svg viewBox="0 0 260 46" className="h-8 w-auto" fill="currentColor" aria-label="Dexcowin">
      <defs>
        <mask id="dexcowin-d">
          <rect width="42" height="46" fill="white" />
          {/* inner hollow of D bowl */}
          <path d="M11 10 Q27 10 27 23 Q27 36 11 36 Z" fill="black" />
          {/* triangular notch — creates the angular arrow cutout */}
          <path d="M14 12 L42 23 L14 34 Z" fill="black" />
        </mask>
      </defs>
      {/* D outer shape */}
      <path d="M0 0 L11 0 Q42 0 42 23 Q42 46 11 46 L0 46 Z" mask="url(#dexcowin-d)" />
      {/* EXCOWIN text */}
      <text
        x="50"
        y="37"
        fontFamily="'Arial Black', 'Arial', sans-serif"
        fontWeight="900"
        fontSize="36"
        letterSpacing="-0.5"
      >
        EXCOWIN
      </text>
      {/* ® mark */}
      <text x="242" y="16" fontFamily="Arial, sans-serif" fontSize="13">
        ®
      </text>
    </svg>
  );
}

export default function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-3 px-6 py-3 lg:flex-row lg:items-center lg:justify-between">
        <Link href="/" className="flex items-center text-white hover:opacity-80 transition-opacity">
          <DexcowinLogo />
        </Link>

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
