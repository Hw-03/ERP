"use client";

import { useMemo, useState } from "react";
import type { BOMDetailEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TruncatedText } from "@/lib/ui";
import { BomBadge } from "./BomBadge";
import { BomSearchInput } from "./BomSearchInput";
import { BOM_STATUS_META, bomStatusOf, stageOf, type BomDeptFilter, type StageLetter } from "./bomDept";
import type { StatusFilter } from "./BomStatsRow";
import { EmptyState } from "../../common";

/**
 * 좌측 부모 품목 리스트 — 선택된 부서의 품목을 검색/단계/상태 필터링.
 *
 * 모드:
 *   - "edit"     : R 단계 제외 (BOM 부모로만 가능)
 *   - "whereused": 모든 단계 포함 (자식이 될 수 있는 품목 전체)
 *
 * 상태(완료/작업중/미착수)는 completedSet + 부서 내 자식 count 로 계산.
 * statusFilter 는 상단 KPI(BomStatsRow) 가 제어.
 */
interface Props {
  dept: BomDeptFilter;
  items: Item[];
  allBomRows: BOMDetailEntry[];
  completedSet: Set<string>;
  statusFilter: StatusFilter;
  selectedId: string;
  onSelect: (id: string) => void;
  mode: "edit" | "whereused";
}

const STAGE_FILTERS: { id: "ALL" | StageLetter; label: string }[] = [
  { id: "ALL", label: "전체" },
  { id: "A", label: "중간공정" },
  { id: "F", label: "공정완료" },
];

const STAGE_FILTERS_WHEREUSED: { id: "ALL" | StageLetter; label: string }[] = [
  { id: "ALL", label: "전체" },
  { id: "R", label: "원자재" },
  { id: "A", label: "중간공정" },
  { id: "F", label: "공정완료" },
];

export function BomParentList({
  dept,
  items,
  allBomRows,
  completedSet,
  statusFilter,
  selectedId,
  onSelect,
  mode,
}: Props) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<"ALL" | StageLetter>("ALL");

  // 부모별 자식 count 맵 (전체 BOM 기준)
  const childCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of allBomRows) m.set(r.parent_item_id, (m.get(r.parent_item_id) ?? 0) + 1);
    return m;
  }, [allBomRows]);

  const list = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return items
      .filter((i) => {
        if (dept !== "ALL" && i.process_type_code?.[0] !== dept) return false;
        return true;
      })
      .filter((i) => {
        if (mode === "edit") return stageOf(i.process_type_code) !== "R";
        return true;
      })
      .filter((i) => {
        if (stageFilter === "ALL") return true;
        return stageOf(i.process_type_code) === stageFilter;
      })
      .filter((i) => {
        if (mode !== "edit" || statusFilter === "ALL") return true;
        return bomStatusOf(i.item_id, completedSet, childCountMap) === statusFilter;
      })
      .filter((i) => {
        if (!kw) return true;
        return `${i.item_name} ${i.item_code ?? ""}`.toLowerCase().includes(kw);
      });
  }, [items, dept, search, stageFilter, mode, statusFilter, completedSet, childCountMap]);

  const filters = mode === "whereused" ? STAGE_FILTERS_WHEREUSED : STAGE_FILTERS;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col rounded-2xl border"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
    >
      {/* 검색 */}
      <div className="flex flex-col gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
        <BomSearchInput value={search} onChange={setSearch} />
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => {
            const active = stageFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setStageFilter(f.id)}
                aria-pressed={active}
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
          <EmptyState variant="no-search-result" compact />
        ) : (
          list.map((i) => {
            const isSelected = i.item_id === selectedId;
            const status = bomStatusOf(i.item_id, completedSet, childCountMap);
            const meta = BOM_STATUS_META[status];
            return (
              <button
                key={i.item_id}
                type="button"
                onClick={() => onSelect(i.item_id)}
                aria-pressed={isSelected}
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
                  <TruncatedText className="truncate text-sm font-semibold" style={{ color: LEGACY_COLORS.text }}>
                    {i.item_name}
                  </TruncatedText>
                  {i.item_code && (
                    <TruncatedText className="truncate text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                      {i.item_code}
                    </TruncatedText>
                  )}
                </div>
                {mode === "edit" ? (
                  <span
                    className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold"
                    style={{
                      background: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
                      color: meta.color,
                    }}
                  >
                    {meta.label}
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
