"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import type { IoBatch, IoLine, IoSubType } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { reservationIssueMessage } from "@/lib/io/reservation-message";
import { SUB_TYPE_LABEL } from "@/lib/io/glossary";
import { tint } from "@/lib/mes/colorUtils";
import { formatKstDateTime } from "@/lib/mes/format";
import { reservationStatusLabel } from "../_warehouse_v2/WorkReservationNotice";
import {
  IO_WORK_TYPES,
  lineTagLabel,
} from "../_warehouse_v2/ioWorkType";

interface Props {
  draft: IoBatch;
  isBusy: boolean;
  onContinue: () => void;
  onRequestDelete: () => void;
}

const TAG_TONE: Record<string, string> = {
  blue: LEGACY_COLORS.blue,
  green: LEGACY_COLORS.green,
  red: LEGACY_COLORS.red,
  purple: LEGACY_COLORS.purple,
  muted: LEGACY_COLORS.muted2,
};

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function formatQty(qty: number | string | null | undefined): string {
  const n = typeof qty === "number" ? qty : Number(qty);
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return String(parseFloat(n.toFixed(4)));
}

const BUCKET_LABEL: Record<string, string> = {
  warehouse: "창고",
  production: "공정",
  defective: "불량",
};

function placeLabel(dept: unknown, bucket: unknown): string | null {
  const d = asString(dept);
  if (d) return d;
  const b = asString(bucket);
  if (b && b !== "none" && BUCKET_LABEL[b]) return BUCKET_LABEL[b];
  return null;
}

function placeArrow(
  fromDept: unknown,
  fromBucket: unknown,
  toDept: unknown,
  toBucket: unknown,
): string | null {
  const from = placeLabel(fromDept, fromBucket);
  const to = placeLabel(toDept, toBucket);
  if (from && to) return from === to ? from : `${from} → ${to}`;
  return from ?? to;
}

