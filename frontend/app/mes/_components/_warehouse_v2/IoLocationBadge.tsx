import type { ReactElement } from "react";
import { MapPin } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";

interface Props {
  label: string;
  value: string;
  variant?: "badge" | "field";
}

/** 읽기 전용 재고 위치를 입출고 의미에 맞는 제목으로 표시한다. */
export function IoLocationBadge({ label, value, variant = "badge" }: Props): ReactElement {
  if (variant === "field") {
    return (
      <span
        aria-label={`${label}: ${value}`}
        className="inline-flex min-w-[112px] max-w-[224px] shrink-0 flex-col items-center gap-0.5"
      >
        <span
          className="text-xs font-bold uppercase tracking-[1.5px]"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          {label}
        </span>
        <span
          className="flex h-11 min-h-[44px] w-full items-center justify-center rounded-[10px] border px-3"
          style={{
            background: tint(LEGACY_COLORS.blue, 10),
            borderColor: tint(LEGACY_COLORS.blue, 30),
            color: LEGACY_COLORS.blue,
          }}
        >
          <span className="inline-flex min-w-0 -translate-x-1 items-center justify-center gap-1.5">
            <MapPin aria-hidden="true" className="h-4 w-4 shrink-0" />
            <strong className="min-w-0 break-words text-center text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
              {value}
            </strong>
          </span>
        </span>
      </span>
    );
  }

  return (
    <span
      aria-label={`${label}: ${value}`}
      className="inline-flex min-w-[112px] shrink-0 items-center justify-center gap-2 rounded-[12px] border px-3 py-2"
      style={{
        background: tint(LEGACY_COLORS.blue, 10),
        borderColor: tint(LEGACY_COLORS.blue, 30),
        color: LEGACY_COLORS.blue,
      }}
    >
      <MapPin aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="flex flex-col items-start leading-tight">
        <span className="text-xs font-bold">{label}</span>
        <strong className="text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
          {value}
        </strong>
      </span>
    </span>
  );
}
