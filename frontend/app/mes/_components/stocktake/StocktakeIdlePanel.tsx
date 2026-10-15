import { useId, type ReactNode } from "react";
import Image from "next/image";
import { ArrowRight, Check, ClipboardList, Clock3, History, Play, SearchCheck } from "lucide-react";
import type { StocktakeLatestRoundSummary } from "@/lib/api/types/stocktake";
import { formatKstDateTime } from "@/lib/mes-format";
import { SkeletonBlock } from "../common/LoadingSkeleton";
import { STOCKTAKE_BUTTON, STOCKTAKE_CARD } from "./StocktakeCountEditor";
import styles from "./StocktakeIdlePanel.module.css";

type Props = {
  summary?: StocktakeLatestRoundSummary | null;
  loading?: boolean;
  error?: Error | null;
  disabled?: boolean;
  onRetry: () => void;
  onStart?: () => void;
  onHistory?: () => void;
  onDetails?: (roundId: string) => void;
};

/** A waiting workspace uses closing evidence, never live inventory or fabricated zeros. */
export function StocktakeIdlePanel({ summary, loading = false, error, disabled = false, onRetry, onStart, onHistory, onDetails }: Props): ReactNode {
  const id = useId();
  const longestMetric = Math.max(...[summary?.item_summary?.total, summary?.item_summary?.confirmed, summary?.item_summary?.applied].map(value => value?.toLocaleString("ko-KR").length ?? 1));
  const metricSize = longestMetric > 10 ? "text-sm sm:text-2xl" : longestMetric > 6 ? "text-base sm:text-3xl" : "text-2xl sm:text-3xl";
  return <div className={`${styles.workspace} min-w-0 text-sm text-[var(--c-text)]`}>
    <section className={`${STOCKTAKE_CARD} ${styles.hero}`} aria-labelledby={`${id}-title`}>
      <div className="min-w-0">
        <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--c-blue)_10%,var(--c-s1))] text-[var(--c-blue)]"><ClipboardList size={24} aria-hidden="true" /></span>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--c-muted2)]"><Clock3 size={14} aria-hidden="true" />시작 대기</p>
        <h2 id={`${id}-title`} className="break-words text-2xl font-semibold sm:text-3xl">전수조사 시작 대기</h2>
        <p className="mt-4 leading-6 text-[var(--c-muted2)]">진행 중인 회차가 없습니다.</p>
        <p className="mt-1 text-xs leading-5 text-[var(--c-muted2)]">{onStart ? "새 회차를 시작하면 직원들이 조사할 수 있습니다." : "부서 결재 담당자가 회차를 시작하면 조사할 수 있습니다."}</p>
        {(onStart || onHistory) && <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {onStart && <button type="button" disabled={disabled} className={`${STOCKTAKE_BUTTON} flex items-center justify-center gap-2 bg-[var(--c-blue-solid)] !text-white sm:min-w-44`} onClick={onStart}><Play size={16} aria-hidden="true" />새 회차 시작</button>}
          {onHistory && <button type="button" disabled={disabled} className={`${STOCKTAKE_BUTTON} flex items-center justify-center gap-2 sm:min-w-44`} onClick={onHistory}><History size={16} aria-hidden="true" />회차 이력 관리</button>}
        </div>}
      </div>
      <div className={styles.illustration} aria-hidden="true">
        <Image src="/images/dexray/warehouse-adjust.webp" alt="" width={840} height={560} loading="eager"
          sizes="(min-width: 1280px) 520px, (min-width: 640px) 40vw, 220px" className={styles.mascot} />
      </div>
    </section>
    <div className={`${styles.support} grid min-w-0 gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]`}>
      <section className={`${STOCKTAKE_CARD} flex min-w-0 flex-col !p-5 sm:!p-6`} aria-labelledby={`${id}-result`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id={`${id}-result`} className="text-base font-semibold">최근 회차 결과</h2><span className="text-xs text-[var(--c-muted2)]">최근 종료 회차 기준</span></div>
        {loading ? <div role="status" aria-label="최근 회차 결과를 불러오는 중입니다" className="mt-5">
          <span className="sr-only">최근 회차 결과를 불러오는 중입니다</span>
          <div aria-hidden="true"><SkeletonBlock className="h-6 w-2/3" /><SkeletonBlock className="mt-3 !block h-4 w-1/3" /><div className="mt-6 grid grid-cols-3 gap-3">{[0, 1, 2].map(key => <SkeletonBlock key={key} className="h-20 w-full" />)}</div></div>
        </div> : error ? <div className="mt-5 rounded-xl bg-[var(--c-s2)] p-4"><p role="alert" className="break-words leading-6 text-[var(--c-red)]">{error.message}</p><button type="button" disabled={disabled} className={`${STOCKTAKE_BUTTON} mt-3`} onClick={onRetry}>다시 불러오기</button></div>
          : summary ? <>
            <div className="mt-5 flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="break-words text-lg font-semibold">{summary.title}</h3><p className="mt-2 text-xs leading-5 text-[var(--c-muted2)]">종료 {summary.closed_at ? formatKstDateTime(summary.closed_at) : "시각 정보 없음"}</p></div><span className="shrink-0 rounded-full bg-[var(--c-s2)] px-3 py-1.5 text-xs font-semibold text-[var(--c-muted2)]">{summary.status === "CLOSED_FULL" ? "전체 종료" : "부분 종료"}</span></div>
            <dl className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-[var(--c-s2)] py-4 sm:gap-4">{([
              ["대상 품목", summary.item_summary?.total, "text-[var(--c-text)]"],
              ["확인 품목", summary.item_summary?.confirmed, "text-[var(--c-blue)]"],
              ["완료 품목", summary.item_summary?.applied, "text-[var(--c-green)]"],
            ] as const).map(([label, value, tone]) => {
              const text = value == null ? "—" : value.toLocaleString("ko-KR");
              return <div key={label} className="min-w-0 text-center"><dt className="text-xs text-[var(--c-muted2)]">{label}</dt><dd className={`mt-2 whitespace-nowrap font-semibold tabular-nums ${metricSize} ${tone}`}>{text}</dd></div>;
            })}</dl>
            {!summary.item_summary && <p className="mt-3 text-xs text-[var(--c-muted2)]">집계 정보가 없습니다.</p>}
            {onDetails && <button type="button" disabled={disabled} className={`${STOCKTAKE_BUTTON} mt-4 flex items-center justify-center gap-2 self-start`} onClick={() => onDetails(summary.round_id)}>결과 상세 보기<ArrowRight size={16} aria-hidden="true" /></button>}
          </> : <div className="flex flex-1 flex-col justify-center py-9"><p className="font-medium">아직 완료된 전수조사가 없습니다.</p><p className="mt-2 text-xs leading-5 text-[var(--c-muted2)]">회차를 마치면 조사 결과를 이곳에서 확인할 수 있습니다.</p></div>}
      </section>
      <section className={`${STOCKTAKE_CARD} min-w-0 !p-5 sm:!p-6`} aria-labelledby={`${id}-guide`}>
        <h2 id={`${id}-guide`} className="text-base font-semibold">조사 진행 방법</h2>
        <ol aria-label="조사 진행 방법" className="mt-5 grid min-w-0 gap-5 sm:grid-cols-3 xl:grid-cols-1">
          {([
            [ClipboardList, "조사", "품목과 위치별로 실수량을 입력합니다."],
            [SearchCheck, "확인", "입력한 수량을 검토하고 확인합니다."],
            [Check, "재고 반영", "확인한 결과를 검토해 재고에 반영합니다."],
          ] as const).map(([Icon, label, description], index) => <li key={label} className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--c-s2)] text-[var(--c-blue)]"><Icon size={19} aria-hidden="true" /></span><div className="min-w-0"><h3 className="font-semibold"><span className="mr-2 text-xs text-[var(--c-muted2)]">0{index + 1}</span>{label}</h3><p className="mt-1 break-words text-xs leading-5 text-[var(--c-muted2)]">{description}</p></div></li>)}
        </ol>
      </section>
    </div>
  </div>;
}
