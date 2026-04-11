"use client";

import { type CategorySummary, type Category } from "@/lib/api";

// ---------------------------------------------------------------------------
// 카테고리별 색상 & 아이콘 메타데이터
// ---------------------------------------------------------------------------

interface CategoryMeta {
  badge: string;        // Tailwind 배지 클래스
  border: string;       // 카드 좌측 테두리 색
  dot: string;          // 상태 점 색
  icon: string;         // 이모지 아이콘
  shortName: string;    // 짧은 한글명
}

const CATEGORY_META: Record<Category, CategoryMeta> = {
  RM: { badge: "bg-slate-700 text-slate-200",     border: "border-l-slate-500",   dot: "bg-slate-400",  icon: "🔩", shortName: "원자재" },
  TA: { badge: "bg-blue-900/60 text-blue-300",    border: "border-l-blue-600",    dot: "bg-blue-400",   icon: "🔧", shortName: "튜브 반제품" },
  TF: { badge: "bg-blue-800/60 text-blue-200",    border: "border-l-blue-400",    dot: "bg-blue-300",   icon: "📡", shortName: "완성 튜브" },
  HA: { badge: "bg-purple-900/60 text-purple-300",border: "border-l-purple-600",  dot: "bg-purple-400", icon: "⚡", shortName: "고압 반제품" },
  HF: { badge: "bg-purple-800/60 text-purple-200",border: "border-l-purple-400",  dot: "bg-purple-300", icon: "🔋", shortName: "고압 완제품" },
  VA: { badge: "bg-cyan-900/60 text-cyan-300",    border: "border-l-cyan-600",    dot: "bg-cyan-400",   icon: "🌀", shortName: "진공 반제품" },
  VF: { badge: "bg-cyan-800/60 text-cyan-200",    border: "border-l-cyan-400",    dot: "bg-cyan-300",   icon: "💎", shortName: "진공 완제품" },
  BA: { badge: "bg-indigo-900/60 text-indigo-300",border: "border-l-indigo-600",  dot: "bg-indigo-400", icon: "🏗️", shortName: "조립 반제품" },
  BF: { badge: "bg-indigo-800/60 text-indigo-200",border: "border-l-indigo-400",  dot: "bg-indigo-300", icon: "📦", shortName: "조립 완제품" },
  FG: { badge: "bg-green-900/60 text-green-300",  border: "border-l-green-500",   dot: "bg-green-400",  icon: "✅", shortName: "출하 완제품" },
  UK: { badge: "bg-red-900/60 text-red-300",      border: "border-l-red-600",     dot: "bg-red-400",    icon: "❓", shortName: "미분류" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CategoryCardProps {
  data: CategorySummary;
  isAlert?: boolean;
}

export default function CategoryCard({ data, isAlert = false }: CategoryCardProps) {
  const meta = CATEGORY_META[data.category];

  const baseCard = isAlert
    ? "bg-red-950/40 border border-red-800/60 rounded-xl p-5 shadow-lg border-l-4 border-l-red-500"
    : `bg-slate-800 border border-slate-700/60 rounded-xl p-5 shadow-lg border-l-4 ${meta.border}`;

  const totalQty = Number(data.total_quantity);

  return (
    <div className={`${baseCard} transition-all duration-200 hover:border-opacity-100 hover:shadow-xl hover:-translate-y-0.5`}>
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl" role="img" aria-label={data.category}>
            {meta.icon}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className={`badge font-mono font-bold text-sm ${meta.badge} px-2 py-0.5 rounded`}>
                {data.category}
              </span>
              {isAlert && (
                <span className="badge bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full animate-pulse">
                  확인 필요
                </span>
              )}
            </div>
            <p className="text-slate-400 text-xs mt-0.5">{meta.shortName}</p>
          </div>
        </div>
        {/* 활성 상태 점 */}
        <div className="flex items-center gap-1.5 mt-1">
          <div
            className={`w-2 h-2 rounded-full ${
              data.item_count > 0 ? meta.dot : "bg-slate-600"
            } ${data.item_count > 0 ? "shadow-sm" : ""}`}
          />
          <span className="text-slate-500 text-xs">
            {data.item_count > 0 ? "운영중" : "항목없음"}
          </span>
        </div>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-slate-500 text-xs mb-1">품목 수</p>
          <p className="text-2xl font-bold text-slate-100 font-mono">
            {data.item_count.toLocaleString()}
          </p>
          <p className="text-slate-500 text-xs">종류</p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-3">
          <p className="text-slate-500 text-xs mb-1">총 재고</p>
          <p className={`text-2xl font-bold font-mono ${isAlert ? "text-red-300" : "text-blue-300"}`}>
            {totalQty.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className="text-slate-500 text-xs">EA (합계)</p>
        </div>
      </div>

      {/* 재고 없음 경고 */}
      {data.item_count > 0 && totalQty === 0 && (
        <div className="mt-3 flex items-center gap-1.5 text-amber-400 text-xs">
          <span>⚠️</span>
          <span>재고 0 — 입고 필요</span>
        </div>
      )}
    </div>
  );
}
