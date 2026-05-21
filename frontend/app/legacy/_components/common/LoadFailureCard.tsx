"use client";

import { memo } from "react";
import { AlertTriangle } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";

interface Props {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  prefix?: string;
}

function LoadFailureCardImpl({
  message,
  onRetry,
  retryLabel = "동기화",
  prefix = "데이터를 불러오지 못했습니다",
}: Props) {
  const handleRetry = onRetry ?? (() => window.location.reload());
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-[14px] border px-4 py-3 text-sm"
      style={{
        background: `color-mix(in srgb, ${LEGACY_COLORS.red} 10%, transparent)`,
        borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 35%, transparent)`,
        color: LEGACY_COLORS.red,
      }}
      role="alert"
    >
      <div className="flex min-w-0 items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="truncate font-bold">
          {prefix} — {message}
        </span>
      </div>
      <button
        type="button"
        onClick={handleRetry}
        className="shrink-0 rounded-[10px] border px-3 py-1.5 text-xs font-bold transition-colors hover:brightness-125"
        style={{
          borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 40%, transparent)`,
          color: LEGACY_COLORS.red,
          background: "transparent",
        }}
      >
        {retryLabel}
      </button>
    </div>
  );
}

export const LoadFailureCard = memo(LoadFailureCardImpl);
