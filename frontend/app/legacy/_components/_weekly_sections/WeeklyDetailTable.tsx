"use client";

import { memo } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import type { WeeklyGroupReport } from "@/lib/api/types/weekly";
import { EmptyState } from "../common/EmptyState";

interface Props {
  group: WeeklyGroupReport | undefined;
}

function WeeklyDetailTableImpl({ group }: Props) {
  if (!group || group.items.length === 0) {
    return (
      <EmptyState
        variant="no-data"
        title="해당 공정완료품 데이터가 없습니다."
        description="선택한 주차에 집계할 품목 또는 거래 내역이 없습니다."
        compact
      />
    );
  }

  return (
    <div className="flex flex-col gap-0">
      {/* 공정 요약 */}
      <div
        className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 pb-2"
        style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
      >
        <span className="text-[13px] font-bold" style={{ color: LEGACY_COLORS.muted }}>
          {group.dept_name}
        </span>
        <span className="text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
          품목 {group.items.length}건
        </span>
        <span className="text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
          현재 재고 {formatQty(group.current_qty)}
        </span>
        <span
          className="text-[12px]"
          style={{ color: group.in_qty > 0 ? LEGACY_COLORS.green : LEGACY_COLORS.muted2 }}
        >
          생산 {formatQty(group.in_qty)}
        </span>
        <span
          className="text-[12px]"
          style={{ color: group.out_qty > 0 ? LEGACY_COLORS.yellow : LEGACY_COLORS.muted2 }}
        >
          출고 {formatQty(group.out_qty)}
        </span>
        <span
          className="text-[12px]"
          style={{
            color:
              group.delta > 0
                ? LEGACY_COLORS.green
                : group.delta < 0
                ? LEGACY_COLORS.red
                : LEGACY_COLORS.muted2,
          }}
        >
          증감{" "}
          {group.delta > 0
            ? `+${formatQty(group.delta)}`
            : group.delta < 0
            ? formatQty(group.delta)
            : "±0"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 4px", minWidth: 680, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "100px" }} />
            <col />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "11%" }} />
          </colgroup>
          <thead>
            <tr>
              {["품목 코드", "품명", "전주 재고", "생산 내역", "출고 내역", "현재 재고", "증감"].map(
                (h, i) => (
                  <th
                    key={h}
                    className="text-[13px] font-bold"
                    style={{
                      color: LEGACY_COLORS.muted2,
                      textAlign: i < 2 ? "left" : "right",
                      padding: "8px 12px 10px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {group.items.map((row, idx) => {
              const delta = row.delta;
              const isDecreasing = delta < 0;
              const isEvenRow = idx % 2 === 1;
              const rowBg = isDecreasing
                ? `color-mix(in srgb, ${LEGACY_COLORS.red} 4%, ${LEGACY_COLORS.s1})`
                : isEvenRow
                ? `color-mix(in srgb, ${LEGACY_COLORS.s2} 80%, ${LEGACY_COLORS.s1})`
                : LEGACY_COLORS.s1;
              const rowBorder = isDecreasing
                ? `color-mix(in srgb, ${LEGACY_COLORS.red} 22%, ${LEGACY_COLORS.border})`
                : LEGACY_COLORS.border;

              return (
                <tr key={row.item_id}>
                  {/* 품목 코드 */}
                  <td
                    className="rounded-l-[12px] border-y border-l py-3.5 pl-3 pr-3 text-[14px] font-bold"
                    style={{
                      background: rowBg,
                      borderColor: rowBorder,
                      color: LEGACY_COLORS.muted,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.erp_code ?? "—"}
                  </td>
                  {/* 품명 */}
                  <td
                    className="border-y px-3 py-3.5 text-[15px] font-bold"
                    style={{
                      background: rowBg,
                      borderColor: rowBorder,
                      color: LEGACY_COLORS.text,
                      whiteSpace: "normal",
                      wordBreak: "keep-all",
                      lineHeight: 1.35,
                    }}
                    title={row.item_name}
                  >
                    {row.item_name}
                  </td>
                  {/* 전주 재고 */}
                  <Num val={row.prev_qty} bg={rowBg} border={rowBorder} />
                  {/* 생산 내역 */}
                  <Num val={row.in_qty} bg={rowBg} border={rowBorder} color={LEGACY_COLORS.green} />
                  {/* 출고 내역 */}
                  <Num val={row.out_qty} bg={rowBg} border={rowBorder} color={LEGACY_COLORS.yellow} />
                  {/* 현재 재고 */}
                  <Num val={row.current_qty} bg={rowBg} border={rowBorder} />
                  {/* 증감 */}
                  <td
                    className="rounded-r-[12px] border-y border-r pl-3 pr-4 py-3.5 text-right text-[16px] font-black"
                    style={{
                      background: rowBg,
                      borderColor: rowBorder,
                      color:
                        delta > 0
                          ? LEGACY_COLORS.green
                          : delta < 0
                          ? LEGACY_COLORS.red
                          : LEGACY_COLORS.muted2,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {delta > 0 ? `+${formatQty(delta)}` : delta < 0 ? formatQty(delta) : "±0"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Num({
  val,
  bg,
  border,
  color,
}: {
  val: number;
  bg: string;
  border: string;
  color?: string;
}) {
  const c = val === 0 ? LEGACY_COLORS.muted2 : (color ?? LEGACY_COLORS.text);
  return (
    <td
      className="border-y px-3 py-3.5 text-right text-[15px] font-bold"
      style={{
        background: bg,
        borderColor: border,
        color: c,
        whiteSpace: "nowrap",
      }}
    >
      {val === 0 ? "—" : formatQty(val)}
    </td>
  );
}

export const WeeklyDetailTable = memo(WeeklyDetailTableImpl);
