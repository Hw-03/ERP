"use client";

import { type ProcessTypeSummary } from "@/lib/api";

interface ProcessTypeMeta {
  badge: string;
  border: string;
  dot: string;
}

function metaForCode(code: string): ProcessTypeMeta {
  const prefix = code[0] ?? "";
  switch (prefix) {
    case "T": return { badge: "bg-cyan-900/60 text-cyan-300",    border: "border-l-cyan-500",   dot: "bg-cyan-400" };
    case "H": return { badge: "bg-yellow-900/60 text-yellow-300", border: "border-l-yellow-500", dot: "bg-yellow-400" };
    case "V": return { badge: "bg-purple-900/60 text-purple-300", border: "border-l-purple-500", dot: "bg-purple-400" };
    case "N": return { badge: "bg-orange-900/60 text-orange-300", border: "border-l-orange-500", dot: "bg-orange-400" };
    case "A": return { badge: "bg-indigo-900/60 text-indigo-300", border: "border-l-indigo-500", dot: "bg-indigo-400" };
    case "P": return { badge: "bg-green-900/60 text-green-300",   border: "border-l-green-500",  dot: "bg-green-400" };
    default:  return { badge: "bg-slate-700 text-slate-200",      border: "border-l-slate-500",  dot: "bg-slate-400" };
  }
}

interface ProcessTypeCardProps {
  data: ProcessTypeSummary;
  isAlert?: boolean;
}

export default function CategoryCard({ data, isAlert = false }: ProcessTypeCardProps) {
  const meta = metaForCode(data.process_type_code);
  const totalQty = Number(data.total_quantity);

  const cardClassName = isAlert
    ? "rounded-xl border border-red-800/60 border-l-4 border-l-red-500 bg-red-950/40 p-5 shadow-lg"
    : `rounded-xl border border-slate-700/60 border-l-4 ${meta.border} bg-slate-800 p-5 shadow-lg`;

  return (
    <div
      className={`${cardClassName} transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl`}
    >
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-2 py-0.5 text-base font-bold ${meta.badge}`}
              >
                {data.process_type_code}
              </span>
              {isAlert && (
                <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-base text-red-400">
                  확인 필요
                </span>
              )}
            </div>
            <p className="mt-0.5 text-base text-slate-400">{data.label}</p>
          </div>
        </div>

        <div className="mt-1 flex items-center gap-1.5">
          <div
            className={`h-2 w-2 rounded-full ${
              data.item_count > 0 ? meta.dot : "bg-slate-600"
            }`}
          />
          <span className="text-base text-slate-500">
            {data.item_count > 0 ? "운영 중" : "품목 없음"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-slate-900/50 p-3">
          <p className="mb-1 text-base text-slate-500">품목 수</p>
          <p className="text-2xl font-bold text-slate-100">
            {data.item_count.toLocaleString()}
          </p>
          <p className="text-base text-slate-500">종류</p>
        </div>
        <div className="rounded-lg bg-slate-900/50 p-3">
          <p className="mb-1 text-base text-slate-500">총 재고</p>
          <p
            className={`text-2xl font-bold ${
              isAlert ? "text-red-300" : "text-blue-300"
            }`}
          >
            {totalQty.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className="text-base text-slate-500">EA 기준</p>
        </div>
      </div>

      {data.item_count > 0 && totalQty === 0 && (
        <div className="mt-3 flex items-center gap-1.5 text-base text-amber-400">
          <span>주의</span>
          <span>현재 재고가 0입니다. 입고 여부를 확인해 주세요.</span>
        </div>
      )}
    </div>
  );
}
