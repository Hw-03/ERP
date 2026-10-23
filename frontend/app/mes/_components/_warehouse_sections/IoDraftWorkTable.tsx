"use client";
import { reservationStatusLabel } from "../_warehouse_v2/WorkReservationNotice";

import { useState } from "react";
import { Package } from "lucide-react";
import type { IoBatch, IoBundle, IoLine, IoSubType } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { reservationIssueMessage } from "@/lib/io/reservation-message";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import { FlowBadge } from "../_history_sections/historyTableHelpers";
import { StatusPill } from "../common/StatusPill";
import { Button } from "@/lib/ui/Button";
import { WorkDraftMemo } from "../common/WorkDraftMemo";
import { formatWorkTimestamp, getIoDraftOperationColor, getIoDraftOperationLabel, getIoDraftTransactionType, WORK_ITEM_CODE_CLASS, WORK_TIMESTAMP_CLASS, WORK_TYPE_BADGE_CLASS, WorkExpandButton, WorkMovementSummary } from "../common/WorkDraftTableParts";
import type { WorkDraftMovementSummary } from "@/lib/api/types/work-drafts";
import {
  isCustomProcessBomBundle,
  lineTagLabel,
  processBomEffectLine,
} from "../_warehouse_v2/ioWorkType";

interface IoDraftWorkTableProps {
  drafts: IoBatch[];
  busyId: string | null;
  onContinue: (draft: IoBatch) => void;
  onRequestDelete: (draft: IoBatch) => void;
}

type MovementKind = "increase" | "decrease" | "move" | "none";

const TAG_TONE: Record<string, string> = {
  blue: LEGACY_COLORS.blue,
  green: LEGACY_COLORS.green,
  red: LEGACY_COLORS.red,
  purple: LEGACY_COLORS.purple,
  muted: LEGACY_COLORS.muted2,
};

function movementKind(line: IoLine): MovementKind {
  if (!line.included || line.bom_stock_exempt) return "none";
  if (line.direction === "in") return "increase";
  if (line.direction === "out" || line.direction === "defective") return "decrease";
  if (line.direction === "move") return "move";
  if (line.direction === "adjust") {
    if (line.to_bucket === "production" || line.to_bucket === "warehouse") return "increase";
    if (line.from_bucket === "production" || line.from_bucket === "warehouse") return "decrease";
  }
  return "none";
}

function movementPresentation(line: IoLine): { label: string; color: string } {
  const qty = `${formatQty(line.quantity, { maximumFractionDigits: 4, trimTrailingZeros: true })} ${line.unit || "EA"}`;
  const kind = movementKind(line);
  if (kind === "increase") return { label: `+${qty}`, color: LEGACY_COLORS.green };
  if (kind === "decrease") return { label: `−${qty}`, color: LEGACY_COLORS.red };
  if (kind === "move") return { label: `${qty} 이동`, color: LEGACY_COLORS.blue };
  return { label: "변동 없음", color: LEGACY_COLORS.muted2 };
}

/** 원본 BOM 역할 대신 실제 예정 변동 방향으로 예약 구분을 표시한다. */
function reservationTag(line: IoLine, subType: IoSubType): ReturnType<typeof lineTagLabel> {
  const kind = movementKind(line);
  if (kind === "increase") return { text: "입고 예약", tone: "green" };
  if (kind === "decrease") return { text: "출고 예약", tone: "red" };
  if (kind === "move") return { text: "이동 예약", tone: "blue" };
  return lineTagLabel(line, subType);
}

function draftSummary(draft: IoBatch): WorkDraftMovementSummary {
  const counts: Record<MovementKind, number> = { increase: 0, decrease: 0, move: 0, none: 0 };
  for (const bundle of draft.bundles) {
    for (const line of bundle.lines ?? []) {
      const effectLine = processBomEffectLine(draft.sub_type, bundle, line);
      if (!effectLine) continue;
      const kind = movementKind(effectLine);
      if (kind !== "none") counts[kind] += 1;
    }
  }
  return counts;
}

function bundlePrimaryLine(bundle: IoBundle): IoLine | null {
  const direct = bundle.lines.find((line) => line.origin === "direct");
  if (direct) return direct;
  return bundle.source_kind !== "bom_parent" && bundle.lines.length === 1 ? bundle.lines[0] : null;
}

function bundleDisplayQty(bundle: IoBundle): number {
  return Number(bundlePrimaryLine(bundle)?.quantity ?? bundle.quantity) || 0;
}

