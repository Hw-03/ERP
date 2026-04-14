"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { LEGACY_COLORS } from "./legacyUi";

export function ThemeToggle() {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "light") {
      document.documentElement.setAttribute("data-theme", "light");
      setIsLight(true);
    }
  }, []);

  function toggle() {
    const next = !isLight;
    setIsLight(next);
    if (next) {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("theme", "dark");
    }
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center justify-center rounded-2xl px-3 py-3 transition-all duration-200 ease-out hover:brightness-110"
      style={{
        background: LEGACY_COLORS.s2,
        color: isLight ? LEGACY_COLORS.yellow : LEGACY_COLORS.muted2,
        border: `1px solid ${LEGACY_COLORS.border}`,
        boxShadow: "var(--c-inner-hl)",
      }}
      title={isLight ? "다크 모드로 전환" : "라이트 모드로 전환"}
    >
      {isLight ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
