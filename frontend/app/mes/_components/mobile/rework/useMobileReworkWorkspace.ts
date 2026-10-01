"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { deptAdjustmentApi } from "@/lib/api/dept-adjustment";
import { allocateNormal, bounded, fromTemplate, getNode, hasChanges, isSplit, updateNode, type MobileReworkDecision, type ReworkPath } from "./mobileReworkModel";

interface Navigation { path: ReworkPath; review: boolean; depth: number }
interface LevelView { search: string; changedOnly: boolean; scrollTop: number }
export interface MobileReworkMemory {
  key: string;
  views: Record<string, LevelView>;
  normalQty: number;
  expanded?: Record<string, boolean>;
}
const ROOT: Navigation = { path: [], review: false, depth: 0 };
const EMPTY_VIEW: LevelView = { search: "", changedOnly: false, scrollTop: 0 };

/** 이전 단계·시트 기록을 하나의 목록으로 복원하며 활성 조상만 펼친다. */
function restoreNavigation(value: Navigation | undefined, nodes: MobileReworkDecision[], expanded: Record<string, boolean>): Navigation {
  if (!value || !Array.isArray(value.path)) return ROOT;
  const path: ReworkPath = [];
  const depth = Number.isFinite(value.depth) ? value.depth : 0;
  for (const index of value.path) {
    const node = getNode(nodes, [...path, index]);
    if (!node || !isSplit(node)) break;
    path.push(index);
    expanded[path.join("/")] = true;
  }
  return { path: [], review: Boolean(value.review), depth };
}

function sameView(a: Navigation, b: Navigation): boolean {
  return a.review === b.review && (a.review || a.path.join("/") === b.path.join("/"));
}

