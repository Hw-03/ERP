"use client";

import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { LEGACY_COLORS } from "@/lib/mes/color";

export type EmptyStateVariant = "no-data" | "no-search-result" | "filtered-out";

const VARIANT_DEFAULTS: Record<EmptyStateVariant, { title: string; description?: string }> = {
  "no-data": {
    title: "표시할 데이터가 없습니다",
    description: "데이터를 등록하면 이곳에 표시됩니다.",
  },
  "no-search-result": {
    title: "검색 결과가 없습니다",
    description: "검색어를 다시 확인하거나 필터를 조정해 보세요.",
  },
  "filtered-out": {
    title: "필터로 모든 항목이 가려졌습니다",
    description: "필터를 해제하면 다시 표시됩니다.",
  },
};

interface Props {
  variant?: EmptyStateVariant;
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: { label: string; onClick: () => void };
  compact?: boolean;
  className?: string;
  comfortable?: boolean;
  prominent?: boolean;
  illustrated?: boolean;
}

function EmptyStateImpl({
  variant = "no-data",
  title,
  description,
  icon,
  action,
  compact = false,
  className = "",
  comfortable = false,
  prominent = false,
  illustrated = false,
}: Props) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState("small");
  useEffect(() => {
    if (!illustrated || !areaRef.current || typeof ResizeObserver === "undefined") return;
    // Measure the available frame, not the artwork, so resizing cannot grow its own container.
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize(!compact && width >= 480 && height >= 420 ? "large" : height >= 300 ? "medium" : "small");
    });
    observer.observe(areaRef.current);
    return () => observer.disconnect();
  }, [illustrated, compact]);
  const fallback = VARIANT_DEFAULTS[variant];
  const finalTitle = title ?? fallback.title;
  const finalDescription = description ?? fallback.description;

  const content = (
    <>
      {illustrated ? <Image src="/images/dexray/history-empty.webp" alt="" width={540} height={360} className="dexray-empty-mascot hidden object-contain lg:block" /> : icon && <div className={prominent ? "opacity-100" : "opacity-70"}>{icon}</div>}
      <div className={`dexray-empty-title ${prominent ? "text-2xl" : compact ? "text-sm" : "text-base"} font-bold`} style={{ color: LEGACY_COLORS.text }}>
        {finalTitle}
      </div>
      {finalDescription && (
        <div className={`dexray-empty-description ${prominent ? "text-base" : comfortable ? "text-sm" : compact ? "text-[11px]" : "text-xs"}`} style={{ color: LEGACY_COLORS.muted2 }}>
          {finalDescription}
        </div>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`standard-hover rounded-[12px] border font-bold transition-colors ${prominent ? "mt-1 min-h-12 px-5 py-2.5 text-base" : `mt-2 px-3 py-1.5 ${comfortable ? "min-h-11 text-sm" : "text-xs"}`}`}
          style={{
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 30%, ${LEGACY_COLORS.border})`,
            color: LEGACY_COLORS.blue,
            background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent)`,
          }}
        >
          {action.label}
        </button>
      )}
    </>
  );
  return (
    <div ref={areaRef} data-empty-size={illustrated ? size : undefined}
      className={`flex flex-col items-center justify-center text-center ${illustrated ? `dexray-empty-state py-6 lg:py-0 ${compact ? "dexray-empty-compact" : ""}` : prominent ? "gap-4 px-8 py-12" : `gap-2 ${compact ? "py-6" : "py-12"}`} ${className}`}
      style={{ color: LEGACY_COLORS.muted2 }}>
      {illustrated ? <div className="dexray-empty-content flex flex-col items-center justify-center gap-2">{content}</div> : content}
    </div>
  );
}

export const EmptyState = memo(EmptyStateImpl);
