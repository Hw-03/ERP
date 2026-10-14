import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { StocktakeProgress } from "@/lib/api/types/stocktake";
import styles from "./StocktakeWorkers.module.css";

const STAGES = [{ key: "confirmed", label: "확인", tone: "blue" }, { key: "applied", label: "반영", tone: "green" }] as const;
type Stage = typeof STAGES[number]["key"];
type Worker = Omit<NonNullable<StocktakeProgress["worker_items"]>[number], Stage | "surveyed"> & Partial<Record<Stage, number>>;

/** EA and 개 share a wire unit; unknown historical units remain explicitly unnamed. */
function canonicalUnit(unit: string): string { return unit === "개" ? "EA" : unit; }
function unitLabel(unit: string): string { return unit === "EA" ? "개" : unit || "단위 미지정"; }
function exactNumber(value: number | null | undefined): string { return value == null ? "—" : value.toLocaleString("ko-KR", { maximumFractionDigits: 20 }); }

/** The management view owns selection across loading; standalone panels default to item counts. */
export function StocktakeWorkers({ progress, quantityMode: controlledMode, onQuantityModeChange }: { progress: StocktakeProgress; quantityMode?: boolean; onQuantityModeChange?: (quantity: boolean) => void }) {
  const [localMode, setLocalMode] = useState(false);
  const quantityMode = controlledMode ?? localMode;
  const setQuantityMode = onQuantityModeChange ?? setLocalMode;
  const noticeId = useId();
  const workers: Worker[] = progress.worker_items ?? progress.by_employee.map(row => ({ owner_id: row.owner_id, owner_name: row.owner_name }));
  const quantitiesAvailable = progress.worker_items !== undefined && workers.every(worker => worker.quantities_by_unit !== undefined);
  const units = Array.from(new Set(workers.flatMap(worker => worker.quantities_by_unit?.map(row => canonicalUnit(row.unit)) ?? [])));
  const displayedUnits = units.length ? units : [""];
  const multipleUnits = units.length > 1;
  const modeLabel = quantityMode ? `실셈 수량 · ${multipleUnits ? "단위별" : unitLabel(displayedUnits[0])}` : "품목 수";
  const itemMaximum = workers.reduce((maximum, worker) => Math.max(maximum, ...STAGES.map(stage => worker[stage.key] ?? 0)), 0);
  const unitMaximum = new Map(displayedUnits.map(unit => [unit, workers.reduce((maximum, worker) => Math.max(maximum, ...STAGES.map(stage => worker.quantities_by_unit?.find(row => canonicalUnit(row.unit) === unit)?.[stage.key] ?? 0)), 0)]));
  const values = workers.map(worker => STAGES.map(stage => quantityMode
    ? displayedUnits.map(unit => ({ value: worker.quantities_by_unit?.find(row => canonicalUnit(row.unit) === unit)?.[stage.key], maximum: unitMaximum.get(unit) ?? 0, unit }))
    : [{ value: worker[stage.key], maximum: itemMaximum, unit: "" }]));
  const numberText = (value: number | null | undefined, unit: string): string => `${exactNumber(value)}${quantityMode && multipleUnits ? ` ${unitLabel(unit)}` : ""}`;
  const texts = Array.from(new Set(values.flat(2).map(row => numberText(row.value, row.unit))));
  const textKey = texts.join("|");
  const containerRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, number: 64 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    const probe = probeRef.current;
    if (!container || !probe) return;
    let cancelled = false;
    const measure = (): void => {
      if (cancelled) return;
      const number = Math.max(64, ...Array.from(probe.children, child => Math.ceil(child.getBoundingClientRect().width)));
      const width = container.getBoundingClientRect().width;
      setDimensions(previous => previous.width === width && previous.number === number ? previous : { width, number });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(container);
    observer?.observe(probe);
    void document.fonts?.ready.then(measure);
    return () => { cancelled = true; observer?.disconnect(); };
  }, [textKey]);

  const numberWidth = dimensions.number;
  const barsFit = dimensions.width === 0 || (dimensions.width - 120) / 2 - 12 - numberWidth - 8 >= 32;
  const desktopStack = dimensions.width > 0 && dimensions.width < 120 + 2 * (numberWidth + 12);
  const mobileStack = dimensions.width > 0 && (dimensions.width - 8) / 2 < numberWidth;
  return <>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-semibold">작업자별 현황</h2>
      <div role="group" aria-label="작업자 집계 기준" className="flex min-h-11 rounded-xl bg-[var(--c-s2)] p-1">
        {[{ label: "품목 수", quantity: false }, { label: "실셈 수량", quantity: true }].map(mode => <button key={mode.label} type="button" aria-pressed={quantityMode === mode.quantity} disabled={mode.quantity && !quantitiesAvailable} aria-describedby={mode.quantity && !quantitiesAvailable ? noticeId : undefined} onClick={() => setQuantityMode(mode.quantity)} className={`min-h-11 min-w-11 rounded-lg px-3 text-xs font-medium transition-colors active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${quantityMode === mode.quantity ? "bg-[var(--c-s1)] text-[var(--c-blue)] shadow-sm" : "text-[var(--c-muted2)]"}`}>{mode.label}</button>)}
      </div>
    </div>
    <div ref={containerRef} className="relative min-w-0">
      <div ref={probeRef} aria-hidden="true" className={styles.probe}>{texts.map(text => <span key={text}>{text}</span>)}</div>
      {workers.length ? <table className={`${styles.table} w-full table-fixed text-sm`} data-quantity-mode={quantityMode} data-bars={barsFit} data-desktop-stack={desktopStack} data-mobile-stack={mobileStack} style={{ "--worker-number-width": `${numberWidth}px` } as CSSProperties}>
        <caption className="sr-only">작업자별 {modeLabel}</caption>
        <thead className="text-xs text-[var(--c-muted2)]"><tr><th scope="col" className="w-[40%] pb-3 text-center font-medium lg:w-[120px]">작업자</th>{STAGES.map(stage => <th key={stage.key} scope="col" className="pb-3 text-right font-medium" style={{ color: `var(--c-${stage.tone})` }}>{stage.label}</th>)}</tr></thead>
        <tbody>{workers.map((worker, index) => <tr key={worker.owner_id} className="border-t border-[var(--c-border)]">
          <th scope="row" className="break-words py-3 text-center font-semibold">{worker.owner_name}</th>
          {STAGES.map((stage, stageIndex) => <td key={stage.key} aria-label={quantityMode || desktopStack ? `${stage.label} ${values[index][stageIndex].map(row => `${exactNumber(row.value)}${quantityMode ? ` ${unitLabel(row.unit)}` : ""}`).join(" · ")}` : undefined} className="py-3 text-right" style={{ color: `var(--c-${stage.tone})` }}>
            <span aria-hidden="true" className={styles.stageLabel}>{stage.label}</span>
            <div className={styles.figures}>{values[index][stageIndex].map(row => <div key={row.unit} className={styles.figure}>
              {row.value != null && <div aria-hidden="true" data-worker-chart-track className={styles.track}><span data-worker-chart-bar className={styles.bar} style={{ width: `${row.maximum ? Math.max(0, row.value) / row.maximum * 100 : 0}%`, backgroundColor: `var(--c-${stage.tone})` }} /></div>}
              <span data-worker-number className={styles.number}>{numberText(row.value, row.unit)}</span>
            </div>)}</div>
          </td>)}
        </tr>)}</tbody>
      </table> : <p className="py-3 text-sm text-[var(--c-muted2)]">참여한 작업자가 없습니다.</p>}
    </div>
    {!progress.worker_items && <p className="mt-3 text-xs leading-5 text-[var(--c-muted2)]">품목 집계를 불러오지 못했습니다.</p>}
    {!quantitiesAvailable && <p id={noticeId} className="mt-3 text-xs leading-5 text-[var(--c-muted2)]">실셈 수량 자료가 없습니다.</p>}
  </>;
}
