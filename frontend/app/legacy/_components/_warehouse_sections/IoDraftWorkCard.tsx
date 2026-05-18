"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import type { IoBatch, IoLine, IoSubType } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import {
  IO_WORK_TYPES,
  deptIoDisplayLabel,
  lineTagLabel,
  subTypeLabel,
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

// 백엔드(services/io.py)가 datetime.utcnow() 로 timezone-naive UTC 를 저장하므로
// 응답 ISO 문자열에 "Z" 가 없으면 UTC 로 간주하고 보정.
// TODO(backend UTC 정리 후 제거): datetime.now(timezone.utc) 전환 완료 시 이 함수 불필요.
function parseServerTime(iso: string): number {
  const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(iso);
  return new Date(hasTz ? iso : iso + "Z").getTime();
}

function formatRelative(iso: string): string {
  const diff = Date.now() - parseServerTime(iso);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return `${day}일 전`;
}

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

  const meta = useMemo(() => {
    const qty = draft.bundles.reduce(
      (sum, b) => sum + (Number(b.quantity) || 0),
      0,
    );
    const lines = draft.bundles.reduce((sum, b) => sum + (b.lines?.length ?? 0), 0);
    const dept = placeArrow(
      draft.from_department,
      null,
      draft.to_department,
      null,
    );
    const sub = deptIoDisplayLabel(draft.sub_type) ?? subTypeLabel(draft.sub_type);
    const work = IO_WORK_TYPES.find((w) => w.id === draft.work_type) ?? null;
    let shortage = 0;
    for (const b of draft.bundles) {
      for (const l of b.lines ?? []) {
        if (l.included && Number(l.shortage) > 0) shortage += 1;
      }
    }
    const startedText = formatRelative(draft.created_at);
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
    <div
      role="button"
      tabIndex={0}
      onClick={() => setExpanded((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setExpanded((v) => !v);
        }
      }}
      className="cursor-pointer rounded-2xl border p-4 transition-colors hover:bg-black/[0.02]"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      {/* 헤더: work_type 칩 + 펼치기 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {meta.workMeta && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black"
              style={{ background: tint(accent, 14), color: accent }}
            >
              <meta.workMeta.icon className="h-3.5 w-3.5" />
              {meta.workMeta.label}
            </span>
          )}
          <span
            className="truncate text-[12px] font-bold"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            {meta.subLabel}
          </span>
        </div>
        <span
          className="shrink-0 rounded-[8px] p-1"
          style={{ color: LEGACY_COLORS.muted2 }}
          aria-hidden
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </span>
      </div>

      {/* 묶음 제목 — 모든 묶음을 한 줄씩 나열 */}
      <ul className="mt-2 space-y-0.5">
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
              className="flex items-baseline gap-2 overflow-hidden text-base font-black leading-tight"
              style={{ color: LEGACY_COLORS.text }}
            >
              <span className="min-w-0 truncate">{b.title}</span>
              <span
                className="shrink-0 tabular-nums text-lg font-black leading-none"
                style={{ color: accent }}
              >
                {formatQty(displayQty)}
                <span className="ml-0.5 text-sm font-black">EA</span>
              </span>
            </li>
          );
        })}
      </ul>

      {/* 메트릭: 총 수량 + 자재 종수 + 부서 (제목보다 약하게 — 보조 정보) */}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
        <span>
          총 <span className="tabular-nums" style={{ color: LEGACY_COLORS.text }}>{formatQty(meta.totalQty)}</span>개
        </span>
        <span aria-hidden>·</span>
        <span>자재 {meta.lineCount}종</span>
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
          className="text-[11px] font-semibold"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          {meta.startedText} 작업 시작
        </span>
        {meta.shortageCount > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black"
            style={{ background: tint(LEGACY_COLORS.red, 12), color: LEGACY_COLORS.red }}
          >
            <AlertTriangle className="h-3 w-3" />
            자재 {meta.shortageCount}종 부족
          </span>
        )}
      </div>

      {/* 펼침: 자재 목록 */}
      {expanded && (
        <div
          className="mt-3 border-t pt-3"
          style={{ borderColor: LEGACY_COLORS.border }}
          onClick={(e) => e.stopPropagation()}
        >
          {draft.bundles.map((bundle, idx) => (
            <div key={bundle.bundle_id} className={idx > 0 ? "mt-3" : undefined}>
              {draft.bundles.length > 1 && (
                <p
                  className="mb-1 text-[12px] font-black"
                  style={{ color: LEGACY_COLORS.text }}
                >
                  {bundle.title}{" "}
                  <span style={{ color: LEGACY_COLORS.muted2 }}>
                    ×{formatQty(bundle.quantity)}
                  </span>
                </p>
              )}
              <ul className="space-y-1">
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
      <div
        className="mt-3 flex flex-wrap justify-end gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="이어서 작업"
          disabled={isBusy}
          onClick={onContinue}
          className="rounded-[10px] border px-3 py-1.5 text-xs font-black disabled:opacity-50"
          style={{
            background: LEGACY_COLORS.s1,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
        >
          이어서 작업
        </button>
        <button
          type="button"
          aria-label="작업 삭제"
          disabled={isBusy}
          onClick={onRequestDelete}
          className="rounded-[10px] px-3 py-1.5 text-xs font-black disabled:opacity-50"
          style={{
            background: tint(LEGACY_COLORS.red, 10),
            color: LEGACY_COLORS.red,
          }}
        >
          삭제
        </button>
      </div>
    </div>
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
      className="flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-[12px]"
      style={{
        background: shortage ? tint(LEGACY_COLORS.red, 8) : "transparent",
        opacity: excluded ? 0.45 : 1,
        textDecoration: excluded ? "line-through" : "none",
      }}
    >
      <span
        className="shrink-0 font-mono text-[11px] font-bold"
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        {line.erp_code ?? "—"}
      </span>
      <span
        className="min-w-0 flex-1 truncate font-bold"
        style={{ color: LEGACY_COLORS.text }}
      >
        {line.item_name}
      </span>
      <span
        className="shrink-0 font-black"
        style={{ color: shortage ? LEGACY_COLORS.red : LEGACY_COLORS.text }}
      >
        ×{formatQty(line.quantity)}
      </span>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black"
        style={{ background: tint(tone, 12), color: tone }}
      >
        {tag.text}
      </span>
      {dirArrow && (
        <span
          className="shrink-0 text-[11px] font-semibold"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          {dirArrow}
        </span>
      )}
    </li>
  );
}
