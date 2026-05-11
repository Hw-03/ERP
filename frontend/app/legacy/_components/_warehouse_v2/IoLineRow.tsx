"use client";

import { Check, MinusCircle, Package, Pencil, PlusCircle, Trash2 } from "lucide-react";
import type { IoLine } from "./types";
import { formatQty } from "@/lib/mes/format";

interface Props {
  line: IoLine;
  available: number | null;
  onToggle: () => void;
  onQuantityChange: (quantity: number, shortage: number) => void;
  onRemove: () => void;
}

function originLabel(origin: IoLine["origin"]) {
  if (origin === "bom_auto") return "BOM 자동";
  if (origin === "package_auto") return "패키지 자동";
  if (origin === "manual") return "수동 추가";
  return "직접 선택";
}

function directionLabel(line: IoLine) {
  if (line.direction === "in") return "입고";
  if (line.direction === "out") return "출고";
  if (line.direction === "move") return "이동";
  if (line.direction === "defective") return "불량";
  return "보정";
}

export function IoLineRow({ line, available, onToggle, onQuantityChange, onRemove }: Props) {
  const disabled = !line.included;
  const shortage = line.included && line.shortage > 0;

  return (
    <div
      className={[
        "grid grid-cols-[32px_minmax(0,1fr)_96px_96px_32px] items-center gap-2 rounded-md border px-2 py-2",
        disabled
          ? "border-slate-200 bg-slate-50 text-slate-400"
          : shortage
          ? "border-red-200 bg-red-50"
          : "border-slate-200 bg-white",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onToggle}
        className={[
          "flex h-7 w-7 items-center justify-center rounded-md border transition",
          line.included ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-400",
        ].join(" ")}
        title={line.included ? "재고 반영 포함" : line.exclusion_note || "이번 작업 제외"}
      >
        {line.included ? <Check className="h-4 w-4" /> : <MinusCircle className="h-4 w-4" />}
      </button>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <Package className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate text-sm font-black text-slate-900">{line.item_name}</span>
          {line.has_children && (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">
              하위 있음
            </span>
          )}
          {line.edited && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-700">
              <Pencil className="h-3 w-3" />
              수동 수정
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-1 text-[11px] font-semibold text-slate-500">
          <span>{line.erp_code || "ERP 미지정"}</span>
          <span>·</span>
          <span>{originLabel(line.origin)}</span>
          <span>·</span>
          <span>{directionLabel(line)}</span>
          {available !== null && (
            <>
              <span>·</span>
              <span>가능 {formatQty(available)}</span>
            </>
          )}
          {line.bom_expected !== null && (
            <>
              <span>·</span>
              <span>기준 {formatQty(line.bom_expected)}</span>
            </>
          )}
        </div>
      </div>

      <input
        type="number"
        min={0}
        step="0.0001"
        value={Number.isFinite(line.quantity) ? line.quantity : 0}
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.target.value);
          const safeNext = Number.isFinite(next) ? next : 0;
          const nextShortage = available === null ? line.shortage : Math.max(0, safeNext - available);
          onQuantityChange(safeNext, nextShortage);
        }}
        className="h-8 rounded-md border border-slate-200 bg-white px-2 text-right text-sm font-black outline-none focus:border-blue-500 disabled:bg-slate-100"
      />

      <div className="text-right text-xs font-black">
        {shortage ? (
          <span className="text-red-600">부족 {formatQty(line.shortage)}</span>
        ) : line.included ? (
          <span className="text-emerald-700">반영</span>
        ) : (
          <span className="text-slate-400">제외</span>
        )}
      </div>

      {line.origin === "manual" ? (
        <button
          type="button"
          onClick={onRemove}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
          title="수동 라인 삭제"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : (
        <PlusCircle className="mx-auto h-4 w-4 text-slate-300" />
      )}
    </div>
  );
}
