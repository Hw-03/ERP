"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";

export function ThemeToggle({ expanded = false }: { expanded?: boolean }) {
  const [isLight, setIsLight] = useState(true);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      setIsLight(false);
    }
  }, []);

  function toggle() {
    const next = !isLight;
    setIsLight(next);
    if (next) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
    }
  }

  return (
    <button
      onClick={toggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group flex items-center justify-start rounded-[20px] -ml-1.5 w-[calc(100%+6px)] pl-1.5 transition-all duration-150 hover:scale-[1.015]"
      style={{
        background:
          expanded && hovered
            ? "color-mix(in srgb, var(--c-cyan) var(--sidebar-hover-mix, 18%), transparent)"
            : "transparent",
      }}
      title={isLight ? "다크 모드로 전환" : "라이트 모드로 전환"}
    >
      <div className="relative my-1 shrink-0">
        <div
          className="flex h-[46px] w-[46px] items-center justify-center rounded-[16px] transition-all duration-150 group-hover:brightness-110 group-hover:scale-[1.05]"
          style={{
            background: LEGACY_COLORS.s2,
            color: isLight ? LEGACY_COLORS.yellow : LEGACY_COLORS.muted2,
          }}
        >
          {isLight ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </div>
      </div>
      <div
        className="min-w-0 overflow-hidden pl-2 text-left"
        style={{
          opacity: expanded ? 1 : 0,
          transform: expanded ? "translateX(0)" : "translateX(-6px)",
          transition: "opacity 180ms ease, transform 180ms ease",
          willChange: "transform, opacity",
          pointerEvents: expanded ? "auto" : "none",
          width: expanded ? "auto" : 0,
          maxWidth: expanded ? 200 : 0,
        }}
      >
        <div className="truncate text-base font-bold text-left" style={{ color: LEGACY_COLORS.text }}>
          {isLight ? "라이트 모드" : "다크 모드"}
        </div>
        <div className="truncate text-sm text-left" style={{ color: LEGACY_COLORS.muted2 }}>
          {isLight ? "다크 모드로 전환" : "라이트 모드로 전환"}
        </div>
      </div>
    </button>
  );
}
