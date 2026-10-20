"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";

type ViewValue = string | number | boolean | null | { [key: string]: ViewValue | undefined };
const SessionContext = createContext<Map<string, ViewValue> | null>(null);

/** Keep navigation preferences only for this mounted admin session; never store drafts or credentials. */
export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const values = useRef(new Map<string, ViewValue>());
  return <SessionContext.Provider value={values.current}>{children}</SessionContext.Provider>;
}

export function useAdminSessionState<T extends ViewValue>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const session = useContext(SessionContext);
  const [value, setValue] = useState<T>(() => session?.has(key) ? session.get(key) as T : initial);
  const current = useRef(value);
  const update = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    const next = typeof action === "function" ? action(current.current) : action;
    current.current = next;
    session?.set(key, next);
    setValue(next);
  }, [key, session]);
  return [value, update];
}

/** Restore scroll only once data has a height, without rerendering on every scroll event. */
export function useAdminScrollRestoration(key: string, viewport: RefObject<HTMLDivElement | null>, ready: boolean): void {
  const session = useContext(SessionContext);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!session || !element || !ready) return;
    const saved = session.get(key);
    element.scrollTop = typeof saved === "number" ? saved : 0;
    const remember = () => session.set(key, element.scrollTop);
    element.addEventListener("scroll", remember, { passive: true });
    return () => element.removeEventListener("scroll", remember);
  }, [key, ready, session, viewport]);
}
