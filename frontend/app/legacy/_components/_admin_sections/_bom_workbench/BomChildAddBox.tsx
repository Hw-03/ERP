"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Check, X } from "lucide-react";
import type { BOMEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TruncatedText } from "@/lib/ui";
import { BomBadge } from "./BomBadge";
import { BomSearchInput } from "./BomSearchInput";
import { DEPT_LETTERS, DEPT_LETTER_TO_NAME, deptColor, deptOf, stageOf, type DeptLetter, type StageLetter } from "./bomDept";
import { EmptyState } from "../../common";

/**
 * 가운데 하위품목 추가 패널.
 *
 * 검색 + 부서칩 + 단계칩 + 후보 리스트.
 * 후보 클릭 → 해당 row 아래에 수량 입력 영역 펼침.
 *   - Enter : 추가 (qty>0 검증)
 *   - Esc   : 취소(접기)
 * 자기참조(parent===child)·이미 자식인 항목은 후보에서 비활성.
 */
interface Props {
  parent: Item;
  bomRows: BOMEntry[];
  items: Item[];
  onAdd: (childId: string, childName: string, qty: number) => Promise<boolean>;
}

const STAGE_FILTERS: { id: "ALL" | StageLetter; label: string }[] = [
  { id: "ALL", label: "전체" },
  { id: "R", label: "원자재" },
  { id: "A", label: "중간공정" },
  { id: "F", label: "공정완료" },
];

export function BomChildAddBox({ parent, bomRows, items, onAdd }: Props) {
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<DeptLetter | "">("");
  const [stageFilter, setStageFilter] = useState<"ALL" | StageLetter>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState("1");
  const [busyId, setBusyId] = useState<string | null>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  const childIdSet = useMemo(() => new Set(bomRows.map((r) => r.child_item_id)), [bomRows]);

  // 부모/필터 바뀌면 펼친 입력 닫기
  useEffect(() => {
    setExpandedId(null);
  }, [parent.item_id]);

  useEffect(() => {
    if (expandedId) {
      qtyRef.current?.focus();
      qtyRef.current?.select();
    }
  }, [expandedId]);

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
        return `${i.item_name} ${i.item_code ?? ""}`.toLowerCase().includes(kw);
      });
  }, [items, parent.item_id, search, deptFilter, stageFilter]);

  const availableCount = candidates.filter((c) => !childIdSet.has(c.item_id)).length;

  function openRow(id: string) {
    setExpandedId(id);
    setQtyDraft("1");
  }

  function closeRow() {
    setExpandedId(null);
    setQtyDraft("1");
  }

  async function commit(child: Item) {
    const qty = parseFloat(qtyDraft);
    if (!Number.isFinite(qty) || qty <= 0) {
      qtyRef.current?.focus();
      qtyRef.current?.select();
      return;
    }
    setBusyId(child.item_id);
    try {
      const ok = await onAdd(child.item_id, child.item_name, qty);
      if (ok) closeRow();
    } finally {
      setBusyId(null);
    }
  }

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
        <BomSearchInput value={search} onChange={setSearch} bg={LEGACY_COLORS.s1 as string} />

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
                aria-pressed={active}
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
          <EmptyState variant="no-search-result" compact />
        ) : (
          candidates.map((c) => {
            const already = childIdSet.has(c.item_id);
            const expanded = expandedId === c.item_id;
            const busy = busyId === c.item_id;
            return (
              <div key={c.item_id} style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                <button
                  type="button"
                  disabled={already}
                  onClick={() => (expanded ? closeRow() : openRow(c.item_id))}
                  className="grid w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    gridTemplateColumns: "auto 1fr auto",
                    background: expanded
                      ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent)`
                      : "transparent",
                  }}
                >
                  <BomBadge processTypeCode={c.process_type_code} small />
                  <div className="min-w-0">
                    <TruncatedText className="truncate text-sm font-semibold" style={{ color: LEGACY_COLORS.text }}>
                      {c.item_name}
                    </TruncatedText>
                    {c.item_code && (
                      <TruncatedText className="truncate text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                        {c.item_code}
                      </TruncatedText>
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
                      {expanded ? <X size={14} /> : <Plus size={14} />}
                    </span>
                  )}
                </button>

                {expanded && !already && (
                  <div
                    className="flex items-center gap-2 px-3 py-2.5"
                    style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 5%, transparent)` }}
                  >
                    <span className="text-xs font-semibold" style={{ color: LEGACY_COLORS.muted }}>
                      수량
                    </span>
                    <input
                      ref={qtyRef}
                      type="number"
                      min="0"
                      step="any"
                      value={qtyDraft}
                      onChange={(e) => setQtyDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void commit(c);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          closeRow();
                        }
                      }}
                      className="w-24 rounded-md border px-2 py-1 text-right text-sm font-semibold outline-none"
                      style={{
                        background: LEGACY_COLORS.s1,
                        borderColor: LEGACY_COLORS.blue,
                        color: LEGACY_COLORS.text,
                      }}
                    />
                    <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                      {c.unit || "EA"}
                    </span>
                    <div className="ml-auto flex gap-1.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void commit(c)}
                        className="rounded-md px-3 py-1 text-xs font-bold transition-colors hover:brightness-110 disabled:opacity-60"
                        style={{ background: LEGACY_COLORS.blue, color: LEGACY_COLORS.white }}
                      >
                        {busy ? "추가 중…" : "추가 (Enter)"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={closeRow}
                        className="rounded-md border px-3 py-1 text-xs font-semibold transition-colors hover:brightness-110 disabled:opacity-60"
                        style={{
                          background: LEGACY_COLORS.s1,
                          borderColor: LEGACY_COLORS.border,
                          color: LEGACY_COLORS.muted,
                        }}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
