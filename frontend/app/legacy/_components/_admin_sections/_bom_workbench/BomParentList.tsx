"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { BOMDetailEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { BomBadge } from "./BomBadge";
import { stageOf, type DeptLetter, type StageLetter } from "./bomDept";

/**
 * 좌측 부모 품목 리스트 — 선택된 부서의 품목을 검색/단계필터링해서 보여줌.
 *
 * 모드:
 *   - "edit"     : R 단계 제외 (BOM 부모로만 가능)
 *   - "whereused": 모든 단계 포함 (자식이 될 수 있는 품목 전체)
 *
 * 자식 통계는 allBomRows 에서 계산 (해당 부모의 자식 개수).
 */
interface Props {
  dept: DeptLetter;
  items: Item[];
  allBomRows: BOMDetailEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
  mode: "edit" | "whereused";
}

const STAGE_FILTERS: { id: "ALL" | StageLetter; label: string }[] = [
  { id: "ALL", label: "전체" },
  { id: "A", label: "중간" },
  { id: "F", label: "완료" },
];

const STAGE_FILTERS_WHEREUSED: { id: "ALL" | StageLetter; label: string }[] = [
  { id: "ALL", label: "전체" },
  { id: "R", label: "원자재" },
  { id: "A", label: "중간" },
  { id: "F", label: "완료" },
];

export function BomParentList({ dept, items, allBomRows, selectedId, onSelect, mode }: Props) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<"ALL" | StageLetter>("ALL");

  // 부서 내 자식 count 맵 (부모별)
  const childCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of allBomRows) m.set(r.parent_item_id, (m.get(r.parent_item_id) ?? 0) + 1);
    return m;
  }, [allBomRows]);

  const list = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return items
      .filter((i) => i.process_type_code?.[0] === dept)
      .filter((i) => {
        if (mode === "edit") return stageOf(i.process_type_code) !== "R";
        return true;
      })
      .filter((i) => {
        if (stageFilter === "ALL") return true;
        return stageOf(i.process_type_code) === stageFilter;
      })
      .filter((i) => {
        if (!kw) return true;
        return `${i.item_name} ${i.erp_code ?? ""}`.toLowerCase().includes(kw);
      });
  }, [items, dept, search, stageFilter, mode]);

  const filters = mode === "whereused" ? STAGE_FILTERS_WHEREUSED : STAGE_FILTERS;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col rounded-2xl border"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      {/* 검색 */}
      <div className="flex flex-col gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: LEGACY_COLORS.muted2 }} />
          <input
            type="text"
            placeholder="품목명 / 코드 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border py-1.5 pl-9 pr-3 text-sm outline-none"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => {
            const active = stageFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setStageFilter(f.id)}
                className="rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors"
                style={{
                  background: active ? LEGACY_COLORS.blue : LEGACY_COLORS.s2,
                  color: active ? LEGACY_COLORS.white : LEGACY_COLORS.muted,
                  borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                }}
              >
                {f.label}
              </button>
            );
          })}
          <span className="ml-auto self-center text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
            {list.length}건
          </span>
        </div>
      </div>

      {/* 리스트 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            결과 없음
          </div>
        ) : (
          list.map((i) => {
            const childCount = childCountMap.get(i.item_id) ?? 0;
            const isSelected = i.item_id === selectedId;
            return (
              <button
                key={i.item_id}
                type="button"
                onClick={() => onSelect(i.item_id)}
                className="grid w-full items-center gap-3 px-3 py-2 text-left transition-colors"
                style={{
                  gridTemplateColumns: "auto 1fr auto",
                  borderBottom: `1px solid ${LEGACY_COLORS.border}`,
                  background: isSelected
                    ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 10%, transparent)`
                    : "transparent",
                }}
              >
                <BomBadge processTypeCode={i.process_type_code} small />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold" style={{ color: LEGACY_COLORS.text }}>
                    {i.item_name}
                  </div>
                  {i.erp_code && (
                    <div className="truncate text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                      {i.erp_code}
                    </div>
                  )}
                </div>
                {mode === "edit" && childCount > 0 ? (
                  <span
                    className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold"
                    style={{
                      background: `color-mix(in srgb, ${LEGACY_COLORS.green} 14%, transparent)`,
                      color: LEGACY_COLORS.green,
                    }}
                  >
                    {childCount}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
