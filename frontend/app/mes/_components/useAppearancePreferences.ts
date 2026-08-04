"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { normalizeSidebarMode, type SidebarMode } from "@/lib/sidebar-mode";
import { readCurrentOperator, setCurrentOperator, useCurrentOperator } from "./login/useCurrentOperator";

const SIDEBAR_MODE_STORAGE_KEY = "dexcowin_mes_sidebar_mode";

export type AppearanceTheme = "light" | "dark";

export type AppearancePreferences = {
  theme: AppearanceTheme;
  sidebarMode: SidebarMode;
};

function readTheme(value: unknown): AppearanceTheme {
  return value === "dark" ? "dark" : "light";
}

function readPreferences(): AppearancePreferences {
  const operator = readCurrentOperator();
  return {
    theme: readTheme(operator?.theme ?? window.localStorage.getItem("theme")),
    sidebarMode: operator
      ? normalizeSidebarMode(operator.sidebar_mode) ?? "hover"
      : normalizeSidebarMode(window.localStorage.getItem(SIDEBAR_MODE_STORAGE_KEY)) ?? "hover",
  };
}

/** 현재 화면 설정을 복원하고, 명시적인 저장 시에만 함께 적용한다. */
export function useAppearancePreferences(): {
  preferences: AppearancePreferences;
  savePreferences: (next: AppearancePreferences) => Promise<void>;
} {
  const operator = useCurrentOperator();
  const [preferences, setPreferences] = useState<AppearancePreferences>({ theme: "light", sidebarMode: "hover" });

  useEffect(() => {
    const next = readPreferences();
    document.documentElement.setAttribute("data-theme", next.theme);
    setPreferences(next);
  }, [operator]);

  const savePreferences = useCallback(async (next: AppearancePreferences) => {
    const currentOperator = operator ?? readCurrentOperator();

    if (currentOperator) {
      await Promise.all([
        api.setEmployeeTheme(currentOperator.employee_id, next.theme),
        api.setEmployeeSidebarMode(currentOperator.employee_id, next.sidebarMode),
      ]);
    }

    document.documentElement.setAttribute("data-theme", next.theme);
    window.localStorage.setItem("theme", next.theme);
    window.localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, next.sidebarMode);

    if (currentOperator) {
      setCurrentOperator({ ...currentOperator, theme: next.theme, sidebar_mode: next.sidebarMode });
    }
    setPreferences(next);
  }, [operator]);

  return { preferences, savePreferences };
}
