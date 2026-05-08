"use client";

import { useMemo, useState } from "react";
import { Search, Plus, Check } from "lucide-react";
import type { BOMEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { BomBadge } from "./BomBadge";
import { DEPT_LETTERS, DEPT_LETTER_TO_NAME, deptColor, deptOf, stageOf, type DeptLetter, type StageLetter } from "./bomDept";

/**
 * BomEditPanel 하단의 자식 추가 박스.
 *
 * 검색 + 부서칩 + 단계칩 + 후보 리스트. 후보 클릭 → 수량 입력 모달 요청 (부모 콜백).
 * 자기참조(parent === child) 와 이미 자식인 항목은 후보에서 비활성 처리.
 */
interface Props {
  parent: Item;
  bomRows: BOMEntry[];
  items: Item[];
  onPick: (childId: string, childName: string) => void;
}

const STAGE_FILTERS: { id: "ALL" | StageLetter; label: string }[] = [
  { id: "ALL", label: "전체" },
  { id: "R", label: "원자재" },
  { id: "A", label: "중간" },
  { id: "F", label: "완료" },
];

export function BomChildAddBox({ parent, bomRows, items, onPick }: Props) {
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<DeptLetter | "">("");
  const [stageFilter, setStageFilter] = useState<"ALL" | StageLetter>("ALL");

  const childIdSet = useMemo(() => new Set(bomRows.map((r) => r.child_item_id)), [bomRows]);

  const candidates = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return items
      .filter((i) => i.item_id !== parent.item_id)
      .filter((i) => {
        if (!deptFilter) return true;
        return deptOf(i.process_type_code) === deptFilter;
      })
      .filter((i) => {
        if (stageFilter === "ALL") return true;
        return stageOf(i.process_type_code) === stageFilter;
      })
      .filter((i) => {
        if (!kw) return true;
        return `${i.item_name} ${i.erp_code ?? ""}`.toLowerCase().includes(kw);
      })
      .slice(0, 200);
  }, [items, parent.item_id, search, deptFilter, stageFilter]);

  const availableCount = candidates.filter((c) => !childIdSet.has(c.item_id)).length;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col rounded-2xl border"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
      >
        <div className="text-xs font-bold uppercase tracking-widest" style={{ color: LEGACY_COLORS.muted2 }}>
          하위 품목 추가
        </div>
        <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          {availableCount}개 후보
        </div>
      </div>

      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: LEGACY_COLORS.muted2 }}
          />
          <input
            type="text"
            placeholder="품목명 / 코드 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border py-1.5 pl-9 pr-3 text-sm outline-none"
            style={{
              background: LEGACY_COLORS.s1,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setDeptFilter("")}
            className="rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors"
            style={{
              background: deptFilter === "" ? LEGACY_COLORS.blue : LEGACY_COLORS.s1,
              color: deptFilter === "" ? LEGACY_COLORS.white : LEGACY_COLORS.text,
              borderColor: deptFilter === "" ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
            }}
          >
            전체
          </button>
          {DEPT_LETTERS.map((letter) => {
            const active = deptFilter === letter;
            const color = deptColor(letter);
            return (
              <button
                key={letter}
                type="button"
                onClick={() => setDeptFilter(active ? "" : letter)}
                className="rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors"
                style={{
                  background: active ? color : LEGACY_COLORS.s1,
                  color: active ? LEGACY_COLORS.white : color,
                  borderColor: active ? color : `color-mix(in srgb, ${color} 35%, transparent)`,
                }}
              >
                {DEPT_LETTER_TO_NAME[letter]}
              </button>
            );
          })}
        </div>

        <div className="flex gap-1.5">
          {STAGE_FILTERS.map((f) => {
            const active = stageFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setStageFilter(f.id)}
                className="rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors"
                style={{
                  background: active ? LEGACY_COLORS.blue : LEGACY_COLORS.s1,
                  color: active ? LEGACY_COLORS.white : LEGACY_COLORS.muted,
                  borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        style={{ borderTop: `1px solid ${LEGACY_COLORS.border}` }}
      >
        {candidates.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            검색 결과 없음
          </div>
        ) : (
          candidates.map((c) => {
            const already = childIdSet.has(c.item_id);
            return (
              <button
                key={c.item_id}
                type="button"
                disabled={already}
                onClick={() => !already && onPick(c.item_id, c.item_name)}
                className="grid w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  gridTemplateColumns: "auto 1fr auto",
                  borderBottom: `1px solid ${LEGACY_COLORS.border}`,
                  background: "transparent",
                }}
              >
                <BomBadge processTypeCode={c.process_type_code} small />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold" style={{ color: LEGACY_COLORS.text }}>
                    {c.item_name}
                  </div>
                  {c.erp_code && (
                    <div className="truncate text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                      {c.erp_code}
                    </div>
                  )}
                </div>
                {already ? (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-semibold"
                    style={{ color: LEGACY_COLORS.green }}
                  >
                    <Check size={12} /> 등록됨
                  </span>
                ) : (
                  <span style={{ color: LEGACY_COLORS.blue }}>
                    <Plus size={14} />
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
