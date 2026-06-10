"use client";

import { memo, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  BookmarkMinus,
  BookmarkPlus,
  Hammer,
  Package,
  PackageX,
  Recycle,
  ShieldAlert,
  Sliders,
  Trash2,
  Undo2,
  Wrench,
} from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { transactionColor, transactionIconName } from "@/lib/mes-status";
import { useDeptColor } from "../DepartmentsContext";
import { formatHistoryDate } from "./historyFormat";
import { getHistoryDisplayLabel, getSingleLogMovement } from "./historyBatchInterpreter";
import { HISTORY_CELL_TRANSITION, MemoCell, MovementSummaryCell } from "./historyTableHelpers";
import { isReworkOperation } from "./transactionTaxonomy";

const TX_ICON = {
  ArrowDownToLine,
  ArrowUpFromLine,
  Sliders,
  Hammer,
  Recycle,
  Trash2,
  AlertCircle,
  Wrench,
  Undo2,
  BookmarkPlus,
  BookmarkMinus,
  ArrowRightLeft,
  ShieldAlert,
  PackageX,
  Activity,
} as const;

type Props = {
  log: TransactionLog;
  selected: boolean;
  onSelect: (log: TransactionLog) => void;
  /** 우측 패널 열림 — 일시/구분 셀 좌우 패딩 압축. */
  compact?: boolean;
};

function HistoryLogRowImpl({ log, selected, onSelect, compact }: Props) {
  const [hovered, setHovered] = useState(false);
  const padX = compact ? "px-2" : "px-4";
  // 재작업(DISASSEMBLE)은 빨강 강제 — transactionColor 의 muted/회색 fallback 덮어씀.
  const tcolor = isReworkOperation(log) ? LEGACY_COLORS.red : transactionColor(log.transaction_type);

  // 평상시엔 채우기 없음(깔끔). 호버 시에만 강조: 선택 줄은 더 진한 파랑, 그 외엔 유형색을 동색으로.
  const rowBackground = selected
    ? tint(LEGACY_COLORS.blue, hovered ? 18 : 10)
    : hovered
      ? tint(tcolor, 14)
      : undefined;

  // 담당자: requester_name 우선, 없으면 produced_by 파싱
  const rawName = log.requester_name ?? log.produced_by;
  const producedDept = rawName && !log.requester_name ? rawName.match(/\(([^)]+)\)/)?.[1] ?? "" : "";
  const deptColor = useDeptColor(producedDept || undefined);
  let producer: { name: string; color: string } | null = null;
  if (rawName) {
    const name = log.requester_name ? rawName : (rawName.split("(")[0]?.trim() ?? "-");
    producer = { name, color: producedDept ? deptColor : LEGACY_COLORS.muted2 };
  }

  // 5.5-G: keyboard nav 추가
  const handleSelect = () => onSelect(log);
  const TxIcon = TX_ICON[transactionIconName(log.transaction_type)];

  return (
    <tr
      data-log-id={log.log_id}
      onClick={handleSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSelect();
        }
      }}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-blue)]"
      style={{
        background: rowBackground,
        outline: selected ? `1.5px solid ${LEGACY_COLORS.blue}` : "none",
        transition: "background-color 150ms cubic-bezier(.4,0,.2,1)",
      }}
    >
      <td
        className={`whitespace-nowrap border-b ${padX} py-3 text-xs`}
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, transition: HISTORY_CELL_TRANSITION }}
      >
        <div className="flex items-center justify-center gap-1.5">
          {/* 묶음 행 chevron 폭과 같은 spacer — 일시 정렬 축을 맞춤. */}
          <span aria-hidden className="inline-block h-5 w-5 shrink-0" />
          {formatHistoryDate(log.created_at)}
        </div>
      </td>
      <td className={`whitespace-nowrap border-b ${padX} py-3 text-center`} style={{ borderColor: LEGACY_COLORS.border, transition: HISTORY_CELL_TRANSITION }}>
        <span
          className="inline-flex min-w-[6.5rem] items-center justify-center gap-1 rounded-full px-3 py-1 text-xs font-bold tracking-wide"
          style={{ background: `color-mix(in srgb, ${tcolor} 14%, transparent)`, color: tcolor }}
        >
          <TxIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {getHistoryDisplayLabel(log)}
        </span>
      </td>
      <td className="border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <div className="flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
          <span className="truncate text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>
            {log.item_name}
          </span>
          {(log.edit_count ?? 0) > 0 && (
            <span
              className="inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              style={{
                background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 16%, transparent)`,
                color: LEGACY_COLORS.yellow,
              }}
              title={`${log.edit_count}회 수정됨`}
            >
              수정됨
            </span>
          )}
        </div>
      </td>
      <td
        className="whitespace-nowrap border-b px-4 py-3 text-center"
        style={{ borderColor: LEGACY_COLORS.border }}
      >
        <MovementSummaryCell summary={{ parts: [getSingleLogMovement(log)] }} />
      </td>
      <td className="hidden sm:table-cell whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        {producer ? (
          <span className="block text-center text-xs font-semibold" style={{ color: LEGACY_COLORS.text }}>
            {producer.name}
          </span>
        ) : (
          <span className="block text-center text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            -
          </span>
        )}
      </td>
      <td className="hidden sm:table-cell whitespace-nowrap border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
        <MemoCell notes={log.notes} />
      </td>
    </tr>
  );
}

export const HistoryLogRow = memo(HistoryLogRowImpl);
