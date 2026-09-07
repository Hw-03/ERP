"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, GitBranch, Package } from "lucide-react";
import type { IoBatch, IoBundle, IoLine, IoSubType } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import {
  IO_WORK_TYPES,
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

const KST_SHORT_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const TAG_TONE: Record<string, string> = {
  blue: LEGACY_COLORS.blue,
  green: LEGACY_COLORS.green,
  red: LEGACY_COLORS.red,
  purple: LEGACY_COLORS.purple,
  muted: LEGACY_COLORS.muted2,
};

function formatDraftStartedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = Object.fromEntries(
    KST_SHORT_FORMATTER.formatToParts(date).map(({ type, value: partValue }) => [type, partValue]),
  );
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

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

function draftSummary(draft: IoBatch): Array<{ label: string; color: string }> {
  const counts: Record<MovementKind, number> = { increase: 0, decrease: 0, move: 0, none: 0 };
  for (const bundle of draft.bundles) {
    for (const line of bundle.lines ?? []) {
      const effectLine = processBomEffectLine(draft.sub_type, bundle, line);
      if (!effectLine) continue;
      const kind = movementKind(effectLine);
      if (kind !== "none") counts[kind] += 1;
    }
  }
  const summary: Array<{ label: string; color: string }> = [];
  if (counts.decrease > 0) summary.push({ label: `감소 ${counts.decrease}종`, color: LEGACY_COLORS.red });
  if (counts.increase > 0) summary.push({ label: `증가 ${counts.increase}종`, color: LEGACY_COLORS.green });
  if (counts.move > 0) summary.push({ label: `이동 ${counts.move}종`, color: LEGACY_COLORS.blue });
  return summary;
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
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {items.length === 0 && <span style={{ color: LEGACY_COLORS.muted2 }}>변동 없음</span>}
      {items.map((item) => (
        <span
          key={item.label}
          className="inline-flex h-6 items-center rounded-full px-2.5 text-xs font-bold"
          style={{ background: tint(item.color, 12), color: item.color }}
        >
          {item.label}
        </span>
      ))}
      {shortageCount > 0 && (
        <span
          className="inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-bold"
          style={{ background: tint(LEGACY_COLORS.red, 12), color: LEGACY_COLORS.red }}
        >
          <AlertTriangle className="h-4 w-4" /> 부족 {shortageCount}종
        </span>
      )}
    </div>
  );
}

export function IoDraftWorkTable({
  drafts,
  busyId,
  onContinue,
  onRequestDelete,
}: IoDraftWorkTableProps) {
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);

  return (
    <div
      className="min-w-0 overflow-x-auto rounded-[24px] border"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      <table className="w-full min-w-[1180px] table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[52px]" />
          <col className="w-[120px]" />
          <col className="w-[148px]" />
          <col />
          <col className="w-[128px]" />
          <col className="w-[92px]" />
          <col className="w-[220px]" />
          <col className="w-[188px]" />
        </colgroup>
        <thead>
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
              ["품목코드", "text-center"],
              ["수량", "text-center"],
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
            const workMeta = IO_WORK_TYPES.find((item) => item.id === draft.work_type);
            const firstBundle = draft.bundles[0];
            const totalQty = draft.bundles.reduce((sum, bundle) => sum + bundleDisplayQty(bundle), 0);
            const rejection = latestRejection(draft);
            const busy = busyId === draft.batch_id;
            return (
              <DraftRows
                key={draft.batch_id}
                draft={draft}
                expanded={expanded}
                controlsId={controlsId}
                workMeta={workMeta}
                firstBundle={firstBundle}
                totalQty={totalQty}
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
  );
}