export function IoDraftWorkCard({
  draft,
  isBusy,
  onContinue,
  onRequestDelete,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const latestRejection = draft.status === "draft"
    ? (draft.stock_requests ?? [])
      .filter((request) => request.status === "rejected" && request.rejected_at)
      .sort((left, right) =>
        new Date(right.rejected_at!).getTime() - new Date(left.rejected_at!).getTime(),
      )[0]
    : undefined;

  const meta = useMemo(() => {
    const qty = draft.bundles.reduce(
      (sum, b) => sum + (Number(b.quantity) || 0),
      0,
    );
    const lines = draft.bundles.reduce((sum, b) => sum + (b.lines?.length ?? 0), 0);
    const firstIncludedLine = draft.bundles
      .flatMap((bundle) => bundle.lines ?? [])
      .find((line) => line.included);
    const useLineLocations =
      (draft.sub_type === "warehouse_to_dept" || draft.sub_type === "dept_to_warehouse") &&
      firstIncludedLine;
    const dept = placeArrow(
      useLineLocations ? firstIncludedLine.from_department : draft.from_department,
      useLineLocations ? firstIncludedLine.from_bucket : null,
      useLineLocations ? firstIncludedLine.to_department : draft.to_department,
      useLineLocations ? firstIncludedLine.to_bucket : null,
    );
    const sub = SUB_TYPE_LABEL[draft.sub_type];
    const work = IO_WORK_TYPES.find((w) => w.id === draft.work_type) ?? null;
    let shortage = 0;
    for (const b of draft.bundles) {
      for (const l of b.lines ?? []) {
        if (l.included && Number(l.shortage) > 0) shortage += 1;
      }
    }
    const startedText = formatKstDateTime(draft.created_at);
    return {
      totalQty: qty,
      lineCount: lines,
      deptLabel: dept,
      subLabel: sub,
      workMeta: work,
      shortageCount: shortage,
      startedText,
    };
  }, [draft]);

  const accent = LEGACY_COLORS.blue;

  return (
    // P3-1: 카드 컨테이너의 role="button" 제거 — 내부에 별도 액션 버튼(이어서 작업/삭제) 이
    // 있어 nested interactive 패턴이었다. 펼치기는 헤더의 명시적 토글 버튼으로 분리.
    <article
      className="rounded-[20px] border p-4"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      aria-label={`작업 카드: ${meta.workMeta?.label ?? "입출고"}, ${meta.subLabel ?? "작업 내용 확인"}`}
    >
      {/* 헤더: work_type 칩 + 펼치기 토글 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {meta.workMeta && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ background: tint(accent, 14), color: accent }}
            >
              <meta.workMeta.icon className="h-4 w-4" />
              {meta.subLabel}
            </span>
          )}
          <span
            className="break-keep text-xs font-medium [overflow-wrap:anywhere]"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            {meta.workMeta?.label}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "자재 목록 접기" : "자재 목록 펼치기"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] transition hover:bg-[var(--c-s2)] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-blue)]"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* 묶음 제목 — 모든 묶음을 한 줄씩 나열 */}
      <p className="mt-2 inline-flex min-h-6 items-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ color: draft.reservation_status === "needs_reservation" ? LEGACY_COLORS.yellow : draft.reservation_status === "reserved" ? LEGACY_COLORS.purple : LEGACY_COLORS.muted2,
        background: draft.reservation_status === "needs_reservation" ? LEGACY_COLORS.warningBg : draft.reservation_status === "reserved" ? tint(LEGACY_COLORS.purple, 12) : LEGACY_COLORS.s2 }}>{reservationStatusLabel(draft)}</p>
      {draft.reservation_issue && <p className="mt-2 rounded-[12px] px-3 py-2 text-sm leading-6" style={{ color: LEGACY_COLORS.yellow, background: LEGACY_COLORS.warningBg }}>{reservationIssueMessage(draft.reservation_issue)}</p>}
      <ul className="mt-3 space-y-2">
        {draft.bundles.map((b) => {
          const parentLine =
            b.source_kind === "bom_parent"
              ? (b.lines ?? []).find((l) => l.origin === "direct")
              : null;
          const displayQty = parentLine
            ? Number(parentLine.quantity) || 0
            : Number(b.quantity) || 0;
          return (
            <li
              key={b.bundle_id}
              className="flex items-baseline justify-between gap-3 text-base font-semibold leading-6"
              style={{ color: LEGACY_COLORS.text }}
            >
              <span className="min-w-0 break-keep [overflow-wrap:anywhere]">{b.title}</span>
              <span
                className="shrink-0 tabular-nums text-lg font-semibold leading-6"
                style={{ color: accent }}
              >
                {formatQty(displayQty)}
                <span className="ml-1 text-xs font-medium">EA</span>
              </span>
            </li>
          );
        })}
      </ul>

      {/* 메트릭: 총 수량 + 자재 종수 + 부서 (제목보다 약하게 — 보조 정보) */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>
        <span>
          총 <span className="tabular-nums" style={{ color: LEGACY_COLORS.text }}>{formatQty(meta.totalQty)}</span>개
        </span>
        <span aria-hidden>·</span>
        <span>구성 {meta.lineCount}종</span>
        {meta.deptLabel && (
          <>
            <span aria-hidden>·</span>
            <span>{meta.deptLabel}</span>
          </>
        )}
      </div>

      {/* 시간 · 부족 경고 */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span
          className="text-xs font-medium tabular-nums"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          {meta.startedText} 작업 시작
        </span>
      {meta.shortageCount > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ background: tint(LEGACY_COLORS.red, 12), color: LEGACY_COLORS.red }}
          >
            <AlertTriangle className="h-4 w-4" />
            자재 {meta.shortageCount}종 부족
          </span>
      )}
      </div>

      {latestRejection?.rejected_reason && (
        <div
          className="mt-3 rounded-[12px] border px-3 py-2 text-sm leading-6"
          style={{
            background: tint(LEGACY_COLORS.red, 8),
            borderColor: tint(LEGACY_COLORS.red, 25),
            color: LEGACY_COLORS.red,
          }}
        >
          <p className="break-keep font-semibold [overflow-wrap:anywhere]">반려 사유: {latestRejection.rejected_reason}</p>
          <p className="mt-1 text-xs">
            {latestRejection.rejected_by_name ?? "결재자"} · {formatKstDateTime(latestRejection.rejected_at)}
          </p>
        </div>
      )}

      {/* 펼침: 자재 목록 */}
      {expanded && (
        <div
          role="region"
          aria-label="작업 자재 목록"
          tabIndex={0}
          className="mt-4 max-h-[360px] overflow-y-auto overscroll-contain border-t pt-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
          style={{ borderColor: LEGACY_COLORS.border }}
        >
          {draft.bundles.map((bundle, idx) => (
            <div key={bundle.bundle_id} className={idx > 0 ? "mt-3" : undefined}>
              {draft.bundles.length > 1 && (
                <p
                  className="mb-2 break-keep text-sm font-semibold [overflow-wrap:anywhere]"
                  style={{ color: LEGACY_COLORS.text }}
                >
                  {bundle.title}{" "}
                  <span style={{ color: LEGACY_COLORS.muted2 }}>
                    ×{formatQty(bundle.quantity)}
                  </span>
                </p>
              )}
              <ul className="space-y-2">
                {(bundle.lines ?? []).map((line) => (
                  <DraftLineRow
                    key={line.line_id}
                    line={line}
                    subType={draft.sub_type}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* 액션 */}
      <div className="mt-4 flex justify-end gap-2 border-t pt-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <button
          type="button"
          aria-label="이어서 작업"
          disabled={isBusy}
          onClick={onContinue}
          className="min-h-11 rounded-[12px] border px-4 text-sm font-semibold transition active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-blue)] disabled:opacity-50"
          style={{
            background: tint(accent, 10),
            borderColor: LEGACY_COLORS.borderStrong,
            color: accent,
          }}
        >
          이어서 작업
        </button>
        <button
          type="button"
          aria-label="작업 삭제"
          disabled={isBusy}
          onClick={onRequestDelete}
          className="min-h-11 min-w-11 rounded-[12px] px-4 text-sm font-semibold transition active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-blue)] disabled:opacity-50"
          style={{
            background: tint(LEGACY_COLORS.red, 10),
            color: LEGACY_COLORS.red,
          }}
        >
          삭제
        </button>
      </div>
    </article>
  );
}

function DraftLineRow({ line, subType }: { line: IoLine; subType: IoSubType }) {
  const tag = lineTagLabel(line, subType);
  const tone = TAG_TONE[tag.tone] ?? LEGACY_COLORS.muted2;
  const shortage = Number(line.shortage) > 0;
  const excluded = !line.included;

  const dirArrow = placeArrow(
    line.from_department,
    line.from_bucket,
    line.to_department,
    line.to_bucket,
  );

  return (
    <li
      className="rounded-[12px] border px-3 py-2 text-sm"
      style={{
        background: shortage ? LEGACY_COLORS.errorBg : LEGACY_COLORS.s2,
        borderColor: LEGACY_COLORS.border,
        textDecoration: excluded ? "line-through" : "none",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 break-keep font-medium leading-6 [overflow-wrap:anywhere]" style={{ color: excluded ? LEGACY_COLORS.muted2 : LEGACY_COLORS.text }}>{line.item_name}</span>
        <span className="shrink-0 font-semibold leading-6 tabular-nums" style={{ color: shortage ? LEGACY_COLORS.red : LEGACY_COLORS.text }}>×{formatQty(line.quantity)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
        <span className="break-keep font-mono [overflow-wrap:anywhere]">{line.mes_code ?? "—"}</span>
        <span className="rounded-full px-2 py-0.5 font-medium" style={{ background: tint(tone, 12), color: tone }}>{tag.text}</span>
        {dirArrow && <span>{dirArrow}</span>}
      </div>
    </li>
  );
}
