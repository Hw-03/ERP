import type { JSX, ReactNode } from "react";
import { Package } from "lucide-react";
import type { WorkDraftDetail } from "@/lib/api/types/work-drafts";
import { LEGACY_COLORS as C } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import { reservationIssueMessage } from "@/lib/io/reservation-message";
import { workLocationLabel } from "../common/WorkReservationDetails";
import { WORK_ITEM_CODE_CLASS, WORK_TYPE_BADGE_CLASS } from "../common/WorkDraftTableParts";

interface DetailLine {
  key: string;
  name: string;
  code: string | null;
  quantity: number;
  unit: string;
  tag: string;
  color: string;
  location?: string;
  change?: string;
}

/** 공개 예정만 품목별로 표시하며 서로 다른 품목·단위의 수량을 합하지 않는다. */
export function AllWorkDraftDetails({ work, layout, columns }: {
  work: WorkDraftDetail;
  layout: "desktop" | "mobile";
  columns: ReactNode;
}): JSX.Element {
  const effects: DetailLine[] = (work.expected_effects ?? []).map((effect) => ({
    key: effect.effect_id, name: effect.item_name, code: effect.mes_code, quantity: effect.quantity, unit: effect.unit,
    tag: effect.kind === "in" ? "입고 예약" : effect.kind === "out" ? "출고 예약" : "이동 예약",
    color: effect.kind === "in" ? C.green : effect.kind === "out" ? C.red : C.blue,
    location: effect.kind === "move" ? `이동 · ${workLocationLabel(effect.from)} → ${workLocationLabel(effect.to)}`
      : effect.kind === "in" ? `입고 · ${workLocationLabel(effect.to)}` : `출고 · ${workLocationLabel(effect.from)}`,
    change: `${effect.kind === "in" ? "+" : effect.kind === "out" ? "−" : ""}${formatQty(effect.quantity)} ${effect.unit}`,
  }));
  const targets: DetailLine[] = work.targets.map((target, index) => ({
    key: `${target.item_id}:${index}`, name: target.item_name, code: target.mes_code, quantity: target.quantity, unit: target.unit,
    tag: "작업 대상", color: C.blue,
  }));

  function identity(line: DetailLine): JSX.Element {
    return <div className={layout === "desktop" ? "relative min-w-0" : "flex min-w-0 items-start gap-2"}>
      <Package size={16} aria-hidden className={layout === "desktop" ? "absolute -left-6 top-0.5" : "mt-0.5 shrink-0"} style={{ color: C.muted2 }} />
      <div className="min-w-0"><div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1"><p className={`min-w-0 break-keep font-bold ${layout === "desktop" ? "leading-5" : "leading-6"} [overflow-wrap:anywhere]`}>{line.name}</p>
        {layout === "desktop" && !line.change && <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums" style={{ color: C.muted2 }}>{formatQty(line.quantity)} {line.unit}</span>}
      </div>
        {line.location && <p className="text-xs leading-5" style={{ color: C.muted2 }}>{line.location}</p>}
      </div>
    </div>;
  }
  function badge(line: DetailLine): JSX.Element {
    return <span className={`inline-flex h-6 items-center rounded-full px-3 text-xs font-bold ${layout === "desktop" ? WORK_TYPE_BADGE_CLASS : ""}`} style={{ color: line.color, background: tint(line.color, 12) }}>{line.tag}</span>;
  }
  function section(title: string, lines: DetailLine[], empty?: string): JSX.Element {
    return <section aria-label={title} className="min-w-0 border-b last:border-b-0" style={{ borderColor: C.border }}>
      <h3 className="sr-only">{title}</h3>
      {lines.length > 0 ? layout === "desktop" ? <table aria-label={title} className="w-full table-fixed border-collapse text-left text-sm">
        {columns}
        <thead className="sr-only"><tr>{["상세", "저장 시각", "담당자", "구분", "품목", "품목코드", "예정 변동"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{lines.map((line) => <tr key={line.key} className="border-t align-middle" style={{ borderColor: C.border, background: C.s1 }}>
          <td colSpan={3} aria-hidden className="px-6 py-2">
            <svg viewBox="0 0 280 40" preserveAspectRatio="none" className="ml-auto h-10 w-[190px]" fill="none" style={{ color: C.muted2 }}>
              <path d="M65 4v8a8 8 0 0 0 8 8h189m-10-10 10 10-10 10" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={0.5} />
            </svg>
          </td>
          <td className="px-3 py-2 text-center">{badge(line)}</td>
          <td className="px-4 py-2">{identity(line)}</td>
          <td className={WORK_ITEM_CODE_CLASS} style={{ color: C.muted2 }}>{line.code ?? "—"}</td>
          <td className="whitespace-nowrap px-3 py-2 text-center font-bold tabular-nums" style={{ color: line.change ? line.color : C.muted2 }}>{line.change ?? "—"}</td>
        </tr>)}</tbody>
      </table> : <ul className="divide-y divide-[var(--c-border)] px-4" style={{ background: C.s1 }}>
        {lines.map((line) => <li key={line.key} className="space-y-2 py-3">
          <div className="flex items-center justify-between gap-3">{badge(line)}<span className="shrink-0 whitespace-nowrap font-bold tabular-nums" style={{ color: line.change ? line.color : C.text }}>{line.change ?? `${formatQty(line.quantity)} ${line.unit}`}</span></div>
          {identity(line)}<p className="pl-6 text-xs" style={{ color: C.muted2 }}>{line.code ?? "코드 없음"}</p>
        </li>)}
      </ul> : <p className="px-4 py-3 text-xs leading-6" style={{ color: C.muted2 }}>{empty}</p>}
    </section>;
  }

  return <div>
    {work.reservation_issue && <p role="status" className="m-3 rounded-[12px] p-3" style={{ background: C.warningBg, color: C.yellow }}>{reservationIssueMessage(work.reservation_issue)}</p>}
    {work.forecast_issue && <p role="status" className="m-3 rounded-[12px] p-3 text-xs leading-6" style={{ background: C.warningBg, color: C.yellow }}>이 작업의 입고·출고 예정을 모두 확인할 수 없습니다. 담당자에게 작업 내용을 확인해 주세요.</p>}
    {work.targets.length > 2 && section("작업 대상", targets)}
    {section("완료 시 재고 변동", effects, work.expected_effects === null ? "이전 요청은 예정 변동 정보를 제공하지 않습니다."
      : work.forecast_issue ? "예정 수량을 확인할 수 없습니다. 수량이 없는 것은 아닙니다." : "확정된 예정이 없습니다.")}
  </div>;
}
