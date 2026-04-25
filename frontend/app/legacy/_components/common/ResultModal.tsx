"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { LEGACY_COLORS } from "../legacyUi";

export type ResultKind = "success" | "partial" | "fail";

interface PrimaryAction {
  label: string;
  onClick: () => void;
  tone?: "warning" | "danger" | "success" | "info";
}

interface Props {
  open: boolean;
  kind: ResultKind;
  onClose: () => void;
  title?: string;
  successCount?: number;
  failures?: { name: string; reason: string }[];
  partialNote?: string;
  closeLabel?: string;
  primaryAction?: PrimaryAction;
}

const TONE_BY_ACTION: Record<NonNullable<PrimaryAction["tone"]>, string> = {
  warning: LEGACY_COLORS.yellow,
  danger: LEGACY_COLORS.red,
  success: LEGACY_COLORS.green,
  info: LEGACY_COLORS.blue,
};

export function ResultModal({
  open,
  kind,
  onClose,
  title,
  successCount = 0,
  failures = [],
  partialNote,
  closeLabel = "닫기",
  primaryAction,
}: Props) {
  if (!open) return null;

  const headerTone =
    kind === "success" ? LEGACY_COLORS.green : kind === "partial" ? LEGACY_COLORS.yellow : LEGACY_COLORS.red;
  const HeaderIcon = kind === "success" ? CheckCircle2 : AlertTriangle;
  const computedTitle =
    title ??
    (kind === "success"
      ? `처리 완료 — ${successCount}건`
      : kind === "partial"
        ? `처리 결과 — 성공 ${successCount}건 / 실패 ${failures.length}건`
        : "실행 실패");

  const note =
    kind === "partial"
      ? partialNote ??
        `성공한 ${successCount}건은 이미 처리되었습니다. 실패 항목만 다시 시도할 수 있습니다.`
      : null;

  return (
    <div
      className="fixed inset-0 z-[450] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,.55)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-[560px] rounded-[24px] border p-6"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: `color-mix(in srgb, ${headerTone} 50%, transparent)`,
          boxShadow: "var(--c-card-shadow)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <HeaderIcon className="h-5 w-5" style={{ color: headerTone }} />
          <div className="text-lg font-black" style={{ color: LEGACY_COLORS.text }}>
            {computedTitle}
          </div>
        </div>

        {note && (
          <div
            className="mb-4 rounded-[12px] border px-3 py-2 text-xs font-bold"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 10%, transparent)`,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 40%, transparent)`,
              color: LEGACY_COLORS.yellow,
            }}
          >
            {note}
          </div>
        )}

        {failures.length > 0 && (
          <div
            className="mb-5 max-h-[260px] overflow-y-auto rounded-[14px] border"
            style={{
              borderColor: LEGACY_COLORS.border,
              background: LEGACY_COLORS.s2,
              overscrollBehavior: "contain",
            }}
          >
            <ul className="divide-y" style={{ borderColor: LEGACY_COLORS.border }}>
              {failures.map((f, idx) => (
                <li
                  key={`${f.name}-${idx}`}
                  className="flex flex-col gap-1 px-3 py-2.5"
                  style={{ borderColor: LEGACY_COLORS.border }}
                >
                  <span className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
                    {f.name}
                  </span>
                  <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                    {f.reason}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[14px] border px-5 py-2.5 text-sm font-bold transition-colors hover:brightness-125"
            style={{
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.muted2,
              background: LEGACY_COLORS.s2,
            }}
          >
            {closeLabel}
          </button>
          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.onClick}
              className="rounded-[14px] px-5 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99]"
              style={{
                background: TONE_BY_ACTION[primaryAction.tone ?? (kind === "partial" ? "warning" : "danger")],
              }}
            >
              {primaryAction.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
