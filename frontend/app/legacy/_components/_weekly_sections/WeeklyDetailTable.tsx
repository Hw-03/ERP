"use client";

import { memo } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { WeeklyGroupReport } from "@/lib/api/types/weekly";
import { EmptyState } from "../common/EmptyState";

function fmt(n: number) {
  return Number(n).toLocaleString("ko-KR");
}

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
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 4px", minWidth: 680 }}>
          <thead>
            <tr>
              {["품목 코드", "품명", "전주재고", "생산/입고", "출고/소비", "현재재고", "증감"].map(
                (h, i) => (
                  <th
                    key={h}
                    className="text-[11px] font-bold"
                    style={{
                      color: LEGACY_COLORS.muted,
                      textAlign: i < 2 ? "left" : "right",
                      padding: "0 10px 4px",
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
            {group.items.map((row) => {
              const delta = Number(row.delta);
              return (
                <tr key={row.item_id}>
                  {/* 품목 코드 */}
                  <td
                    className="rounded-l-[12px] border-y border-l py-2.5 pl-3 pr-2 text-[12px] font-black"
                    style={{
                      background: LEGACY_COLORS.s1,
                      borderColor: LEGACY_COLORS.border,
                      color: LEGACY_COLORS.blue,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.erp_code ?? "—"}
                  </td>
                  {/* 품명 */}
                  <td
                    className="border-y px-2 py-2.5 text-[12px] font-bold"
                    style={{
                      background: LEGACY_COLORS.s1,
                      borderColor: LEGACY_COLORS.border,
                      color: LEGACY_COLORS.text,
                      maxWidth: 220,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.item_name}
                  </td>
                  {/* 전주재고 */}
                  <Num val={Number(row.prev_qty)} muted />
                  {/* 생산/입고 */}
                  <Num val={Number(row.in_qty)} />
                  {/* 출고/소비 */}
                  <Num val={Number(row.out_qty)} />
                  {/* 현재재고 */}
                  <Num val={Number(row.current_qty)} />
                  {/* 증감 */}
                  <td
                    className="rounded-r-[12px] border-y border-r px-2 py-2.5 text-right text-[12px] font-black"
                    style={{
                      background: LEGACY_COLORS.s1,
                      borderColor: delta < 0
                        ? `color-mix(in srgb, ${LEGACY_COLORS.red} 25%, ${LEGACY_COLORS.border})`
                        : LEGACY_COLORS.border,
                      color:
                        delta > 0
                          ? LEGACY_COLORS.green
                          : delta < 0
                          ? LEGACY_COLORS.red
                          : LEGACY_COLORS.muted,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {delta > 0 ? `+${fmt(delta)}` : delta < 0 ? fmt(delta) : "±0"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p
        className="mt-3 text-[11px]"
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        * 전주재고는 현재재고와 선택 주차의 입출고 내역을 기준으로 계산한 값입니다.
      </p>
    </div>
  );
}

function Num({ val, muted }: { val: number; muted?: boolean }) {
  return (
    <td
      className="border-y px-2 py-2.5 text-right text-[12px] font-bold"
      style={{
        background: LEGACY_COLORS.s1,
        borderColor: LEGACY_COLORS.border,
        color: muted ? LEGACY_COLORS.muted : LEGACY_COLORS.text,
        whiteSpace: "nowrap",
      }}
    >
      {Number(val).toLocaleString("ko-KR")}
    </td>
  );
}

export const WeeklyDetailTable = memo(WeeklyDetailTableImpl);
