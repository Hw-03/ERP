import type { ReactNode } from "react";
import { ClipboardCheck } from "lucide-react";
import { formatKstDateTime } from "@/lib/mes-format";
import { STOCKTAKE_CARD } from "./StocktakeCountEditor";

export const STOCKTAKE_ROUND_LABELS: Record<string, string> = { ACTIVE: "진행 중", CLOSED_FULL: "전체 완료", CLOSED_PARTIAL: "부분 종료" };
const ROUND_TONES: Record<string, string> = { ACTIVE: "var(--c-blue)", CLOSED_FULL: "var(--c-green)", CLOSED_PARTIAL: "var(--c-yellow)" };

type Props = {
  round: { title: string; status: string; started_at?: string; closed_at?: string | null } | null;
  ariaLabel?: string;
  actions?: ReactNode;
  children?: ReactNode;
};

/** Share round identity across progress and history without owning navigation or queries. */
export function StocktakeRoundHeader({ round, ariaLabel = "선택한 조사 회차", actions, children }: Props): ReactNode {
  const tone = ROUND_TONES[round?.status ?? ""] ?? "var(--c-muted2)";
  return <section className={STOCKTAKE_CARD} aria-label={ariaLabel}>
    <div className="grid min-w-0 items-center gap-4 lg:grid-cols-[280px_minmax(0,1fr)_280px]">
      <div className="flex min-w-0 items-center justify-center gap-3 lg:col-start-2 lg:row-start-1">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--c-s2)] text-[var(--c-blue)]"><ClipboardCheck size={20} aria-hidden="true" /></span>
        <div className="min-w-0 text-center">
          {round ? <>
            <h2 className="min-w-0 break-words text-2xl font-semibold leading-9">{round.title}</h2>
            <dl className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm">{round.started_at && <div className="flex flex-wrap justify-center gap-x-2"><dt className="text-[var(--c-muted2)]">시작</dt><dd className="break-words">{formatKstDateTime(round.started_at)}</dd></div>}{round.closed_at && <div className="flex flex-wrap justify-center gap-x-2"><dt className="text-[var(--c-muted2)]">종료</dt><dd className="break-words">{formatKstDateTime(round.closed_at)}</dd></div>}</dl>
          </> : <p className="mt-2 text-[var(--c-muted2)]">아직 조사 회차가 없습니다.</p>}
        </div>
      </div>
      {(actions || round) && <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 lg:col-start-3 lg:row-start-1 lg:flex lg:justify-end">
        {actions}
        {round && <span className="col-start-2 inline-flex min-h-10 shrink-0 items-center justify-center gap-2 justify-self-end whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold" style={{ color: tone, background: `color-mix(in srgb, ${tone} 12%, var(--c-s1))`, borderColor: `color-mix(in srgb, ${tone} 35%, transparent)` }}>
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-current" />{STOCKTAKE_ROUND_LABELS[round.status] ?? round.status}
        </span>}
      </div>}
    </div>
    {children}
  </section>;
}
