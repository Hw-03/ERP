"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, GitBranch, RotateCcw } from "lucide-react";
import type { CostNode } from "@/lib/api/types/cost";
import { costNumber, CostStatusBadge } from "./CostSummaryCard";
import { CostTreeCanvas, type CostTreeCamera, type CostTreeView } from "./CostTreeCanvas";
import { useDeptColorLookup } from "../DepartmentsContext";
import { AppSelect } from "../common/AppSelect";
import { useDashboardNavigation, useDashboardSnapshot } from "../DashboardNavigation";
import { costAncestors, costDescendants, highlightedCostPaths, indexCostTree, initialCostBranches, nearestCostPath, type BranchState, type HighlightScope, type TreeEntry } from "./costTreeModel";
import { costProcessInfo, layoutCostTree, TREE_CARD_WIDTH, TREE_GAP, TREE_RAIL } from "./costTreeLayout";
import styles from "./CostCompactTree.module.css";
import { bridgeCostRoutes, costCardPorts, routeCostEdges, shareCostRoutes, type RoutedEdge, type RouteRequest } from "./costTreeRouting";

type Edge = { from: string; to: string; d: string; bundle?: string[] };
type Position = { left: number; top: number };
type Anchor = Position & { path: string };

/** New query items reset exploration; rate recalculations for the same item retain it. */
export function CostTree(props: { root: CostNode; toolbar?: ReactNode | ((exploration: ReactNode) => ReactNode); active?: boolean }): ReactElement {
  return <CompactTree key={props.root.item_id} {...props} />;
}

