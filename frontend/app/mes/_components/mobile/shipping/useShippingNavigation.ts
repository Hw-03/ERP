"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConfirmNavigation } from "@/lib/ui/dirty-guard";
import { readShippingRoute, shippingRouteUrl, type ShippingRoute } from "./shipping-route";
import { mobileHistoryState } from "../historyState";

const INDEX_KEY = "mobileShippingIndex";

/** 단계 이동은 초안을 유지하고, 작업을 벗어나는 브라우저 이동만 이탈 확인을 거친다. */
export function useShippingNavigation(onNavigateAway?: (tab: string) => void, busy = false) {
  const [route, setRoute] = useState(() => readShippingRoute(typeof window === "undefined" ? "" : window.location.search));
  const routeRef = useRef(route);
  const locationRef = useRef({ href: "", state: {} as Record<string, unknown> });
  const restoringRef = useRef<(() => void) | null>(null);
  const allowedPopRef = useRef(false);
  const confirm = useConfirmNavigation();
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const rememberLocation = useCallback(() => {
    locationRef.current = { href: window.location.href, state: window.history.state ?? {} };
  }, []);

  useEffect(() => {
    if (typeof window.history.state?.[INDEX_KEY] !== "number") {
      window.history.replaceState(mobileHistoryState(window.history.state, 0), "");
    }
    rememberLocation();
  }, [rememberLocation]);

  const accept = useCallback((next: ShippingRoute) => {
    routeRef.current = next;
    setRoute(next);
    rememberLocation();
    const tab = new URLSearchParams(window.location.search).get("tab") ?? "dashboard";
    if (tab !== "shipping") onNavigateAway?.(tab);
  }, [onNavigateAway, rememberLocation]);

  useEffect(() => {
    const onPop = () => {
      if (restoringRef.current) {
        const restored = restoringRef.current;
        restoringRef.current = null;
        restored();
        return;
      }
      const next = readShippingRoute(window.location.search);
      if (busyRef.current) {
        const previous = locationRef.current;
        const fromIndex = previous.state[INDEX_KEY];
        const toIndex = window.history.state?.[INDEX_KEY];
        if (typeof fromIndex === "number" && typeof toIndex === "number" && fromIndex !== toIndex) {
          restoringRef.current = () => {};
          window.history.go(fromIndex - toIndex);
        } else window.history.replaceState(previous.state, "", previous.href);
        return;
      }
      const current = routeRef.current;
      const staysInDraft = new URLSearchParams(window.location.search).get("tab") === "shipping"
        && current.view === "requestWork" && next.view === "requestWork" && current.requestId === next.requestId;
      if (allowedPopRef.current || staysInDraft) {
        allowedPopRef.current = false;
        accept(next);
        return;
      }
      const destination = { href: window.location.href, state: window.history.state };
      const previous = locationRef.current;
      const fromIndex = previous.state[INDEX_KEY];
      const toIndex = destination.state?.[INDEX_KEY];
      const delta = typeof fromIndex === "number" && typeof toIndex === "number" ? fromIndex - toIndex : 0;
      if (delta !== 0) {
        restoringRef.current = () => confirm(() => {
          allowedPopRef.current = true;
          window.history.go(-delta);
        });
        window.history.go(delta);
      } else {
        window.history.replaceState(previous.state, "", previous.href);
        confirm(() => {
          window.history.replaceState(destination.state, "", destination.href);
          accept(next);
        });
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [accept, confirm]);

  const navigate = useCallback((next: ShippingRoute, options: { replace?: boolean; bypassGuard?: boolean } = {}) => {
    if (busyRef.current && !options.bypassGuard) return;
    const move = () => {
      const previousIndex = Number(window.history.state?.[INDEX_KEY] ?? 0);
      const state = mobileHistoryState(window.history.state, previousIndex + (options.replace ? 0 : 1));
      const url = shippingRouteUrl(window.location.href, next);
      if (options.replace) window.history.replaceState(state, "", url);
      else window.history.pushState(state, "", url);
      accept(next);
    };
    const current = routeRef.current;
    const isStep = current.view === "requestWork" && next.view === "requestWork" && current.requestId === next.requestId;
    if (options.bypassGuard || isStep) move();
    else confirm(move);
  }, [accept, confirm]);

  return { route, navigate };
}
