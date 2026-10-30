"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { makeClientRequestId } from "@/lib/uuid";
import type { DashboardView } from "./_cost/DashboardViewSwitch";

type Participant = { capture: () => unknown; restore: (value: never) => void; isHome?: boolean; home?: () => void };
type Entry = { key: string; index: number; view: DashboardView; values: Map<string, unknown> };
type Navigation = {
  view: DashboardView;
  navigate: (view: DashboardView) => void;
  commit: (action: () => void, replace?: boolean) => void;
  attach: (key: string, read: () => Participant) => () => void;
  flush: (key: string) => void;
  guard: { current: ((action: () => void) => void) | null };
};
const Context = createContext<Navigation | null>(null);
const HISTORY_KEY = "desktopDashboard";

/** History holds opaque references; UI snapshots and authentication stay in this page. */
export function DashboardNavigationProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<DashboardView>("inventory");
  const [controller] = useState(() => {
    const participants = new Map<string, () => Participant>();
    const entries = new Map<string, Entry>();
    const latest = new Map<DashboardView, Entry>();
    const guard: Navigation["guard"] = { current: null };
    let current: Entry = { key: makeClientRequestId(), index: 0, view: "inventory", values: new Map() };
    let pending = new Map<string, unknown>();
    let returning: Entry | null = null;
    let replay: string | null = null;
    const flush = (key: string): void => {
      const read = participants.get(key);
      if (read && pending.has(key)) { const value = pending.get(key); pending.delete(key); read().restore(value as never); }
    };
    const save = (): void => {
      for (const [key, read] of participants) if (key.startsWith(`${current.view}:`)) current.values.set(key, read().capture());
      entries.set(current.key, current); latest.set(current.view, current);
    };
    const write = (replace: boolean): void => {
      const state = { ...window.history.state, [HISTORY_KEY]: { version: 1, key: current.key, index: current.index } };
      window.history[replace ? "replaceState" : "pushState"](state, "");
    };
    const restore = (entry: Entry): void => {
      current = entry; pending = new Map(entry.values); setView(entry.view);
      for (const key of [...pending.keys()]) flush(key);
    };
    const commit = (action: () => void, replace = false): void => {
      if (returning || replay) return;
      save();
      pending.clear();
      current = { key: makeClientRequestId(), index: current.index + (replace ? 0 : 1), view: current.view, values: new Map() };
      entries.set(current.key, current); write(replace); action();
    };
    return {
      guard, flush, commit,
      attach: (key: string, read: () => Participant): (() => void) => { participants.set(key, read); flush(key); return () => { if (participants.get(key) === read) participants.delete(key); }; },
      initialize: (): void => { entries.set(current.key, current); write(true); },
      navigate: (target: DashboardView): void => {
        const perform = (): void => {
          if (target === current.view) {
            const main = participants.get(`${target}:main`)?.();
            if (!main || main.isHome || !main.home) return;
            commit(main.home); return;
          }
          commit(() => {
            current.view = target; write(true);
            const previous = latest.get(target);
            if (previous) restore({ ...current, values: new Map(previous.values) });
            else { pending.clear(); setView(target); }
          });
        };
        if (guard.current) guard.current(perform); else perform();
      },
      pop: (event: PopStateEvent): void => {
        if (new URLSearchParams(window.location.search).get("tab") !== "dashboard") return;
        const entry = entries.get(event.state?.[HISTORY_KEY]?.key);
        if (!entry) return;
        if (returning && entry.key === current.key) {
          const target = returning; returning = null;
          guard.current?.(() => { replay = target.key; window.history.go(target.index - current.index); });
          return;
        }
        if (replay === entry.key) { replay = null; restore(entry); return; }
        if (returning || replay) return;
        save();
        if (guard.current) { returning = entry; window.history.go(current.index - entry.index); }
        else restore(entry);
      },
    };
  });
  useLayoutEffect(() => {
    controller.initialize(); window.addEventListener("popstate", controller.pop);
    return () => window.removeEventListener("popstate", controller.pop);
  }, [controller]);
  return <Context.Provider value={{ ...controller, view }}>{children}</Context.Provider>;
}

export function useDashboardNavigation(): Navigation | null { return useContext(Context); }

/** Register only UI state; adapters are optional for standalone component consumers. */
export function useDashboardSnapshot<T>(key: string, capture: () => T, restore: (value: T) => void, home?: { isHome: boolean; home: () => void }): void {
  const nav = useDashboardNavigation();
  const latest = useRef<Participant>(null!);
  latest.current = { capture, restore: restore as Participant["restore"], ...home };
  const attach = nav?.attach, flush = nav?.flush;
  useLayoutEffect(() => attach?.(key, () => latest.current), [attach, key]);
  useLayoutEffect(() => { flush?.(key); });
}

/** Reapply native scrollers after the owning detail has mounted and laid out. */
export function useDashboardScrollSnapshot(key: string, root: RefObject<HTMLElement | null>): void {
  useDashboardSnapshot(key, () => [...(root.current?.querySelectorAll<HTMLElement>(".sg") ?? [])].map(node => [node.scrollTop, node.scrollLeft]), values => {
    requestAnimationFrame(() => root.current?.querySelectorAll<HTMLElement>(".sg").forEach((node, index) => {
      const value = values[index];
      if (value) { node.scrollTop = value[0]; node.scrollLeft = value[1]; }
    }));
  });
}
