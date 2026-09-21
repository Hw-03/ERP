"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import { useConfirmNavigation, useRegisterDirty } from "@/lib/ui/dirty-guard";

type HomeRegistration = {
  isHome: boolean;
  busy?: boolean;
  /** Detail-only dismissal can retain the underlying draft. */
  preservesDraft?: boolean;
  returnHome: () => void;
};
type HomeContext = {
  register: (key: string, read: () => HomeRegistration) => () => void;
  requestHome: (onReturned?: () => void) => void;
  returnSequence: number;
  queries: Map<string, unknown>;
};
const Context = createContext<HomeContext | null>(null);

/** Registrations belong to mounted desktop screens, never to URL guesses. */
export function DesktopTabHomeProvider({ children }: { children: ReactNode }) {
  const entries = useRef(new Map<string, () => HomeRegistration>());
  const queries = useRef(new Map<string, unknown>());
  const pending = useRef(false);
  const [returnSequence, setReturnSequence] = useState(0);
  const confirm = useConfirmNavigation();
  const register = useCallback((key: string, read: () => HomeRegistration) => {
    entries.current.set(key, read);
    return () => { if (entries.current.get(key) === read) entries.current.delete(key); };
  }, []);
  const requestHome = useCallback((onReturned?: () => void) => {
    if (pending.current) return;
    const registrations = [...entries.current.entries()].filter(([, read]) => !read().isHome);
    const all = [...entries.current.values()].map((read) => read());
    const departing = all.filter((entry) => !entry.isHome);
    if (!departing.length || all.some((entry) => entry.busy)) return;
    pending.current = true;
    const cancel = () => { pending.current = false; };
    const proceed = () => {
      if (registrations.some(([key, read]) => entries.current.get(key) !== read)) { cancel(); return; }
      const current = [...entries.current.values()].map((read) => read());
      if (current.some((entry) => entry.busy)) { cancel(); return; }
      const targets = current.filter((entry) => !entry.isHome);
      targets.forEach((entry) => entry.returnHome());
      if (targets.length) onReturned?.();
      if (targets.length) setReturnSequence((value) => value + 1);
      // Layout effects publish the committed home state before accepting another click.
      queueMicrotask(cancel);
    };
    if (departing.every((entry) => entry.preservesDraft)) proceed();
    else confirm(proceed, cancel);
  }, [confirm]);
  const value = useMemo(() => ({ register, requestHome, returnSequence, queries: queries.current }), [register, requestHome, returnSequence]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** Optional in shared views so mobile behavior is unchanged. */
export function useDesktopTabHome(key: string, registration: HomeRegistration): void {
  const context = useContext(Context);
  const latest = useRef(registration);
  useLayoutEffect(() => { latest.current = registration; });
  const register = context?.register;
  useLayoutEffect(() => register?.(key, () => latest.current), [register, key]);
}

export function useDesktopTabHomeController(): Pick<HomeContext, "requestHome" | "returnSequence"> {
  const context = useContext(Context);
  if (!context) throw new Error("DesktopTabHomeProvider is required");
  return context;
}

/** Work without draft persistence must never execute its business action as a save. */
export function useDesktopWorkGuard(key: string, dirty: boolean, busy: boolean): void {
  const context = useContext(Context);
  useRegisterDirty(key, !!context && dirty, () => {}, undefined, { mode: "confirm-only" });
  useDesktopTabHome(`${key}-busy`, { isHome: true, busy, returnHome: () => {} });
}

/** Retain only query controls when a desktop subview closes, never work drafts. */
export function useDesktopQueryState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const context = useContext(Context);
  const [value, setValue] = useState<T>(() => context?.queries.has(key)
    ? context.queries.get(key) as T
    : typeof initial === "function" ? (initial as () => T)() : initial);
  useLayoutEffect(() => { context?.queries.set(key, value); }, [context, key, value]);
  return [value, setValue];
}
