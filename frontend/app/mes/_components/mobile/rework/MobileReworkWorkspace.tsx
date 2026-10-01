"use client";

import { useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { ChevronDown, ChevronUp, Layers, Search } from "lucide-react";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { formatQty } from "@/lib/mes/format";
import { QuantityInput } from "../../common/QuantityInput";
import { SkeletonBlock } from "../../common/LoadingSkeleton";
import { MobileDefectStepHeader } from "../screens/MobileDefectStepHeader";
import { PrimaryActionButton } from "../primitives";
import scrollStyles from "../primitives/MobileScrollFrame.module.css";
import panelStyles from "../screens/mobileWarehousePanels.module.css";
import { activeRows, effectiveRows, hasChanges, isSplit, setPart, visibleRows, type MobileReworkDecision, type ReworkRow } from "./mobileReworkModel";
import { useMobileReworkWorkspace, type MobileReworkMemory } from "./useMobileReworkWorkspace";
import styles from "./MobileReworkWorkspace.module.css";

interface Props {
  sessionId: string;
  parentItemId: string;
  parentItemName: string;
  parentMesCode: string;
  parentQty: number;
  parentUnit?: string;
  reason: string;
  decisions: MobileReworkDecision[];
  onChange: (next: MobileReworkDecision[]) => void;
  sessionRef: MutableRefObject<MobileReworkMemory | null>;
  onBack: () => void;
  onConfirm: () => void;
  canSubmit: boolean;
  busy?: boolean;
  error?: string | null;
  context?: string;
  steps: readonly string[];
  current: number;
}

const qty = (value: number): string => formatQty(value, { maximumFractionDigits: 4, trimTrailingZeros: true });

/** 두 모바일 진입점의 실제 제출 결정을 같은 목록에서 직접 편집한다. */
export function MobileReworkWorkspace(props: Props) {
  const { parentItemName, parentMesCode, parentQty, parentUnit = "EA", reason, decisions, busy = false, canSubmit, onConfirm, error, context = "재작업", steps, current } = props;
  const work = useMobileReworkWorkspace({ ...props, busy });
  const { nav, view } = work;
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const targetRef = useRef<HTMLElement>(null);
  const [focused, setFocused] = useState<{ view: string; path: string } | null>(null);
  const result = effectiveRows(decisions);
  const rows = nav.review ? result : activeRows(decisions);
  const shown = visibleRows(rows, nav.review ? {} : work.expanded, view.search, view.changedOnly, focused?.view === work.viewKey ? focused.path : undefined);
  const shownParents = new Set(shown.map(({ path }) => path.slice(0, -1).join("/")));
  const pending = busy || work.loading || work.loadingPath !== null;
  const changedCount = rows.filter(({ node }) => hasChanges(node)).length;

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = view.scrollTop;
    // 수량·메모 입력은 현재 목록의 스크롤을 바꾸지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [work.viewKey]);

  useLayoutEffect(() => {
    const viewport = scrollRef.current;
    const request = work.scrollRequest;
    if (!viewport || !request) return;
    const element = request.path ? rowRefs.current.get(request.path) : targetRef.current;
    if (!element) return;
    const bounds = viewport.getBoundingClientRect();
    const rowBounds = element.getBoundingClientRect();
    // 긴 입력 행은 선두만 보여주고 바깥 화면과 탭바는 움직이지 않는다.
    if (rowBounds.top < bounds.top || rowBounds.top + Math.min(rowBounds.height, 100) > bounds.bottom) viewport.scrollTop += rowBounds.top - bounds.top;
    if (!request.highlight) return;
    element.classList.add(styles.highlight);
    const timer = window.setTimeout(() => element.classList.remove(styles.highlight), 1200);
    return () => { window.clearTimeout(timer); element.classList.remove(styles.highlight); };
  }, [work.scrollRequest]);

  return (
    <div className={styles.workspace} data-testid="mobile-rework-workspace">
      <MobileDefectStepHeader context={context} title={nav.review ? "처리 결과" : "구성품 처리"} steps={steps} current={current} onBack={work.goBack} />
      <div className={styles.frame}>
        <div ref={scrollRef} className={scrollStyles.viewport} onScroll={(event) => work.updateView({ scrollTop: event.currentTarget.scrollTop })} data-testid="rework-scroll">
          <div className={styles.content}>
            <section ref={targetRef} className={styles.target} aria-label="재작업 대상">
              <div className={styles.targetHeading}><h3>{parentItemName}</h3><span>{qty(parentQty)} {parentUnit}</span></div>
              <div className={styles.meta}><span>{parentMesCode}</span>{reason && <span>사유 · {reason}</span>}</div>
            </section>

            {!nav.review && <div className={styles.allocation}>
              <label><span>기본 정상 수량</span><QuantityInput aria-label="기본 정상 수량" inputMode="decimal" min={0} max={parentQty} step="any" value={work.normalQty} disabled={pending || !decisions.length} onChange={(event) => work.allocate(Number(event.target.value))} /><span>/ {qty(parentQty)} {parentUnit}</span></label>
              <p>나머지는 격리 · 개별 수정한 품목은 유지</p>
            </div>}
            <label className={styles.search}><Search size={18} /><input type="search" aria-label="조회된 구성품 검색" placeholder="품목명 · 코드 · 입고 부서" value={view.search} onChange={(event) => work.updateView({ search: event.target.value })} /></label>
            <div className={styles.filters} aria-label="구성품 필터">
              <button type="button" aria-pressed={!view.changedOnly} onClick={() => work.updateView({ changedOnly: false })}>전체 <span>{rows.length}</span></button>
              <button type="button" aria-pressed={view.changedOnly} onClick={() => work.updateView({ changedOnly: true })}>처리 변경 <span>{changedCount}</span></button>
            </div>
            {!nav.review && (view.search.trim() || view.changedOnly) && <p className={styles.meta}>조회된 구성에서 일치 품목과 상위를 펼쳐 표시합니다.</p>}

            {work.loading ? <div className={styles.list} role="status" aria-label="구성품 불러오는 중">{[0, 1, 2].map((index) => <div className={styles.skeleton} key={index}><SkeletonBlock className="h-4 w-4/5" /><SkeletonBlock className="mt-3 h-3 w-3/5" /><SkeletonBlock className="mt-3 h-10 w-full" /></div>)}</div>
              : work.loadError ? <div className={styles.empty} role="alert"><p>{work.loadError}</p><button type="button" onClick={work.retry}>다시 시도</button></div>
                : shown.length === 0 ? <div className={styles.empty}>{rows.length === 0 ? "처리할 구성품이 없습니다." : "조건에 맞는 구성품이 없습니다."}</div>
                  : <div className={styles.list}>{shown.map((row) => <div
                    key={row.path.join("/")} className={styles.row} role="group" aria-label={`${row.node.item_name} 처리`}
                    ref={(element) => { if (element) rowRefs.current.set(row.path.join("/"), element); else rowRefs.current.delete(row.path.join("/")); }}
                    data-level={(row.path.length - 1) % 4} data-path={row.path.join("/")}
                    data-testid={nav.review ? "rework-result-row" : "rework-item-row"}
                    onFocusCapture={() => setFocused({ view: work.viewKey, path: row.path.join("/") })}
                    onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(null); }}
                  >
                    {nav.review && <p className={styles.path}>{[parentItemName, ...row.ancestors.map((ancestor) => ancestor.item_name)].join(" › ")} <span>· {row.path.map((index) => index + 1).join(".")}</span></p>}
                    {!nav.review && <div className={styles.hierarchy}><span>{row.path.length}단계</span><button type="button" disabled={busy} onClick={() => work.focusParent(row.path.slice(0, -1))}>상위 · {row.ancestors.at(-1)?.mes_code || row.ancestors.at(-1)?.item_name || parentMesCode || parentItemName}</button></div>}
                    <InlineDecision row={row} work={work} pending={pending} expanded={shownParents.has(row.path.join("/"))} />
                  </div>)}</div>}
            {error && <p role="alert" className={styles.error}>{error}</p>}
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <PrimaryActionButton intent="primary" disabled={pending || !canSubmit || result.length === 0} label={busy ? "처리 중..." : nav.review ? "재작업 실행 확인 →" : "처리 결과 확인 →"} onClick={() => nav.review ? onConfirm() : work.navigate({ path: nav.path, review: true })} />
      </div>

      <ConfirmModal open={work.transition !== null} className={panelStyles.touchScope} title="이 품목을 통째로 처리할까요?" confirmLabel="통째 처리 적용" onClose={() => work.setTransition(null)} onConfirm={work.applyTransition} busy={busy}>
        하위 입력은 보관되며 이번 처리에서 제외됩니다. 다시 하위 처리로 전환하면 복원됩니다.
      </ConfirmModal>
    </div>
  );
}

