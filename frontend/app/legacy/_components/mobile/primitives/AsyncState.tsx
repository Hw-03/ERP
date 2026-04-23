"use client";

import clsx from "clsx";
import { AlertCircle, RefreshCw } from "lucide-react";
import { LEGACY_COLORS } from "../../legacyUi";
import { TYPO } from "../tokens";

export function AsyncState({
  loading,
  error,
  empty,
  skeleton,
  emptyView,
  onRetry,
  children,
}: {
  loading: boolean;
  error?: string | null;
  empty?: boolean;
  skeleton?: React.ReactNode;
  emptyView?: React.ReactNode;
  onRetry?: () => void;
  children: React.ReactNode;
}) {
  if (error) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-[20px] border px-5 py-8 text-center"
        style={{
          background: "rgba(242,95,92,.08)",
          borderColor: "rgba(242,95,92,.28)",
        }}
      >
        <AlertCircle size={22} color={LEGACY_COLORS.red} />
        <div className={clsx(TYPO.body, "font-semibold")} style={{ color: LEGACY_COLORS.red }}>
          {error}
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={clsx(
              TYPO.caption,
              "flex items-center gap-1 rounded-full border px-3 py-[6px] font-semibold active:scale-95",
            )}
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
          >
            <RefreshCw size={12} /> 다시 시도
          </button>
        ) : null}
      </div>
    );
  }

  if (loading) {
    return <>{skeleton ?? <AsyncSkeletonRows />}</>;
  }

  if (empty) {
    return <>{emptyView ?? null}</>;
  }

  return <>{children}</>;
}

export function AsyncSkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-[68px] rounded-[20px] border animate-pulse"
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            opacity: 0.7 - i * 0.1,
          }}
        />
      ))}
    </div>
  );
}
