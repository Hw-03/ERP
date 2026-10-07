"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { employeesApi, type EmployeeAppearance } from "@/lib/api/employees";
import { normalizeSidebarMode, type SidebarMode } from "@/lib/sidebar-mode";
import { readCurrentOperator, updateCurrentOperatorPreferences, useCurrentOperator } from "./login/useCurrentOperator";

export type AppearanceTheme = "light" | "dark";
export type AppearancePreferences = { theme: AppearanceTheme; sidebarMode: SidebarMode };
type AppearanceContextValue = { preferences: AppearancePreferences; savePreferences: (next: AppearancePreferences) => Promise<void> };
const AppearanceContext = createContext<AppearanceContextValue | null>(null);
const SAVED_EVENT_KEY = "dexcowin_mes_appearance_saved";
const DEFAULT_PREFERENCES: AppearancePreferences = { theme: "light", sidebarMode: "hover" };

function currentPreferences(): AppearancePreferences {
  const operator = readCurrentOperator();
  return {
    theme: operator?.theme === "dark" ? "dark" : "light",
    sidebarMode: normalizeSidebarMode(operator?.sidebar_mode) ?? "hover",
  };
}

/** One owner above the login gate keeps desktop, mobile and login theme in sync. */
export function AppearancePreferencesProvider({ children }: { children: ReactNode }) {
  const operator = useCurrentOperator();
  const [preferences, setPreferences] = useState<AppearancePreferences>(DEFAULT_PREFERENCES);
  const readGeneration = useRef(0);
  const saveGeneration = useRef(0);
  const activeRead = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const retryNeeded = useRef(false);

  const invalidateRead = useCallback(() => {
    readGeneration.current += 1;
    activeRead.current?.abort();
    activeRead.current = null;
  }, []);

  const apply = useCallback((employeeId: string, pair: EmployeeAppearance) => {
    if (!mounted.current || readCurrentOperator()?.employee_id !== employeeId) return;
    const next = { theme: pair.theme, sidebarMode: pair.sidebar_mode };
    document.documentElement.setAttribute("data-theme", next.theme);
    setPreferences(next);
    updateCurrentOperatorPreferences({ theme: pair.theme, sidebar_mode: pair.sidebar_mode }, employeeId);
  }, []);

  const refresh = useCallback(async (employeeId: string, fallback?: EmployeeAppearance) => {
    invalidateRead();
    const generation = readGeneration.current;
    const controller = new AbortController();
    activeRead.current = controller;
    const current = () => mounted.current && !controller.signal.aborted && generation === readGeneration.current && readCurrentOperator()?.employee_id === employeeId;
    try {
      const pair = await employeesApi.getEmployeeAppearance(employeeId, controller.signal);
      if (pair.employee_id !== employeeId || (pair.theme !== "light" && pair.theme !== "dark") || !normalizeSidebarMode(pair.sidebar_mode)) throw new Error("Invalid appearance pair");
      if (!current()) return;
      retryNeeded.current = false;
      apply(employeeId, pair);
    } catch {
      if (!current()) return;
      retryNeeded.current = true;
      if (fallback) apply(employeeId, fallback);
    }
  }, [apply, invalidateRead]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; invalidateRead(); saveGeneration.current += 1; };
  }, [invalidateRead]);

  useEffect(() => {
    invalidateRead();
    saveGeneration.current += 1;
    retryNeeded.current = false;
    const next = currentPreferences();
    document.documentElement.setAttribute("data-theme", next.theme);
    setPreferences(next);
    const employeeId = operator?.employee_id;
    if (employeeId) void refresh(employeeId);
    return invalidateRead;
  }, [operator?.employee_id, invalidateRead, refresh]);

  useEffect(() => {
    const next = currentPreferences();
    document.documentElement.setAttribute("data-theme", next.theme);
    setPreferences(next);
  }, [operator?.theme, operator?.sidebar_mode]);

  useEffect(() => {
    const onSaved = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || event.key !== SAVED_EVENT_KEY || !event.newValue) return;
      try {
        const saved = JSON.parse(event.newValue) as { version?: unknown; employeeId?: unknown; eventId?: unknown };
        const employeeId = readCurrentOperator()?.employee_id;
        if (saved.version === 1 && saved.employeeId === employeeId && typeof saved.eventId === "string" && employeeId) void refresh(employeeId);
      } catch { /* Ignore malformed notifications; only the server supplies preferences. */ }
    };
    const retry = () => {
      const employeeId = readCurrentOperator()?.employee_id;
      if (retryNeeded.current && employeeId && document.visibilityState === "visible") void refresh(employeeId);
    };
    window.addEventListener("storage", onSaved);
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    return () => {
      window.removeEventListener("storage", onSaved);
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [refresh]);

  const savePreferences = useCallback(async (next: AppearancePreferences) => {
    const employeeId = readCurrentOperator()?.employee_id;
    if (!employeeId) return;
    const generation = ++saveGeneration.current;
    invalidateRead();
    const saved = await employeesApi.setEmployeeAppearance(employeeId, { theme: next.theme, sidebar_mode: next.sidebarMode });
    if (saved.employee_id !== employeeId) throw new Error("Appearance employee mismatch");
    // Successful writes notify other tabs even if this tab changed employee meanwhile.
    try {
      window.localStorage.setItem(SAVED_EVENT_KEY, JSON.stringify({ version: 1, employeeId, eventId: crypto.randomUUID() }));
    } catch { /* Storage restrictions must not turn a committed save into a failure. */ }
    if (!mounted.current || readCurrentOperator()?.employee_id !== employeeId) return;
    // A late earlier write can become the final DB value; read it without applying its stale payload.
    await refresh(employeeId, generation === saveGeneration.current ? saved : undefined);
  }, [invalidateRead, refresh]);

  return createElement(AppearanceContext.Provider, { value: { preferences, savePreferences } }, children);
}

export function useAppearancePreferences(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error("AppearancePreferencesProvider is required");
  return context;
}
