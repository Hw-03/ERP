"use client";

import { memo } from "react";
import { LEGACY_COLORS } from "../legacyUi";

type Variant = "table" | "card" | "list";

interface Props {
  variant?: Variant;
  rows?: number;
  className?: string;
}

function LoadingSkeletonImpl({ variant = "list", rows = 4, className = "" }: Props) {
  const items = Array.from({ length: Math.max(1, rows) });

  if (variant === "table") {
    return (
      <div
        className={`overflow-hidden rounded-[16px] border ${className}`}
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        {items.map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[24px_1fr_1fr_80px_80px] items-center gap-3 px-4 py-3"
            style={{ borderBottom: i === items.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}
          >
            <Bar w="full" h={14} />
            <Bar w="80%" h={12} />
            <Bar w="60%" h={12} />
            <Bar w="full" h={12} />
            <Bar w="full" h={12} />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className={`grid gap-3 ${className}`} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {items.map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-[16px] border p-4"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            <Bar w="50%" h={10} />
            <Bar w="80%" h={20} />
            <Bar w="40%" h={10} />
          </div>
        ))}
      </div>
    );
  }

  // list
  return (
    <div
      className={`flex flex-col gap-2 rounded-[16px] border p-3 ${className}`}
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      {items.map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div
            className="h-7 w-7 shrink-0 animate-pulse rounded-full"
            style={{ background: LEGACY_COLORS.s3 }}
          />
          <div className="flex-1 space-y-1.5">
            <Bar w="60%" h={12} />
            <Bar w="40%" h={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

export const LoadingSkeleton = memo(LoadingSkeletonImpl);

function Bar({ w, h }: { w: string; h: number }) {
  return (
    <div
      className="animate-pulse rounded"
      style={{
        width: w === "full" ? "100%" : w,
        height: h,
        background: LEGACY_COLORS.s3,
      }}
    />
  );
}
