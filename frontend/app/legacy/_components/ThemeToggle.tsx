"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { api } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useCurrentOperator, setCurrentOperator } from "./login/useCurrentOperator";

export function ThemeToggle({ expanded = false }: { expanded?: boolean }) {
  const operator = useCurrentOperator();
  const [isLight, setIsLight] = useState(true);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    // operator.theme 또는 localStorage에서 테마 읽기 (operator 우선)
    const theme = operator?.theme ?? localStorage.getItem("theme");
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      setIsLight(false);
    } else {
      document.documentElement.setAttribute("data-theme", "light");
      setIsLight(true);
    }
  }, [operator?.theme]);

  function toggle() {
    const next = !isLight;
    setIsLight(next);
    const newTheme = next ? "light" : "dark";

    document.documentElement.setAttribute("data-theme", newTheme);

    // localStorage에 저장 (항상)
    localStorage.setItem("theme", newTheme);

    // 로그인된 operator가 있으면 백엔드에 저장 (fire-and-forget)
    if (operator) {
      api.setEmployeeTheme(operator.employee_id, newTheme).catch(() => {
        // 실패해도 무시 (UI는 이미 업데이트됨)
      });

      // localStorage에 operator 정보 갱신
      const updated = { ...operator, theme: newTheme };
      setCurrentOperator(updated);
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