function DraftRows({
  draft,
  expanded,
  controlsId,
  workMeta,
  firstBundle,
  totalQty,
  rejection,
  busy,
  onToggle,
  onContinue,
  onRequestDelete,
}: {
  draft: IoBatch;
  expanded: boolean;
  controlsId: string;
  workMeta: (typeof IO_WORK_TYPES)[number] | undefined;
  firstBundle: IoBundle | undefined;
  totalQty: number;
  rejection: ReturnType<typeof latestRejection>;
  busy: boolean;
  onToggle: () => void;
  onContinue: () => void;
  onRequestDelete: () => void;
}) {
  const WorkIcon = workMeta?.icon;
  return (
    <>
      <tr
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={controlsId}
        className="cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--c-blue)_6%,transparent)]"
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
          <button
            type="button"
            aria-label={expanded ? "작업 상세 접기" : "작업 상세 펼치기"}
            aria-expanded={expanded}
            aria-controls={controlsId}
            onClick={(event) => { event.stopPropagation(); onToggle(); }}
            className="flex h-11 w-11 items-center justify-center rounded-[10px] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
            style={{ color: expanded ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2 }}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </td>
        <td className="border-b px-2 py-2 text-center text-xs font-semibold tabular-nums" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
          <span className="whitespace-nowrap">{formatDraftStartedAt(draft.created_at)}</span>
        </td>
        <td className="border-b px-3 py-2 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="flex items-center justify-center">
            <span className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-full px-3 text-xs font-bold" style={{ background: tint(LEGACY_COLORS.blue, 14), color: LEGACY_COLORS.blue }}>
              {WorkIcon && <WorkIcon className="h-4 w-4 shrink-0" />}
              <span className="truncate">{workMeta?.label ?? draft.work_type}</span>
            </span>
          </div>
        </td>
        <td className="border-b px-4 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="min-w-0">
            <p className="truncate font-bold" style={{ color: LEGACY_COLORS.text }}>
              {firstBundle?.title ?? "대상 없음"}{draft.bundles.length > 1 ? ` 외 ${draft.bundles.length - 1}건` : ""}
            </p>
            {rejection?.rejected_reason && (
              <p className="mt-1 truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.red }}>
                반려: {rejection.rejected_reason}
              </p>
            )}
          </div>
        </td>
        <td className="border-b px-3 py-2 text-center font-mono text-xs font-semibold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
          {draft.bundles.length === 1 ? firstBundle?.source_mes_code ?? "—" : "—"}
        </td>
        <td className="border-b px-3 py-2 text-center font-bold tabular-nums" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
          {formatQty(totalQty, { maximumFractionDigits: 4, trimTrailingZeros: true })} EA
        </td>
        <td className="border-b px-2 py-2 text-center text-xs" style={{ borderColor: LEGACY_COLORS.border }}>
          <DraftMovementSummary draft={draft} />
        </td>
        <td className="border-b px-2 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={(event) => { event.stopPropagation(); onContinue(); }}
              className="h-11 rounded-[12px] border px-3 text-xs font-bold transition hover:brightness-110 disabled:opacity-50"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.borderStrong, color: LEGACY_COLORS.text }}
            >
              이어서 작업
            </button>
            <button
              type="button"
              aria-label="작업 삭제"
              disabled={busy}
              onClick={(event) => { event.stopPropagation(); onRequestDelete(); }}
              className="h-11 rounded-[12px] px-3 text-xs font-bold transition hover:brightness-110 disabled:opacity-50"
              style={{ background: tint(LEGACY_COLORS.red, 10), color: LEGACY_COLORS.red }}
            >
              삭제
            </button>
          </div>
        </td>
      </tr>
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
      : lineTagLabel(primaryEffect ?? primary, subType)
    : null;
  const tagColor = tag ? TAG_TONE[tag.tone] ?? LEGACY_COLORS.muted2 : LEGACY_COLORS.blue;
  return (
    <>
      <tr id={controlsId} style={{ background: tint(LEGACY_COLORS.blue, 5) }}>
        <td className="border-b" style={{ borderColor: LEGACY_COLORS.border }} />
        <td className="border-b" style={{ borderColor: LEGACY_COLORS.border }} />
        <td className="border-b px-3 py-2 text-center" style={{ borderColor: LEGACY_COLORS.border }}>
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full px-3 text-xs font-bold" style={{ background: tint(LEGACY_COLORS.blue, 14), color: LEGACY_COLORS.blue }}>
            <GitBranch className="h-4 w-4" /> BOM
          </span>
        </td>
        <td className="border-b px-4 py-2 font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
          <div className="flex min-w-0 items-center gap-2">
            <Package className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
            <span className="truncate">{bundle.title}</span>
            {tag && <span className="shrink-0 rounded-full px-2 py-1 text-xs font-bold" style={{ background: tint(tagColor, 12), color: tagColor }}>{tag.text}</span>}
          </div>
        </td>
        <td className="border-b px-3 py-2 text-center font-mono text-xs font-semibold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>{bundle.source_mes_code ?? primary?.mes_code ?? "—"}</td>
        <td className="border-b px-3 py-2 text-center font-bold tabular-nums" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>{formatQty(bundleDisplayQty(bundle), { maximumFractionDigits: 4, trimTrailingZeros: true })} {primary?.unit || "EA"}</td>
        <td className="border-b px-3 py-2 text-center font-bold tabular-nums" style={{ borderColor: LEGACY_COLORS.border, color: movement?.color ?? LEGACY_COLORS.muted2 }}>{movement?.label ?? (primary ? "변동 없음" : "—")}</td>
        <td className="border-b" style={{ borderColor: LEGACY_COLORS.border }} />
      </tr>
      {children.map((line) => <DraftLineRow key={line.line_id} bundle={bundle} line={line} subType={subType} />)}
    </>
  );
}

function DraftLineRow({ bundle, line, subType }: { bundle: IoBundle; line: IoLine; subType: IoSubType }) {
  const effectLine = processBomEffectLine(subType, bundle, line);
  const tag = lineTagLabel(effectLine ?? line, subType);
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
        <span className="inline-flex h-6 items-center rounded-full px-3 text-xs font-bold" style={{ background: tint(tagColor, 12), color: tagColor }}>{tag.text}</span>
      </td>
      <td className="border-b px-4 py-2" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex min-w-0 items-center gap-2 pl-7">
          <Package className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
          <span className="truncate font-semibold" style={{ color: LEGACY_COLORS.text, textDecoration: excluded ? "line-through" : undefined }}>{line.item_name}</span>
          {shortage && <span className="shrink-0 text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>부족 {formatQty(line.shortage)}</span>}
        </div>
      </td>
      <td className="border-b px-3 py-2 text-center font-mono text-xs font-semibold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>{line.mes_code ?? "—"}</td>
      <td className="border-b px-3 py-2 text-center font-bold tabular-nums" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>{formatQty(line.quantity, { maximumFractionDigits: 4, trimTrailingZeros: true })} {line.unit || "EA"}</td>
      <td className="border-b px-3 py-2 text-center font-bold tabular-nums" style={{ borderColor: LEGACY_COLORS.border, color: movement.color }}>{movement.label}</td>
      <td className="border-b" style={{ borderColor: LEGACY_COLORS.border }} />
    </tr>
  );
}
