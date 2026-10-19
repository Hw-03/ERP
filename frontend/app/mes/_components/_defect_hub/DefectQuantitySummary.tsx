import type { JSX } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";

interface Props {
  availableLabel: string;
  available: number;
  total: number | null;
  count: number;
  countLabel?: string;
  unit?: string;
}

/** 작업 출처의 가용 재고와 입력 합계를 구분해 두 불량 처리 흐름에서 공유한다. */
export function DefectQuantitySummary({ availableLabel, available, total, count, countLabel = "사유", unit = "EA" }: Props): JSX.Element {
  return (
    <dl aria-label="품목 수량 요약" className="ml-auto grid w-[328px] max-w-full shrink-0 grid-cols-3 gap-y-2 rounded-[12px] px-1 py-3" style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted2 }}>
      {[
        { label: availableLabel, value: formatQty(available), suffix: unit, color: LEGACY_COLORS.text },
        { label: "총 처리 수량", value: total === null ? "—" : formatQty(total), suffix: unit, color: LEGACY_COLORS.red },
        { label: countLabel, value: formatQty(count), suffix: "건", color: LEGACY_COLORS.text },
      ].map(({ label, value, suffix, color }, index) => (
        <div key={label} className={`flex min-w-0 flex-col gap-1 px-1 text-center ${index > 0 ? "border-l" : ""}`} style={{ borderColor: LEGACY_COLORS.border }}>
          <dt className="text-sm font-bold leading-snug">{label}</dt>
          <dd className="m-0 flex flex-wrap items-baseline justify-center gap-1"><span className="break-all text-2xl font-black tabular-nums" style={{ color }}>{value}</span><span className="text-sm font-bold">{suffix}</span></dd>
        </div>
      ))}
    </dl>
  );
}
