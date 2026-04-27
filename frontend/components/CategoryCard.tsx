"use client";

import { type Category, type CategorySummary } from "@/lib/api";

interface CategoryMeta {
  badge: string;
  border: string;
  dot: string;
  icon: string;
  shortName: string;
}

const CATEGORY_META: Record<Category, CategoryMeta> = {
  RM: {
    badge: "bg-slate-700 text-slate-200",
    border: "border-l-slate-500",
    dot: "bg-slate-400",
    icon: "🧱",
    shortName: "원자재",
  },
  TA: {
    badge: "bg-blue-900/60 text-blue-300",
    border: "border-l-blue-600",
    dot: "bg-blue-400",
    icon: "🧪",
    shortName: "튜브 반제품",
  },
  TF: {
    badge: "bg-blue-800/60 text-blue-200",
    border: "border-l-blue-400",
    dot: "bg-blue-300",
    icon: "🔵",
    shortName: "튜브 완제품",
  },
  HA: {
    badge: "bg-purple-900/60 text-purple-300",
    border: "border-l-purple-600",
    dot: "bg-purple-400",
    icon: "⚡",
    shortName: "고압 반제품",
  },
  HF: {
    badge: "bg-purple-800/60 text-purple-200",
    border: "border-l-purple-400",
    dot: "bg-purple-300",
    icon: "🔌",
    shortName: "고압 완제품",
  },
  VA: {
    badge: "bg-cyan-900/60 text-cyan-300",
    border: "border-l-cyan-600",
    dot: "bg-cyan-400",
    icon: "🫧",
    shortName: "진공 반제품",
  },
  VF: {
    badge: "bg-cyan-800/60 text-cyan-200",
    border: "border-l-cyan-400",
    dot: "bg-cyan-300",
    icon: "💠",
    shortName: "진공 완제품",
  },
  AA: {
    badge: "bg-indigo-900/60 text-indigo-300",
    border: "border-l-indigo-600",
    dot: "bg-indigo-400",
    icon: "🧩",
    shortName: "조립 반제품",
  },
  AF: {
    badge: "bg-indigo-800/60 text-indigo-200",
    border: "border-l-indigo-400",
    dot: "bg-indigo-300",
    icon: "📦",
    shortName: "조립 완제품",
  },
  FG: {
    badge: "bg-green-900/60 text-green-300",
    border: "border-l-green-500",
    dot: "bg-green-400",
    icon: "✅",
    shortName: "완제품",
  },
  UK: {
    badge: "bg-red-900/60 text-red-300",
    border: "border-l-red-600",
    dot: "bg-red-400",
    icon: "⚠️",
    shortName: "미분류",
  },
};

interface CategoryCardProps {
  data: CategorySummary;
  isAlert?: boolean;
}

export default function CategoryCard({ data, isAlert = false }: CategoryCardProps) {
  const meta = CATEGORY_META[data.category];
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
          <span className="text-2xl" role="img" aria-label={data.category}>
            {meta.icon}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-2 py-0.5 text-base font-bold ${meta.badge}`}
              >
                {data.category}
              </span>
              {isAlert && (
                <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-base text-red-400">
                  확인 필요
                </span>
              )}
            </div>
            <p className="mt-0.5 text-base text-slate-400">{meta.shortName}</p>
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