/** 행의 경로를 기준으로 입력하므로 같은 품목이 여러 구성에 있어도 값이 섞이지 않는다. */
function InlineDecision({ row: { node, path }, work, pending, expanded }: { row: ReworkRow; work: ReturnType<typeof useMobileReworkWorkspace>; pending: boolean; expanded: boolean }) {
  const pathKey = path.join("/");
  const split = isSplit(node);
  const error = work.childError?.path === pathKey ? work.childError.message : null;


  return <>
    <div className={styles.rowMain}><strong>{node.item_name}</strong><span className={styles.total}><b>{qty(node.qty)}</b> <span>{node.unit || "EA"}</span></span></div>
    <div className={styles.meta}><span>{node.mes_code || "코드 없음"}</span><span>입고 · {node.department || "미지정"}</span></div>
    {split ? <>
      <div className={styles.splitSummary}><Layers size={16} /><span>하위 {effectiveRows(node.children!).length}품목 처리 중{!expanded && ` · 숨겨진 처리 변경 ${activeRows(node.children!).filter(({ node: child }) => hasChanges(child)).length}건`}</span></div>
      <div className={styles.branchActions}>
        <button type="button" disabled={pending || Boolean(work.view.search.trim()) || work.view.changedOnly} aria-expanded={expanded} onClick={() => work.toggleExpanded(path)}>{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}{expanded ? "하위 접기" : "하위 펼치기"}</button>
        <button type="button" disabled={pending} onClick={() => work.requestWhole(path)}>통째 처리로 변경</button>
      </div>
    </> : <>
      <div className={styles.quantityFields}>
        <label><span>정상</span><QuantityInput aria-label="정상 수량" inputMode="decimal" min={0} max={node.qty} step="any" value={node.normal_qty} disabled={pending} onChange={(event) => work.edit(path, (current) => setPart(current, "normal_qty", Number(event.target.value)))} /></label>
        <label><span>격리</span><QuantityInput aria-label="격리 수량" inputMode="decimal" min={0} max={node.qty} step="any" value={node.defective_qty} disabled={pending} onChange={(event) => work.edit(path, (current) => setPart(current, "defective_qty", Number(event.target.value)))} /></label>
        <label><span>폐기</span><QuantityInput aria-label="폐기 수량" inputMode="decimal" min={0} max={node.qty} step="any" value={node.scrap_qty} disabled={pending} onChange={(event) => work.edit(path, (current) => setPart(current, "scrap_qty", Number(event.target.value)))} /></label>
      </div>
    </>}
    {!split && <InlineMemo value={node.reason_memo} disabled={pending} onChange={(value) => work.edit(path, (current) => ({ ...current, reason_memo: value, manuallySet: true }))} />}
    {error && <div role="alert" className={styles.error}>{error}<button type="button" disabled={pending} onClick={() => work.retryChild(path)}>다시 시도</button></div>}
    {node.has_bom && !split && <button type="button" className={styles.drillButton} disabled={pending || path.length >= 10} onClick={() => work.requestSplit(path)}><Layers size={16} /><span>{work.loadingPath === pathKey ? "구성품 불러오는 중..." : "하위 펼쳐 처리"}</span></button>}
    {node.has_bom && path.length >= 10 && <p className={styles.meta}>하위 품목은 10단계까지 처리할 수 있습니다.</p>}
  </>;
}

/** 한 줄로 시작하고 내용·화면 폭에 맞춰 자라며 입력 커서를 유지한다. */
function InlineMemo({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    function resize(): void {
      const element = ref.current;
      if (!element) return;
      element.style.height = "0px";
      element.style.height = `${Math.max(44, element.scrollHeight + 2)}px`;
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [value]);
  return <textarea ref={ref} className={styles.memo} aria-label="메모" placeholder="메모 (선택)" rows={1} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />;
}