export function useMobileReworkWorkspace({
  sessionId, parentItemId, parentQty, decisions, onChange, sessionRef, onBack, busy,
}: {
  sessionId: string;
  parentItemId: string;
  parentQty: number;
  decisions: MobileReworkDecision[];
  onChange: (next: MobileReworkDecision[]) => void;
  sessionRef: MutableRefObject<MobileReworkMemory | null>;
  onBack: () => void;
  busy: boolean;
}) {
  const key = `${sessionId}:${parentItemId}:${parentQty}`;
  const latest = useRef({ decisions, onChange });
  latest.current = { decisions, onChange };
  const memory = sessionRef.current?.key === key ? sessionRef.current : { key, views: {}, normalQty: parentQty };
  memory.expanded ??= {};
  const expanded = memory.expanded;
  sessionRef.current = memory;
  const [nav, setNav] = useState<Navigation>(ROOT);
  const navRef = useRef(nav);
  const [, redraw] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [childError, setChildError] = useState<{ path: string; message: string } | null>(null);
  const [transition, setTransition] = useState<{ path: ReworkPath; mode: "whole" } | null>(null);
  const [scrollRequest, setScrollRequest] = useState<{ path: string; highlight: boolean } | null>(null);
  const generation = useRef(0);
  const childRequest = useRef(0);
  const previousKey = useRef(key);

  useEffect(() => {
    const changedParent = previousKey.current !== key;
    previousKey.current = key;
    const version = ++generation.current;
    const invalidate = (): void => { if (generation.current === version) generation.current = version + 1; };
    ++childRequest.current;
    setLoadingPath(null);
    setTransition(null);
    setChildError(null);
    const saved = window.history.state?.mobileRework;
    const initial = saved?.key === key ? restoreNavigation(saved.nav, latest.current.decisions, expanded) : ROOT;
    navRef.current = initial;
    setNav(initial);
    window.history.replaceState({ ...window.history.state, mobileRework: { key, nav: initial } }, "");
    setLoadError(null);
    if (!changedParent && latest.current.decisions.length > 0) {
      setLoading(false);
      return invalidate;
    }
    if (changedParent) latest.current.onChange([]);
    setLoading(true);
    void deptAdjustmentApi.getBomTemplate(parentItemId, "disassembly", parentQty).then((result) => {
      if (version !== generation.current) return;
      latest.current.onChange(result.lines.filter((line) => line.item_id !== parentItemId).map(fromTemplate));
    }).catch((error: unknown) => {
      if (version === generation.current) setLoadError(error instanceof Error ? error.message : "구성품을 불러오지 못했습니다.");
    }).finally(() => {
      if (version === generation.current) setLoading(false);
    });
    return invalidate;
  }, [key, parentItemId, parentQty, retry, expanded]);

  useEffect(() => {
    function restore(event: PopStateEvent): void {
      ++childRequest.current;
      setLoadingPath(null);
      setChildError(null);
      setTransition(null);
      const saved = event.state?.mobileRework;
      if (saved?.key !== key) return;
      const previous = navRef.current;
      const next = restoreNavigation(saved.nav, latest.current.decisions, expanded);
      navRef.current = next;
      setNav(next);
      window.history.replaceState({ ...event.state, mobileRework: { key, nav: next } }, "");
      // 시트 기록이나 통째 전환으로 같은 목록이 연속되면 이동 방향으로 한 번 더 진행한다.
      if (sameView(previous, next) && previous.depth !== next.depth) {
        window.history.go(next.depth < previous.depth ? -1 : 1);
      }
    }
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [key, expanded]);

  function cancelChild(): void {
    ++childRequest.current;
    setLoadingPath(null);
    setChildError(null);
    setTransition(null);
  }

  function navigate(next: Pick<Navigation, "path" | "review">, replace = false): void {
    if (busy) return;
    cancelChild();
    const value = { ...next, path: [], depth: navRef.current.depth + (replace ? 0 : 1) };
    if (!replace && sameView(navRef.current, value)) return;
    window.history[replace ? "replaceState" : "pushState"]({ ...window.history.state, mobileRework: { key, nav: value } }, "");
    navRef.current = value;
    setNav(value);
  }

  function goBack(): void {
    if (busy) return;
    if (transition) { setTransition(null); return; }
    cancelChild();
    if (navRef.current.depth > 0) window.history.back();
    else onBack();
  }

  const viewKey = nav.review ? "review" : nav.path.join("/");
  const view = memory.views[viewKey] ?? EMPTY_VIEW;
  function updateView(patch: Partial<LevelView>): void {
    memory.views[viewKey] = { ...(memory.views[viewKey] ?? EMPTY_VIEW), ...patch };
    if (patch.search !== undefined || patch.changedOnly !== undefined) redraw((value) => value + 1);
  }

  function changeDecisions(next: MobileReworkDecision[]): void {
    latest.current.decisions = next;
    latest.current.onChange(next);
  }

  function edit(path: ReworkPath, change: (node: MobileReworkDecision) => MobileReworkDecision): void {
    if (!busy) changeDecisions(updateNode(latest.current.decisions, path, change));
  }

  async function split(path: ReworkPath): Promise<void> {
    const node = getNode(latest.current.decisions, path);
    if (!node || !node.has_bom || loadingPath !== null || busy) return;
    const pathKey = path.join("/");
    if (path.length >= 10) { setChildError({ path: pathKey, message: "하위 품목은 10단계까지 처리할 수 있습니다." }); return; }
    const version = generation.current;
    const request = ++childRequest.current;
    setLoadingPath(pathKey);
    setChildError(null);
    try {
      let children = node.children;
      if (!children?.length) {
        const result = await deptAdjustmentApi.getBomTemplate(node.item_id, "disassembly", node.qty);
        if (version !== generation.current || request !== childRequest.current) return;
        const raw = result.lines.filter((line) => line.item_id !== node.item_id).map(fromTemplate);
        if (raw.length === 0) throw new Error("하위 구성품이 없습니다. 이 품목을 통째로 처리해 주세요.");
        children = allocateNormal(raw, node.normal_qty, node.qty);
      }
      edit(path, (current) => ({ ...current, children, nodeMode: "split" }));
      expanded[pathKey] = true;
      if (navRef.current.review) navigate({ path: [], review: false });
      setScrollRequest({ path: [...path, 0].join("/"), highlight: false });
      redraw((value) => value + 1);
    } catch (error: unknown) {
      if (version === generation.current && request === childRequest.current) {
        setChildError({ path: pathKey, message: error instanceof Error ? error.message : "하위 구성품을 불러오지 못했습니다." });
      }
    } finally {
      if (version === generation.current && request === childRequest.current) setLoadingPath(null);
    }
  }

  function requestSplit(path: ReworkPath): void {
    if (busy) return;
    const node = getNode(latest.current.decisions, path);
    if (!node) return;
    void split(path);
  }

  function whole(path: ReworkPath): void {
    edit(path, (node) => ({ ...node, nodeMode: "whole" }));
    setScrollRequest({ path: path.join("/"), highlight: false });
  }

  function requestWhole(path: ReworkPath): void {
    if (busy) return;
    const node = getNode(latest.current.decisions, path);
    if (node?.children?.some((child) => hasChanges(child) || child.manuallySet)) setTransition({ path, mode: "whole" });
    else whole(path);
  }

  function applyTransition(): void {
    if (!transition || busy) return;
    const target = transition;
    setTransition(null);
    whole(target.path);
  }

  function allocate(raw: number): void {
    if (busy) return;
    memory.normalQty = bounded(raw, parentQty);
    changeDecisions(allocateNormal(latest.current.decisions, memory.normalQty, parentQty));
    redraw((value) => value + 1);
  }

  function toggleExpanded(path: ReworkPath): void {
    if (busy) return;
    const pathKey = path.join("/");
    expanded[pathKey] = expanded[pathKey] === false;
    setScrollRequest({ path: (expanded[pathKey] ? [...path, 0] : path).join("/"), highlight: false });
    redraw((value) => value + 1);
  }

  return {
    nav, view, viewKey, expanded, scrollRequest, toggleExpanded,
    focusParent: (path: ReworkPath) => setScrollRequest({ path: path.join("/"), highlight: true }),
    normalQty: memory.normalQty, loading, loadError, childError, loadingPath,
    transition, setTransition, applyTransition, retry: () => setRetry((value) => value + 1),
    navigate, goBack, updateView, edit, requestSplit, requestWhole, allocate,
    retryChild: (path: ReworkPath) => { void split(path); },
  };
}
