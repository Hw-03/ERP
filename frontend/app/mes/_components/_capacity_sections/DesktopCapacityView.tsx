"use client";

import { useDashboardNavigation, useDashboardSnapshot } from "../DashboardNavigation";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, CornerDownRight, Info, Search } from "lucide-react";
import type { ProductionCapacity, ProductionCapacityPfVariant } from "@/lib/api/types/production";
import { groupAfByModel, getAutoRepresentative } from "@/lib/mes/capacity";
import { formatQty } from "@/lib/mes/format";
import { DesktopCapacityPfWorkspace } from "./DesktopCapacityPfWorkspace";
import styles from "./DesktopCapacityView.module.css";
import { CapacityModelKpis } from "../DashboardModelKpis";
import scrollStyles from "../DashboardOverviewScroll.module.css";

const BUTTON = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold hover:bg-[var(--c-s2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]";
const HISTORY_KEY = "desktopCapacitySelection";
const HELP = ["박스 포장까지 완료된 정상 출하품 재고입니다. 재고 요청 예약은 제외하고 활성 출하 예약은 포함합니다.", "현재 조립 완제품과 포장 자재의 가용 재고로 추가 포장할 수 있는 수량입니다.", "현재 출하품 재고와 전체 BOM의 가용 재고를 고려한 이론상 최대 수량입니다. 생산 등록을 보장하지 않습니다."];
const keyOf = (variant: ProductionCapacityPfVariant): string => JSON.stringify([variant.af_item_id, variant.pf_item_id]);

/** Keep the capacity catalogue and its AF-specific selection alive across dashboard views. */
export function DesktopCapacityView({ capacityData, loading = false, error, onRetry, active, refreshKey = 0 }: {
  capacityData?: ProductionCapacity | null; loading?: boolean; error?: string | null; onRetry?: () => void; active: boolean; refreshKey?: number;
}) {
  const navigation = useDashboardNavigation();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchExpanded, setSearchExpanded] = useState<Set<string> | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const viewport = useRef<HTMLDivElement>(null);
  const overviewViewport = useRef<HTMLDivElement>(null);
  const scroll = useRef({ overview: 0, detail: 0 });
  const lastButton = useRef<HTMLButtonElement | null>(null);
  const af = capacityData?.af;
  const groups = useMemo(() => groupAfByModel(af?.items ?? []), [af]);
  const selected = af?.pf_variants.find(v => keyOf(v) === selection) ?? null;
  const detail = selected !== null;
  const query = search.trim().toLowerCase();
  const matches = (...values: (string | null | undefined)[]): boolean => values.some(value => value?.toLowerCase().includes(query));
  const variantsFor = (id: string): ProductionCapacityPfVariant[] => af?.pf_variants.filter(v => v.af_item_id === id) ?? [];
  const shown = groups.map(group => {
    const wholeGroup = !query || matches(group.label);
    return { ...group, items: group.items.flatMap(item => {
      const variants = variantsFor(item.af_item_id);
      const wholeItem = wholeGroup || matches(item.af_name, item.af_code);
      const filtered = wholeItem ? variants : variants.filter(v => matches(v.pf_name, v.pf_code));
      return wholeItem || filtered.length ? [{ ...item, variants: filtered }] : [];
    }) };
  }).filter(group => group.items.length);
  const openIds = query ? searchExpanded ?? new Set(shown.flatMap(g => [g.key, ...g.items.map(i => i.af_item_id)])) : expanded;
  const open = (id: string): boolean => openIds.has(id);
  const setOpenIds = (ids: Set<string>): void => { if (query) setSearchExpanded(ids); else setExpanded(ids); };
  const toggle = (id: string): void => { const next = new Set(openIds); if (next.has(id)) next.delete(id); else next.add(id); setOpenIds(next); };
  const saveScroll = (): void => { const node = detail ? viewport.current : overviewViewport.current; if (node) scroll.current[detail ? "detail" : "overview"] = node.scrollTop; };
  const returnToOverview = (): void => {
    if (navigation) { navigation.commit(() => setSelection(null)); return; }
    saveScroll();
    setSelection(null);
    if (window.history.state?.[HISTORY_KEY]) window.history.back();
  };
  const select = (variant: ProductionCapacityPfVariant, button: HTMLButtonElement): void => {
    const next = keyOf(variant);
    lastButton.current = button;
    setExpanded(current => new Set([...current, variant.model_symbol ?? "미분류", variant.af_item_id ?? ""]));
    if (selection === next) { returnToOverview(); return; }
    saveScroll();
    if (navigation) { navigation.commit(() => { setSelection(next); setNotice(""); }, Boolean(selection)); return; }
    const state = { ...window.history.state, [HISTORY_KEY]: next };
    if (selection) window.history.replaceState(state, "");
    else window.history.pushState(state, "");
    setSelection(next);
    setNotice("");
  };
  useDashboardSnapshot("capacity:main", () => { saveScroll(); return { search, expanded, searchExpanded, selection, scroll: { ...scroll.current } }; }, state => {
    setSearch(state.search); setExpanded(state.expanded); setSearchExpanded(state.searchExpanded); setSelection(state.selection); scroll.current = state.scroll;
    requestAnimationFrame(() => { const node = state.selection ? viewport.current : overviewViewport.current; if (node) node.scrollTop = state.scroll[state.selection ? "detail" : "overview"]; });
  }, { isHome: !detail, home: () => { saveScroll(); setSelection(null); scroll.current.overview = 0; if (overviewViewport.current) overviewViewport.current.scrollTop = 0; } });
  useLayoutEffect(() => {
    const node = detail ? viewport.current : overviewViewport.current;
    if (node) node.scrollTop = scroll.current[detail ? "detail" : "overview"];
    if (!detail) lastButton.current?.focus({ preventScroll: true });
  }, [detail]);
  useEffect(() => {
    if (!active) return;
    const pop = (event: PopStateEvent): void => {
      const key: unknown = event.state?.[HISTORY_KEY];
      setSelection(typeof key === "string" ? key : null);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && selection && !event.defaultPrevented) { event.preventDefault(); returnToOverview(); }
    };
    if (!navigation) window.addEventListener("popstate", pop); window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("popstate", pop); window.removeEventListener("keydown", escape); };
    // The listeners read the current selection and scroll mode only while visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, selection]);
  useEffect(() => {
    if (af && selection && !selected) {
      setSelection(null); setNotice("선택한 출하 경로가 변경되어 모델별 비교로 돌아왔습니다.");
      window.history.replaceState({ ...window.history.state, [HISTORY_KEY]: null }, "");
    }
  }, [af, selection, selected]);

  return <div className={scrollStyles.root}><div ref={overviewViewport} data-testid="capacity-overview-scroll" data-overview={!detail} onScroll={saveScroll} className={`sg ${scrollStyles.viewport} ${!detail ? styles.overview : ""}`}><div className={scrollStyles.content}>
    {!detail && <CapacityModelKpis capacityData={capacityData} capacityLoading={loading} capacityError={error} onCapacityRetry={onRetry} onOpen={select} />}
    <section aria-label="생산 가능" className={`${styles.surface} flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-[24px] border`} data-detail={detail} style={{ borderColor: "var(--c-border)", background: "var(--c-s1)" }}>
    <aside aria-label="생산 제품 탐색" className={`${styles.navigation} flex min-h-0 min-w-0 flex-col`} hidden={detail}>
      <div className={`${styles.search} flex items-center gap-2 border-b px-4`} style={{ borderColor: "var(--c-border)" }}>
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3" style={{ borderColor: "var(--c-border)", background: "var(--c-s2)", color: "var(--c-muted2)" }}><Search size={16} /><input aria-label="생산 제품 검색" placeholder="모델 · 품명 · 품목코드" value={search} onChange={event => { setSearch(event.target.value); setSearchExpanded(null); }} className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-blue)]" /></label>
        {!detail && <div className="flex shrink-0 gap-2"><button className={`${BUTTON} ${styles.expandButton}`} aria-label="목록 모두 펼치기" onClick={() => setOpenIds(new Set(groups.flatMap(g => [g.key, ...g.items.map(i => i.af_item_id)])))}>모두 펼치기</button><button className={`${BUTTON} ${styles.expandButton}`} aria-label="목록 모두 접기" onClick={() => setOpenIds(new Set())}>모두 접기</button></div>}
      </div>
      {notice && <p role="status" className="px-4 py-2 text-sm">{notice}</p>}
      <div className={styles.scrollShell}>
      <div ref={viewport} className={`sg ${styles.viewport}`} onScroll={saveScroll}>
        {loading && !capacityData ? <p role="status" className="p-6 text-sm">생산 가능 수량을 불러오는 중입니다.</p> : !af || !groups.length ? !error && <p className="p-6 text-sm">{capacityData ? "표시할 생산 가능 대상이 없습니다." : "생산 가능 데이터를 확인해 주세요."}</p> : <table aria-label={detail ? "생산 제품 탐색 목록" : "모델별 생산 가능수량"} className={`${styles.table} w-full table-fixed border-collapse text-sm`}>
          <colgroup><col /><col className={styles.code} /><col className={styles.quantity} /><col className={styles.quantity} /><col className={styles.quantity} /></colgroup>
          <thead><tr><th><div className={styles.columnHeading}><span>모델·품목</span><span className={styles.guide} title="공용 자재가 겹치므로 모델별 표시 수량을 모두 동시에 생산할 수 없습니다. 각 모델 수량은 계산 기준 제품 한 개의 값입니다."><Info size={16} aria-hidden="true" />모델별 독립 계산 · 동시 생산 합계 아님</span></div></th><th className={styles.metadata}>품목코드</th>{["출하 대기", "빠른 생산", "총생산"].map((label, index) => <th key={label} className={styles.metadata} title={HELP[index]}><span className={styles.headingLabel}>{label}<Info size={14} /></span></th>)}</tr></thead>
          <tbody>{shown.map(group => {
            const representative = af && getAutoRepresentative(group.key, af);
            const quantities = (value: Pick<ProductionCapacityPfVariant, "ship_ready" | "fast_production" | "total_production"> | null): React.ReactNode => ["ship_ready", "fast_production", "total_production"].map((field, index) => <td key={field} className={`${styles.metadata} font-bold tabular-nums`} style={{ color: value && value[field as keyof typeof value] > 0 ? ["var(--c-cyan)", "var(--c-blue)", "var(--c-purple)"][index] : "var(--c-muted2)" }}>{value ? formatQty(value[field as keyof typeof value]) : "—"}</td>);
            return <Fragment key={group.key}>
              <tr className={styles.model} onClick={() => toggle(group.key)}><td><button aria-expanded={open(group.key)} className={styles.rowButton} onClick={event => { event.stopPropagation(); toggle(group.key); }}>{open(group.key) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<span className="min-w-0"><span className="font-bold" style={{ color: "var(--c-blue)" }}>{group.label}</span><span className="ml-3 text-xs" style={{ color: "var(--c-muted2)" }}>모델 종류 {group.items.length}종</span>{!detail && <span className="mt-1 block truncate text-xs font-normal" title={representative?.pf_name ?? undefined}>계산 기준 제품 · {representative?.pf_name || "출하 경로 없음"}</span>}</span></button></td><td className={styles.metadata}>{representative?.pf_code ?? "—"}</td>{quantities(representative)}</tr>
              {open(group.key) && group.items.map(item => <Fragment key={item.af_item_id}>
                <tr className={styles.assembly} onClick={() => toggle(item.af_item_id)}><td><button aria-expanded={open(item.af_item_id)} className={styles.rowButton} onClick={event => { event.stopPropagation(); toggle(item.af_item_id); }}>
                  {open(item.af_item_id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<span className="min-w-0"><span className={styles.nameLine}><span className={styles.name} title={item.af_name}>{item.af_name}</span><span className={styles.kind}>조립</span></span><span className="block text-xs" style={{ color: "var(--c-yellow)" }}>{item.bom_status === "incomplete" ? "BOM 미등록" : !item.has_pf_path ? "출하 경로 없음" : ""}</span>{detail && <span className={styles.smallCode}>{item.af_code}</span>}</span></button></td><td className={styles.metadata}>{item.af_code}</td>{quantities(item)}</tr>
                {open(item.af_item_id) && item.variants.map(variant => <tr key={keyOf(variant)} data-selected={selection === keyOf(variant)} className={styles.product} onClick={event => { const button = event.currentTarget.querySelector("button"); if (button) select(variant, button); }}><td><button className={styles.rowButton} aria-pressed={selection === keyOf(variant)} aria-label={`${variant.pf_name} ${variant.pf_code} ${item.af_name} BOM 보기`} onClick={event => { event.stopPropagation(); select(variant, event.currentTarget); }}><CornerDownRight size={16} aria-hidden="true" className={styles.branch} /><span className="min-w-0"><span className={styles.nameLine}><span className={styles.name} title={variant.pf_name}>{variant.pf_name}</span><span className={styles.kind}>출하</span></span>{detail && <span className={styles.smallCode}>{variant.pf_code}</span>}</span></button></td><td className={styles.metadata}>{variant.pf_code}</td>{quantities(variant)}</tr>)}
              </Fragment>)}
            </Fragment>;
          })}</tbody>
        </table>}
        {!!query && af && groups.length > 0 && !shown.length && <p className="p-6 text-sm">검색 결과가 없습니다.</p>}
      </div>
      </div>
    </aside>
    {selected && <main className={`${styles.detail} flex min-h-0 min-w-0 flex-1 flex-col`}>
      {error && <div role="alert" className="flex shrink-0 items-center gap-2 px-4 py-3 text-sm" style={{ color: "var(--c-red)" }}>{capacityData ? "최신 수량을 갱신하지 못했습니다." : error}<button className={BUTTON} onClick={onRetry}>다시 시도</button></div>}
      <DesktopCapacityPfWorkspace key={keyOf(selected)} variant={selected} assemblyName={af?.items.find(item => item.af_item_id === selected.af_item_id)?.af_name} onBack={returnToOverview} onClose={returnToOverview} embedded refreshKey={refreshKey} />
    </main>}
  </section></div></div></div>;
}