function CompactTree({ root, toolbar, active = true }: { root: CostNode; toolbar?: ReactNode | ((exploration: ReactNode) => ReactNode); active?: boolean }): ReactElement {
  const navigation = useDashboardNavigation();
  const getDeptColor = useDeptColorLookup();
  const index = useMemo(() => indexCostTree(root), [root]);
  const [focused, setFocused] = useState("root");
  const [selected, setSelected] = useState<string | null>(null);
  const [highlightScope, setHighlightScope] = useState<HighlightScope>("family");
  const [scopes, setScopes] = useState<Record<string, BranchState>>(() => ({ root: initialCostBranches(index, "root") }));
  const [details, setDetails] = useState<Set<string>>(() => new Set());
  const [edges, setEdges] = useState<Edge[]>([]);
  const [availableWidth, setAvailableWidth] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const camera = useRef<CostTreeCamera>(null);
  const positions = useRef(new Map<string, CostTreeView>());
  const pendingAnchor = useRef<Anchor | null>(null);
  const pendingFit = useRef(true);
  const restoreFrame = useRef(0);
  useDashboardSnapshot(`cost:tree:${root.item_id}`, () => ({ focused, selected, highlightScope, scopes, details, positions: new Map(positions.current), camera: camera.current?.getView() }), state => {
    cancelAnimationFrame(restoreFrame.current);
    pendingAnchor.current = null;
    setFocused(state.focused); setSelected(state.selected); setHighlightScope(state.highlightScope); setScopes(state.scopes); setDetails(state.details); positions.current = new Map(state.positions);
    if (state.camera) positions.current.set(state.focused, state.camera);
    pendingFit.current = false;
    restoreFrame.current = requestAnimationFrame(() => { if (state.camera) camera.current?.setView(state.camera); });
  });
  useEffect(() => () => cancelAnimationFrame(restoreFrame.current), []);
  const detailsId = useId();
  const focusPath = nearestCostPath(index, focused);
  const selectedPath = selected === null ? null : nearestCostPath(index, selected);
  const focus = index.get(focusPath)!;
  const selection = selectedPath ? index.get(selectedPath)! : null;
  const branches = useMemo(() => scopes[focusPath] ?? initialCostBranches(index, focusPath), [scopes, focusPath, index]);
  const highlighted = useMemo(() => highlightedCostPaths(index, selectedPath, highlightScope), [index, selectedPath, highlightScope]);
  const layout = useMemo(() => layoutCostTree(index, branches, focusPath, availableWidth), [index, branches, focusPath, availableWidth]);
  function departmentStyle(department: string | null): CSSProperties {
    return { "--branch-color": getDeptColor(department) } as CSSProperties;
  }
  const rememberAnchor = useCallback((path: string): void => {
    const frame = viewport.current;
    const element = [...(board.current?.querySelectorAll<HTMLElement>("[data-cost-path]") ?? [])].find(card => card.dataset.costPath === path);
    if (!frame || !element) return;
    const rect = element.getBoundingClientRect(), origin = frame.getBoundingClientRect();
    pendingAnchor.current = { path, left: rect.left - origin.left, top: rect.top - origin.top };
  }, []);

  useEffect(() => {
    setDetails(current => new Set([...current].filter(path => index.has(path))));
    setScopes(current => Object.fromEntries(Object.entries(current).filter(([path]) => index.has(path)).map(([path, state]) => [path, {
      expanded: new Set([...state.expanded].filter(entry => index.has(entry))),
      revealed: new Set([...state.revealed].filter(entry => index.has(entry))),
    }])));
    for (const path of positions.current.keys()) if (!index.has(path)) positions.current.delete(path);
  }, [index]);
  useEffect(() => {
    setFocused(current => nearestCostPath(index, current));
    setSelected(current => current === null ? null : nearestCostPath(index, current));
  }, [index]);

  useLayoutEffect(() => {
    const position = positions.current.get(focusPath);
    camera.current?.setView(position ?? { x: 0, y: 0, scale: 1 });
    pendingFit.current = !position;
    pendingAnchor.current = null;
  }, [focusPath]);

  const geometryKey = useRef("");
  const mountedAt = useRef<number | null>(null);
  const routeRuns = useRef(0);
  // Re-measure after width, visibility, text wrapping, expansion, or cost-detail changes.
  useEffect(() => {
    const element = board.current;
    if (!element || !active) return;
    mountedAt.current ??= performance.now();
    let scheduled = 0;
    function measure(): void {
      const container = element!;
      const frame = viewport.current;
      const origin = container.getBoundingClientRect();
      if (!origin.width || !frame?.clientWidth) return;
      // DOM bounds are already transformed; SVG paths must remain in unscaled BOM coordinates.
      const scale = origin.width / container.offsetWidth;
      const localRect = (target: Element): { left: number; top: number; width: number; bottom: number } => {
        const rect = target.getBoundingClientRect();
        return { left: Math.round((rect.left - origin.left) / scale), top: Math.round((rect.top - origin.top) / scale), width: Math.round(rect.width / scale), bottom: Math.round((rect.bottom - origin.top) / scale) };
      };
      const cards = new Map<string, HTMLElement>();
      container.querySelectorAll<HTMLElement>("[data-cost-path]").forEach(card => cards.set(card.dataset.costPath!, card));
      if (Math.abs(frame.clientWidth - availableWidth) > 1) {
        if (!pendingFit.current) rememberAnchor(focusPath);
        setAvailableWidth(frame.clientWidth);
        return;
      }
      const rects = new Map([...cards].map(([path,card]) => [path,localRect(card)]));
      const signature = JSON.stringify([focusPath,[...rects]]);
      if (signature === geometryKey.current && !pendingFit.current && !pendingAnchor.current) return;
      geometryKey.current = signature;
      const next: Edge[] = [];
      const requests: RouteRequest[] = [];
      const internal: RoutedEdge[] = [];
      const bundles = new Set<string>();
      cards.forEach((card, path) => {
        const parentPath = index.get(path)?.parent;
        const parent = parentPath && cards.get(parentPath);
        if (!parent || path === focusPath) return;
        const child = localRect(card), group = card.closest<HTMLElement>("[data-material-group]");
        if (group) {
          const key = group.dataset.materialGroup!, box = localRect(group);
          const x = box.left + 8, y = box.top - 16;
          if (!bundles.has(key)) {
            bundles.add(key);
            const source = localRect(parent);
            const firstColumnX = localRect(group.closest<HTMLElement>("[data-material-columns]")!).left + 8;
            const stemX = firstColumnX >= source.left + 8 && firstColumnX <= source.left + source.width - 8 ? firstColumnX : source.left + source.width / 2;
            requests.push({ from: parentPath!, to: path, bundle: [...group.querySelectorAll<HTMLElement>("[data-cost-path]")].map(entry => entry.dataset.costPath!), start: {x: stemX, y: source.bottom}, end: {x, y} });
          }
          const siblings = [...group.querySelectorAll<HTMLElement>("[data-cost-path]")];
          const position = siblings.indexOf(card);
          const previous = position > 0 ? localRect(siblings[position-1]) : null;
          const startY = previous ? (previous.top + previous.bottom) / 2 : y;
          const middle = (child.top + child.bottom) / 2;
          internal.push({ from: parentPath!, to: path, start:{x,y:startY}, end:{x,y:middle}, points:[{x,y:startY},{x,y:middle}], bundle: siblings.slice(position).map(entry => entry.dataset.costPath!), d: `M ${x} ${startY} V ${middle}` });
          internal.push({ from: parentPath!, to: path, start:{x,y:middle}, end:{x:child.left,y:middle}, points:[{x,y:middle},{x:child.left,y:middle}], d: `M ${x} ${middle} H ${child.left}` });
        } else {
          requests.push({ from: parentPath!, to: path, ...costCardPorts(localRect(parent), child) });
        }
      });
      const titles = [...container.querySelectorAll("h4,h5,[data-material-group] > header")].map(title => {
        const range = document.createRange();
        range.selectNodeContents(title);
        const rect = range.getBoundingClientRect();
        return { left: Math.round((rect.left-origin.left)/scale), top: Math.round((rect.top-origin.top)/scale), width: Math.round(rect.width/scale), bottom: Math.round((rect.bottom-origin.top)/scale) };
      });
      const obstacles = [...cards.values()].map(localRect).concat(titles);
      // Route downward branches first so the shared sideways parent bus can
      // use the clear space above a common F/A row.
      requests.sort((a,b)=>Number(Boolean(a.startSide))-Number(Boolean(b.startSide)));
      const routed = routeCostEdges(requests, obstacles, internal);
      container.dataset.costRouteRuns = String(++routeRuns.current);
      container.dataset.costBlockedRoutes = String(routed.filter(edge => edge.blocked).length);
      next.push(...bridgeCostRoutes(shareCostRoutes([...routed,...internal])));
      setEdges(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      container.dataset.costLayoutMs = String(Math.round(performance.now() - mountedAt.current!));
      if (pendingFit.current) {
        camera.current?.fit(true);
        pendingFit.current = false;
      } else if (pendingAnchor.current) {
        const anchor = pendingAnchor.current;
        const target = cards.get(anchor.path)?.getBoundingClientRect(), frameRect = frame.getBoundingClientRect();
        const current = camera.current?.getView();
        if (target && current) camera.current?.setView({ ...current, x: current.x + anchor.left - (target.left - frameRect.left), y: current.y + anchor.top - (target.top - frameRect.top) });
        pendingAnchor.current = null;
      }
    }
    scheduled = requestAnimationFrame(measure);
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(scheduled);
      scheduled = requestAnimationFrame(measure);
    });
    observer.observe(element);
    if (viewport.current) observer.observe(viewport.current);
    element.querySelectorAll("[data-cost-path]").forEach(card => observer.observe(card));
    return () => { observer.disconnect(); cancelAnimationFrame(scheduled); };
  }, [active, index, focusPath, layout, details, availableWidth, rememberAnchor]);

  function updateBranches(update: (current: BranchState) => BranchState): void {
    setScopes(current => ({ ...current, [focusPath]: update(current[focusPath] ?? initialCostBranches(index, focusPath)) }));
  }
  function toggleBranch(path: string): void {
    rememberAnchor(path);
    updateBranches(current => { const expanded = new Set(current.expanded); if (expanded.has(path)) expanded.delete(path); else expanded.add(path); return { ...current, expanded }; });
  }
  /** User scope changes create entries; snapshot restoration bypasses this function. */
  function enter(path: string): void {
    if (!active || path === focusPath) return;
    const change = (): void => applyScope(path);
    if (navigation) navigation.commit(change);
    else change();
  }
  function applyScope(path: string): void {
    cancelAnimationFrame(restoreFrame.current);
    if (camera.current) positions.current.set(focusPath, camera.current.getView());
    setScopes(current => current[path] ? current : { ...current, [path]: initialCostBranches(index, path) });
    setSelected(path === "root" ? null : path);
    setFocused(path);
    viewport.current?.focus({ preventScroll: true });
  }
  function overview(): void {
    const reset = (): void => {
      cancelAnimationFrame(restoreFrame.current);
      pendingFit.current = true; pendingAnchor.current = null;
      positions.current.clear();
      setScopes({ root: initialCostBranches(index, "root") });
      setFocused("root"); setSelected(null); setDetails(new Set());
    };
    if (focusPath !== "root" && navigation) navigation.commit(reset);
    else reset();
  }
  function expandScope(open: boolean): void {
    rememberAnchor(focusPath);
    const paths = costDescendants(index, focusPath).filter(entry => entry.children.length).map(entry => entry.path);
    updateBranches(() => ({ expanded: new Set(open ? paths : []), revealed: new Set(open ? paths : []) }));
  }
  function card(entry: TreeEntry, hero = false, part = false): ReactElement {
    const { node, path, depth } = entry;
    const process = costProcessInfo(node.mes_code);
    const open = branches.expanded.has(path), detail = details.has(path), chosen = selectedPath === path;
    const state = !selectedPath ? "none" : chosen ? "selected" : highlighted.has(path) ? "related" : "dim";
    const panelId = `${detailsId}-${path}-details`;
    return <article key={path} title={costAncestors(index, path).map(parent => parent.node.item_name).join(" → ")} data-cost-path={path} data-cost-depth={depth} data-cost-kind={part ? "part" : "assembly"} data-highlight={state} data-hero={hero} className={`${styles.card} ${part ? styles.partRow : ""}`} style={departmentStyle(process.department)}>
      <button type="button" className={styles.pick} aria-label={`${node.item_name} 계통 선택`} aria-pressed={chosen} onClick={() => setSelected(current => current === path ? null : path)}>
        <span className={styles.name}>{node.item_name}</span>
        <span className={styles.cardMeta}>{node.mes_code}</span>
      </button>
      {node.status !== "complete" && <div className={styles.badge}><CostStatusBadge status={node.status} issues={node.issues} /></div>}
      {detail && <dl id={panelId} className={styles.costDetails}>
        <div><dt>개당 원가</dt><dd>{costNumber(node.unit_cost)}{node.unit_cost !== null && " 원"}</dd></div>
        <div><dt title="이 단계 1개당 인건비 (개당 원가에 포함)">단계 인건비</dt><dd>{node.own_labor_cost === null ? "미등록" : /^0(?:\.0+)?$/.test(node.own_labor_cost) ? "—" : `${costNumber(node.own_labor_cost)} 원`}</dd></div>
        <div><dt>소요량</dt><dd>{BigInt(node.required_quantity).toLocaleString("ko-KR")}</dd></div>
      </dl>}
      <div className={styles.nodeActions}>
        <button type="button" className={styles.costToggle} title={node.status === "partial" ? "부분 비용 · 비용 상세" : "비용 상세"} aria-label={`${node.item_name} 비용 상세 ${detail ? "접기" : "펼치기"}`} aria-expanded={detail} aria-controls={detail ? panelId : undefined} onClick={() => { rememberAnchor(path); setDetails(current => { const next = new Set(current); if (next.has(path)) next.delete(path); else next.add(path); return next; }); }}>
          {detail ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<strong>{costNumber(node.amount)}{node.amount !== null && <span> 원</span>}</strong>
        </button>
        {entry.children.length > 0 && <button type="button" title={`하위 품목 ${entry.children.length}개`} aria-label={`${node.item_name} 하위 품목 ${open ? "접기" : "펼치기"}`} aria-expanded={open} onClick={() => toggleBranch(path)}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<span>{entry.children.length}</span></button>}
      </div>
    </article>;
  }
  const boardStyle = {
    "--tree-card-width": `${TREE_CARD_WIDTH}px`, "--tree-gap": `${TREE_GAP}px`,
    "--tree-gutter": `${layout.gutter}px`,
    width: layout.width, paddingLeft: layout.gutter, paddingRight: TREE_RAIL,
  } as CSSProperties;
  const exploration = <div role="group" aria-label="가계도 계통 탐색" className={`${styles.controls} ${styles.explorationControls}`}>
    <AppSelect value={highlightScope} onChange={value => setHighlightScope(value as HighlightScope)} size="sm" className="w-40" triggerAriaLabel="강조할 품목 범위" options={[{ value: "family", label: "상하위 품목" }, { value: "down", label: "하위 품목" }, { value: "up", label: "상위 품목" }, { value: "direct", label: "직속 상하위 품목" }]} />
    <button type="button" className={styles.focusButton} disabled={!selection || selectedPath === focusPath} onClick={() => selectedPath && enter(selectedPath)}><GitBranch size={15} />집중 탐색</button>
  </div>;
  const controls = <>
    <div role="group" aria-label="가계도 펼침 조절" className={styles.expandControls}><button type="button" onClick={() => expandScope(true)}>모두 펼치기</button><button type="button" onClick={() => expandScope(false)}>모두 접기</button></div>
    <button type="button" className={styles.overview} title="모두 펼치고 맨 위에서 시작하기" onClick={overview}><RotateCcw size={15} />처음 보기</button>
  </>;
  const context = focusPath !== "root" && <nav aria-label="집중 탐색 위치" className={styles.ancestry}>
    <button type="button" aria-label="전체 트리로 복귀" className={styles.returnButton} onClick={() => enter("root")}><ArrowLeft size={15} />전체 트리</button>
    {costAncestors(index, focusPath).map(entry => <span key={entry.path}><ChevronRight size={12} /><button type="button" onClick={() => enter(entry.path)} aria-current={entry.path === focusPath ? "location" : undefined}>{entry.node.item_name}</button></span>)}
  </nav>;
  return <div className={styles.host} onKeyDown={event => { if (active && event.key === "Escape" && selectedPath) { event.preventDefault(); event.stopPropagation(); setSelected(null); } }}>
    <CostTreeCanvas toolbar={typeof toolbar === "function" ? toolbar(exploration) : <>{toolbar}{exploration}</>} branchControls={controls} context={context} viewportRef={viewport} cameraRef={camera} onClear={() => setSelected(null)}>
      <div ref={board} className={styles.board} style={boardStyle}>
        <svg aria-hidden="true" className={styles.links}>{[...edges].sort((a, b) => Number(highlighted.has(a.from) && (a.bundle ?? [a.to]).some(path => highlighted.has(path))) - Number(highlighted.has(b.from) && (b.bundle ?? [b.to]).some(path => highlighted.has(path)))).map(edge => <path key={`${edge.bundle ? "bundle:" : ""}${edge.to}:${edge.d}`} data-from={edge.from} data-to={edge.bundle ? undefined : edge.to} data-cost-bundle={edge.bundle ? edge.to : undefined} d={edge.d} style={departmentStyle(costProcessInfo(index.get(edge.to)!.node.mes_code).department)} data-highlight={!selectedPath ? "none" : highlighted.has(edge.from) && (edge.bundle ?? [edge.to]).some(path => highlighted.has(path)) ? "related" : "dim"} />)}</svg>
        {layout.strips.map(strip => <div key={strip[0].name ?? "other"} data-department-strip={strip.some(dept => dept.name === "튜닝" || dept.name === "진공" || dept.name === "고압" || dept.name === "튜브") ? "processes" : "single"} className={styles.departmentStrip} style={{ "--strip-start-color": getDeptColor(strip[0].name), "--strip-end-color": getDeptColor(strip.at(-1)!.name) } as CSSProperties}>
          {strip.map(dept => <section key={dept.name ?? "other"} data-department={dept.name ?? "기타"} className={styles.department} style={departmentStyle(dept.name)}>
          <h4 className={styles.departmentHeading}>{dept.name ?? "기타"}</h4>
          {dept.rows.map(row => <div key={row[0].code} data-department-row data-process-tier={row.every(band => band.code.endsWith("R")) ? "raw" : "fa"} className={styles.departmentRow}>
            {row.map(band => <section key={band.code} data-process-band={band.code || "other"} className={styles.processBand} style={{ width: band.width }}>
              <h5 className={styles.processHeading}>{band.stage || "품목"}<span>{band.code}</span></h5>
              {band.rows.map(units => <div key={units[0].key} data-cost-row className={styles.processRow}>{units.map(unit => unit.material ?
                <div key={unit.key} data-material-columns data-material-parent={unit.parent!.path} className={styles.materialColumns} style={{width:unit.width, marginLeft:unit.offset ?? 0}}>
                  {(unit.columns ?? [unit.entries]).map((entries, column) => <div key={entries[0].path} data-material-group={`${unit.key}:${column}`} aria-label={`${unit.parent!.node.mes_code}${column ? " 계속" : ""}`} title={column ? `${unit.parent!.node.mes_code} · 계속` : undefined} className={styles.materialGroup}>
                    <div className={styles.materialItems}>{entries.map(entry => card(entry, false, true))}</div>
                  </div>)}
                </div> : <div key={unit.key} style={{width:unit.width, marginLeft:unit.offset ?? 0}}>{card(unit.entries[0], unit.hero, unit.entries[0].children.length === 0 && !unit.hero)}</div>)}</div>)}
            </section>)}
          </div>)}
          </section>)}
        </div>)}
        {focus.children.length === 0 && <p className={styles.empty}>이 품목은 더 내려갈 하위 구성이 없습니다.</p>}
      </div>
    </CostTreeCanvas>
  </div>;
}