function latestRejection(draft: IoBatch) {
  if (draft.status !== "draft") return undefined;
  return (draft.stock_requests ?? [])
    .filter((request) => request.status === "rejected" && request.rejected_at)
    .sort((left, right) =>
      new Date(right.rejected_at!).getTime() - new Date(left.rejected_at!).getTime(),
    )[0];
}

function DraftMovementSummary({ draft }: { draft: IoBatch }) {
  const items = draftSummary(draft);
  const shortageCount = draft.bundles
    .flatMap((bundle) => (bundle.lines ?? [])
      .map((line) => processBomEffectLine(draft.sub_type, bundle, line))
      .filter((line): line is IoLine => Boolean(line)))
    .filter((line) => Number(line.shortage) > 0).length;
  return <WorkMovementSummary counts={items} shortageCount={shortageCount} />;
}

export function IoDraftWorkTable({
  drafts,
  busyId,
  onContinue,
  onRequestDelete,
}: IoDraftWorkTableProps) {
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);

  return (
    <div className="relative min-h-0 min-w-0 flex-1" data-scrollbar-rail-shell>
    <div
      role="region"
      aria-label="작업 중 목록"
      tabIndex={0}
      data-scrollbar-rail-viewport
      className="sg absolute inset-y-0 left-0 -right-2.5 overflow-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
    >
      <div className="min-h-full min-w-[1440px]" style={{ background: LEGACY_COLORS.s1 }}>
      <table className="w-full min-w-[1440px] table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[52px]" />
          <col className="w-[104px]" />
          <col className="w-48" />
          <col />
          <col className="w-[200px]" />
          <col className="w-[112px]" />
          <col className="w-[360px]" />
          <col className="w-[176px]" />
        </colgroup>
        <thead className="sticky top-0 z-10" style={{ background: LEGACY_COLORS.s1 }}>
          <tr style={{ color: LEGACY_COLORS.muted2 }}>
            <th
              scope="col"
              aria-label="상세"
              className="border-b p-0"
              style={{ borderColor: LEGACY_COLORS.border }}
            />
            {[
              ["작업 시작", "text-center"],
              ["작업", "text-center"],
              ["대상", "text-left"],
              ["메모", "text-center"],
              ["품목코드", "text-center"],
              ["예정 변동", "text-center"],
              ["관리", "text-center"],
            ].map(([label, align]) => (
              <th
                key={label}
                scope="col"
                className={`border-b px-3 py-3 text-xs font-bold ${align}`}
                style={{ borderColor: LEGACY_COLORS.border }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {drafts.map((draft) => {
            const expanded = expandedBatchId === draft.batch_id;
            const controlsId = `io-draft-detail-${draft.batch_id}`;
            const firstBundle = draft.bundles[0];
            const primaryQty = firstBundle ? bundleDisplayQty(firstBundle) : 0;
            const rejection = latestRejection(draft);
            const busy = busyId === draft.batch_id;
            return (
              <DraftRows
                key={draft.batch_id}
                draft={draft}
                expanded={expanded}
                controlsId={controlsId}
                firstBundle={firstBundle}
                primaryQty={primaryQty}
                rejection={rejection}
                busy={busy}
                onToggle={() => setExpandedBatchId((current) => current === draft.batch_id ? null : draft.batch_id)}
                onContinue={() => onContinue(draft)}
                onRequestDelete={() => onRequestDelete(draft)}
              />
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
    <div aria-hidden data-scrollbar-rail-frame className="pointer-events-none absolute inset-0 z-20 rounded-[24px] border" style={{ borderColor: LEGACY_COLORS.border }} />
    <div aria-hidden data-scrollbar-rail-masks className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between">
      <div className="flex justify-between"><span className="h-6 w-6" style={{ background: "radial-gradient(circle at 100% 100%, transparent 0 23px, var(--c-bg) 24px)" }} /><span className="h-6 w-6" style={{ background: "radial-gradient(circle at 0 100%, transparent 0 23px, var(--c-bg) 24px)" }} /></div>
      <div className="flex justify-between"><span className="h-6 w-6" style={{ background: "radial-gradient(circle at 100% 0, transparent 0 23px, var(--c-bg) 24px)" }} /><span className="h-6 w-6" style={{ background: "radial-gradient(circle at 0 0, transparent 0 23px, var(--c-bg) 24px)" }} /></div>
    </div>
    </div>
  );
}

function DraftRows({
  draft,
  expanded,
  controlsId,
  firstBundle,
  primaryQty,
  rejection,
  busy,
  onToggle,
  onContinue,
  onRequestDelete,
}: {
  draft: IoBatch;
  expanded: boolean;
  controlsId: string;
  firstBundle: IoBundle | undefined;
  primaryQty: number;
  rejection: ReturnType<typeof latestRejection>;
  busy: boolean;
  onToggle: () => void;
  onContinue: () => void;
  onRequestDelete: () => void;
}) {
  return (
    <>
      <tr
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={controlsId}
        className="cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--c-blue)_6%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
        style={{ background: expanded ? tint(LEGACY_COLORS.blue, 8) : undefined }}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onToggle();
        }}
      >
        <td className="border-b p-1 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
          <WorkExpandButton expanded={expanded} controlsId={controlsId} onToggle={onToggle} />
        </td>
        <td className={`border-b ${WORK_TIMESTAMP_CLASS}`} style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
          <span className="whitespace-nowrap">{formatWorkTimestamp(draft.created_at)}</span>
        </td>
        <td className="border-b px-3 py-2 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="flex items-center justify-center">
            <FlowBadge type={getIoDraftTransactionType(draft)} label={getIoDraftOperationLabel(draft)} color={getIoDraftOperationColor(draft)} className={WORK_TYPE_BADGE_CLASS} />
          </div>
        </td>
        <td className="border-b px-4 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="min-w-0 break-keep font-bold leading-6 [overflow-wrap:anywhere]" style={{ color: LEGACY_COLORS.text }}>
              {firstBundle?.title ?? "대상 없음"}{draft.bundles.length > 1 ? ` 외 ${draft.bundles.length - 1}개 품목` : ""}
            </p>
            <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums" style={{ color: LEGACY_COLORS.muted2 }}>{formatQty(primaryQty, { maximumFractionDigits: 4, trimTrailingZeros: true })} {firstBundle ? bundlePrimaryLine(firstBundle)?.unit || firstBundle.lines[0]?.unit || "EA" : "EA"}</span>
            </div>
            {["반려됨", "예약 상태 확인 필요"].includes(reservationStatusLabel(draft)) && <StatusPill label={reservationStatusLabel(draft)} tone="warning" showDot={false} className="mt-1 !px-2.5 !py-1" />}
            {draft.reservation_issue && <p className="mt-1 break-keep text-xs leading-5 [overflow-wrap:anywhere]" style={{ color: LEGACY_COLORS.yellow }}>{reservationIssueMessage(draft.reservation_issue)}</p>}
            {rejection?.rejected_reason && (
              <p className="mt-1 truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.red }}>
                반려: {rejection.rejected_reason}
              </p>
            )}
          </div>
        </td>
        <td className="border-b px-3 py-2 text-left" style={{ borderColor: LEGACY_COLORS.border }}><WorkDraftMemo notes={draft.notes} showEmpty /></td>
        <td className={`border-b ${WORK_ITEM_CODE_CLASS}`} style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
          {firstBundle?.source_mes_code ?? "—"}
        </td>
        <td className="border-b px-2 py-2 text-center text-xs" style={{ borderColor: LEGACY_COLORS.border }}>
          <DraftMovementSummary draft={draft} />
        </td>
        <td className="border-b px-2 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="secondary"
              type="button"
              disabled={busy}
              onClick={(event) => { event.stopPropagation(); onContinue(); }}
              className="min-h-11 whitespace-nowrap rounded-[12px] border px-3 text-xs font-bold transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-blue)] disabled:opacity-50"
              style={{ background: tint(LEGACY_COLORS.blue, 10), borderColor: LEGACY_COLORS.borderStrong, color: LEGACY_COLORS.blue }}
            >
              이어서 작업
            </Button>
            <Button
              variant="secondary"
              type="button"
              aria-label="작업 삭제"
              disabled={busy}
              onClick={(event) => { event.stopPropagation(); onRequestDelete(); }}
              className="min-h-11 min-w-11 rounded-[12px] !border-0 px-3 text-xs font-bold transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-blue)] disabled:opacity-50"
              style={{ background: tint(LEGACY_COLORS.red, 10), color: LEGACY_COLORS.red }}
            >
              삭제
            </Button>
          </div>
        </td>
      </tr>
      {expanded && draft.notes?.trim() && <tr><td colSpan={8} className="border-b px-4 py-3 text-left" style={{ borderColor: LEGACY_COLORS.border }}><WorkDraftMemo notes={draft.notes} expanded /></td></tr>}
      {expanded && draft.bundles.map((bundle, index) => (
        <BundleRows
          key={bundle.bundle_id}
          bundle={bundle}
          subType={draft.sub_type}
          controlsId={index === 0 ? controlsId : undefined}
        />
      ))}
    </>
  );
}

function BundleRows({ bundle, subType, controlsId }: { bundle: IoBundle; subType: IoSubType; controlsId?: string }) {
  const primary = bundlePrimaryLine(bundle);
  const children = primary ? bundle.lines.filter((line) => line.line_id !== primary.line_id) : bundle.lines;
  const customProcessBom = isCustomProcessBomBundle(subType, bundle);
  const primaryEffect = primary ? processBomEffectLine(subType, bundle, primary) : null;
  const movement = primaryEffect ? movementPresentation(primaryEffect) : null;
  const tag = primary
    ? customProcessBom && primary.origin === "direct"
      ? { text: "상위 미반영", tone: "muted" }
      : reservationTag(primaryEffect ?? primary, subType)
    : null;
  const tagColor = tag ? TAG_TONE[tag.tone] ?? LEGACY_COLORS.muted2 : LEGACY_COLORS.blue;
  return (
    <>
      <tr id={controlsId} style={{ background: tint(LEGACY_COLORS.blue, 5) }}>
        <td className="border-b" style={{ borderColor: LEGACY_COLORS.border }} />
        <td className="border-b" style={{ borderColor: LEGACY_COLORS.border }} />
        <td className="border-b px-3 py-2 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
          <span className={`inline-flex h-6 items-center rounded-full px-3 text-xs font-bold ${WORK_TYPE_BADGE_CLASS}`} style={{ background: tint(tagColor, 12), color: tagColor }}>
            {tag?.text ?? "BOM"}
          </span>
        </td>
        <td className="border-b px-4 py-2 font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Package className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
            <span className="min-w-0 break-keep leading-6 [overflow-wrap:anywhere]">{bundle.title}</span>
          </div>
        </td>
        <td className="border-b" style={{ borderColor: LEGACY_COLORS.border }} />
        <td className={`border-b ${WORK_ITEM_CODE_CLASS}`} style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>{bundle.source_mes_code ?? primary?.mes_code ?? "—"}</td>
        <td className="border-b px-3 py-2 text-center font-bold tabular-nums" style={{ borderColor: LEGACY_COLORS.border, color: movement?.color ?? LEGACY_COLORS.muted2 }}>{movement?.label ?? (primary ? "변동 없음" : "—")}</td>
        <td className="border-b" style={{ borderColor: LEGACY_COLORS.border }} />
      </tr>
      {children.map((line) => <DraftLineRow key={line.line_id} bundle={bundle} line={line} subType={subType} />)}
    </>
  );
}

function DraftLineRow({ bundle, line, subType }: { bundle: IoBundle; line: IoLine; subType: IoSubType }) {
  const effectLine = processBomEffectLine(subType, bundle, line);
  const tag = effectLine ? reservationTag(effectLine, subType) : lineTagLabel(line, subType);
  const tagColor = TAG_TONE[tag.tone] ?? LEGACY_COLORS.muted2;
  const movement = effectLine
    ? movementPresentation(effectLine)
    : { label: "변동 없음", color: LEGACY_COLORS.muted2 };
  const shortage = line.included && Number(line.shortage) > 0;
  const excluded = !line.included || Boolean(line.bom_stock_exempt);
  return (
    <tr style={{ background: shortage ? tint(LEGACY_COLORS.red, 7) : tint(LEGACY_COLORS.blue, 2), opacity: excluded ? 0.5 : 1 }}>
      <td className="border-b" style={{ borderColor: LEGACY_COLORS.border }} />
      <td className="border-b" style={{ borderColor: LEGACY_COLORS.border }} />
      <td className="border-b px-3 py-2 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
        <span className={`inline-flex h-6 items-center rounded-full px-3 text-xs font-bold ${WORK_TYPE_BADGE_CLASS}`} style={{ background: tint(tagColor, 12), color: tagColor }}>{tag.text}</span>
      </td>
      <td className="border-b px-4 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex min-w-0 flex-wrap items-center gap-2 pl-3">
          <Package className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
          <span className="min-w-0 break-keep font-semibold leading-6 [overflow-wrap:anywhere]" style={{ color: LEGACY_COLORS.text, textDecoration: excluded ? "line-through" : undefined }}>{line.item_name}</span>
          {shortage && <span className="shrink-0 text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>부족 {formatQty(line.shortage)}</span>}
        </div>
      </td>
      <td className="border-b" style={{ borderColor: LEGACY_COLORS.border }} />
      <td className={`border-b ${WORK_ITEM_CODE_CLASS}`} style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>{line.mes_code ?? "—"}</td>
      <td className="border-b px-3 py-2 text-center font-bold tabular-nums" style={{ borderColor: LEGACY_COLORS.border, color: movement.color }}>{movement.label}</td>
      <td className="border-b" style={{ borderColor: LEGACY_COLORS.border }} />
    </tr>
  );
}
