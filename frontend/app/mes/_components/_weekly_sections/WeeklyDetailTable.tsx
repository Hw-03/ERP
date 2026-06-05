"use client";

import { memo } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import type { WeeklyGroupReport } from "@/lib/api/types/weekly";
import { EmptyState } from "../common/EmptyState";

// 0 값 de-emphasis — WCAG AA 충족(투명 30% 는 미달) → 솔리드 muted2(5.55:1).
const ZERO_FADE = LEGACY_COLORS.muted2;

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
    <div className="flex flex-col gap-0 min-w-0">
      {/* 공정 요약 */}
      <div
        className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 pb-1.5"
        style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
      >
        <span className="text-[13px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
          {group.dept_name}
          <span
            className="ml-1 text-[11px] font-bold"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            · {group.process_code}
          </span>
        </span>
        <span className="text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
          현재 재고 {formatQty(group.current_qty)}
        </span>
        <span
          className="text-[12px]"
          style={{ color: group.in_qty > 0 ? LEGACY_COLORS.green : ZERO_FADE }}
        >
          생산 {formatQty(group.in_qty)}
        </span>
        <span
          className="text-[12px]"
          style={{ color: group.out_qty > 0 ? LEGACY_COLORS.red : ZERO_FADE }}
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
                : ZERO_FADE,
          }}
        >
          증감{" "}
          {group.delta > 0
            ? `+${formatQty(group.delta)}`
            : group.delta < 0
            ? formatQty(group.delta)
            : "±0"}
        </span>
        <span
          className="ml-auto rounded-[6px] px-2 py-0.5 text-[11px] font-bold tabular-nums"
          style={{
            background: LEGACY_COLORS.s2,
            color: LEGACY_COLORS.muted2,
          }}
        >
          품목 {group.items.length}건
        </span>
      </div>

      {/* 모바일(<lg): 카드 리스트 — 데스크탑 와이드 테이블(minWidth 680)이
          393px 에서 가로 오버플로/스크롤영역 a11y 위반을 일으켜 카드로 대체. */}
      <div className="flex flex-col gap-2 lg:hidden">
        {group.items.map((row) => {
          const d = row.delta;
          const deltaColor =
            d > 0 ? LEGACY_COLORS.green : d < 0 ? LEGACY_COLORS.red : LEGACY_COLORS.muted2;
          return (
            <div
              key={row.item_id}
              className="rounded-[14px] border p-3"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div
                    className="truncate text-sm font-black"
                    style={{ color: LEGACY_COLORS.text }}
                  >
                    {row.item_name}
                  </div>
                  <div
                    className="text-[11px] font-semibold"
                    style={{ color: LEGACY_COLORS.muted2 }}
                  >
                    {row.mes_code ?? "—"}
                  </div>
                </div>
                <div
                  className="shrink-0 text-base font-black tabular-nums"
                  style={{ color: deltaColor }}
                >
                  {d > 0 ? `+${formatQty(d)}` : d < 0 ? formatQty(d) : "±0"}
                </div>
              </div>
              <div
                className="mt-2 grid grid-cols-4 gap-1 text-center text-[11px] font-bold tabular-nums"
              >
                {[
                  { l: "전주", v: row.prev_qty, c: LEGACY_COLORS.muted2 },
                  { l: "생산", v: row.in_qty, c: LEGACY_COLORS.green },
                  { l: "출고", v: row.out_qty, c: LEGACY_COLORS.red },
                  { l: "현재", v: row.current_qty, c: LEGACY_COLORS.text },
                ].map((x) => (
                  <div key={x.l}>
                    <div style={{ color: LEGACY_COLORS.muted2 }}>{x.l}</div>
                    <div
                      className="text-sm"
                      style={{ color: Number(x.v) === 0 ? ZERO_FADE : x.c }}
                    >
                      {Number(x.v) === 0 ? "—" : formatQty(x.v)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="hidden overflow-x-auto lg:block"
        role="region"
        aria-label={`${group.dept_name} 품목 상세`}
        tabIndex={0}
      >
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 2px", minWidth: 680, tableLayout: "fixed" }}>
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
                    scope="col"
                    className="text-[13px] font-bold"
                    style={{
                      color: LEGACY_COLORS.muted2,
                      textAlign: i < 2 ? "left" : "center",
                      padding: "4px 12px 6px",
                      whiteSpace: "nowrap",
                    }}
                    title={
                      h === "전주 재고"
                        ? "현재 재고와 선택 주차 입출고 내역을 기준으로 계산한 값입니다."
                        : undefined
                    }
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
                    className="rounded-l-[12px] border-y border-l py-1.5 pl-3 pr-3 text-[14px] font-bold"
                    style={{
                      background: rowBg,
                      borderColor: rowBorder,
                      color: LEGACY_COLORS.muted,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.mes_code ?? "—"}
                  </td>
                  {/* 품명 */}
                  <td
                    className="border-y px-3 py-1.5 text-[15px] font-bold"
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
                  <Num
                    val={row.in_qty}
                    bg={rowBg}
                    border={rowBorder}
                    color={LEGACY_COLORS.green}
                    highlightColor={LEGACY_COLORS.green}
                  />
                  {/* 출고 내역 */}
                  <Num
                    val={row.out_qty}
                    bg={rowBg}
                    border={rowBorder}
                    color={LEGACY_COLORS.red}
                    highlightColor={LEGACY_COLORS.red}
                  />
                  {/* 현재 재고 */}
                  <Num val={row.current_qty} bg={rowBg} border={rowBorder} />
                  {/* 증감 */}
                  {(() => {
                    const deltaTone =
                      delta > 0
                        ? LEGACY_COLORS.green
                        : delta < 0
                        ? LEGACY_COLORS.red
                        : null;
                    const deltaCellBg = deltaTone
                      ? `color-mix(in srgb, ${deltaTone} 8%, ${rowBg})`
                      : rowBg;
                    return (
                      <td
                        className={`rounded-r-[12px] border-y border-r px-3 py-1.5 text-center text-[16px] ${deltaTone ? "font-black" : "font-semibold"}`}
                        style={{
                          background: deltaCellBg,
                          borderColor: rowBorder,
                          color: deltaTone ?? ZERO_FADE,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {delta > 0 ? `+${formatQty(delta)}` : delta < 0 ? formatQty(delta) : "±0"}
                      </td>
                    );
                  })()}
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
  highlightColor,
}: {
  val: number;
  bg: string;
  border: string;
  color?: string;
  highlightColor?: string;
}) {
  const isZero = Number(val) === 0;
  const c = isZero ? ZERO_FADE : (color ?? LEGACY_COLORS.text);
  const cellBg =
    !isZero && highlightColor
      ? `color-mix(in srgb, ${highlightColor} 8%, ${bg})`
      : bg;
  return (
    <td
      className={`border-y px-3 py-1.5 text-center text-[15px] ${isZero ? "font-medium" : "font-bold"}`}
      style={{
        background: cellBg,
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
