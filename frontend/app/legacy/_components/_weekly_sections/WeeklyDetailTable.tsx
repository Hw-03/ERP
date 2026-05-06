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
      <div className="overflow-x-auto">
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 3px", minWidth: 680 }}>
          <thead>
            {/* 컬럼 그룹 헤더 */}
            <tr>
              <th
                colSpan={2}
                className="pb-0.5 pl-3 pt-2 text-left text-[10px] font-bold"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                기본 정보
              </th>
              <th
                colSpan={1}
                className="pb-0.5 px-2 pt-2 text-right text-[10px] font-bold"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                전주
              </th>
              <th
                colSpan={2}
                className="pb-0.5 px-2 pt-2 text-right text-[10px] font-bold"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                이번주 변동
              </th>
              <th
                colSpan={2}
                className="pb-0.5 px-2 pt-2 text-right text-[10px] font-bold"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                결과
              </th>
            </tr>
            <tr>
              {["품목 코드", "품명", "전주 재고", "생산 내역", "출고 내역", "현재 재고", "증감"].map(
                (h, i) => (
                  <th
                    key={h}
                    className="text-[13px] font-bold"
                    style={{
                      color: LEGACY_COLORS.muted2,
                      textAlign: i < 2 ? "left" : "right",
                      padding: "0 10px 8px",
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
                    className="rounded-l-[12px] border-y border-l py-3 pl-3 pr-2 text-[13px] font-bold"
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
                    className="border-y px-2 py-3 text-[14px] font-bold"
                    style={{
                      background: rowBg,
                      borderColor: rowBorder,
                      color: LEGACY_COLORS.text,
                      maxWidth: 220,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.item_name}
                  </td>
                  {/* 전주 재고 */}
                  <Num val={row.prev_qty} bg={rowBg} border={rowBorder} muted />
                  {/* 생산 내역 */}
                  <Num val={row.in_qty} bg={rowBg} border={rowBorder} />
                  {/* 출고 내역 */}
                  <Num val={row.out_qty} bg={rowBg} border={rowBorder} />
                  {/* 현재 재고 */}
                  <Num val={row.current_qty} bg={rowBg} border={rowBorder} />
                  {/* 증감 */}
                  <td
                    className="rounded-r-[12px] border-y border-r px-2 py-3 text-right text-[14px] font-black"
                    style={{
                      background: rowBg,
                      borderColor: rowBorder,
                      color:
                        delta > 0
                          ? LEGACY_COLORS.green
                          : delta < 0
                          ? LEGACY_COLORS.red
                          : LEGACY_COLORS.muted,
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
  muted,
}: {
  val: number;
  bg: string;
  border: string;
  muted?: boolean;
}) {
  return (
    <td
      className="border-y px-2 py-3 text-right text-[14px] font-bold"
      style={{
        background: bg,
        borderColor: border,
        color: muted ? LEGACY_COLORS.muted : LEGACY_COLORS.text,
        whiteSpace: "nowrap",
      }}
    >
      {formatQty(val)}
    </td>
  );
}

export const WeeklyDetailTable = memo(WeeklyDetailTableImpl);
