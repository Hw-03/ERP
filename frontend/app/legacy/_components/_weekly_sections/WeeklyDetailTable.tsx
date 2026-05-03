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
        title="해당 공정의 품목이 없습니다"
        description="품목 마스터에 해당 공정 코드가 등록된 품목이 없거나 아직 재고가 없습니다."
        compact
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 6px", minWidth: 700 }}>
        <thead>
          <tr>
            {["ERP 코드", "품명", "전주재고", "생산/입고", "출고/소비", "현재재고", "증감"].map(
              (h, i) => (
                <th
                  key={h}
                  className="text-[11px] font-bold"
                  style={{
                    color: LEGACY_COLORS.muted,
                    textAlign: i < 2 ? "left" : "right",
                    padding: "0 10px 6px",
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
                {/* ERP 코드 */}
                <td
                  className="rounded-l-[14px] border-y border-l py-3 pl-3 pr-2 text-[12px] font-black"
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
                  className="border-y px-2 py-3 text-[12px] font-bold"
                  style={{
                    background: LEGACY_COLORS.s1,
                    borderColor: LEGACY_COLORS.border,
                    color: LEGACY_COLORS.text,
                    minWidth: 200,
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
                  className="rounded-r-[14px] border-y border-r px-2 py-3 text-right text-[13px] font-black"
                  style={{
                    background: LEGACY_COLORS.s1,
                    borderColor: LEGACY_COLORS.border,
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
  );
}

function Num({ val, muted }: { val: number; muted?: boolean }) {
  return (
    <td
      className="border-y px-2 py-3 text-right text-[12px] font-bold"
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
