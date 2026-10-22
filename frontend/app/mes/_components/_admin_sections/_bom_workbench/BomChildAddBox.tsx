"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAdminScrollRestoration, useAdminSessionState } from "../../_admin_hooks/useAdminSessionState";
import { Plus, Check, X } from "lucide-react";
import type { BOMEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { BomSearchInput } from "./BomSearchInput";
import { DEPT_LETTERS, DEPT_LETTER_TO_NAME, deptColor, deptOf, stageOf, type DeptLetter, type StageLetter } from "./bomDept";
import { BOM_EDIT_LIST_GRID_TEMPLATE, BOM_SEARCH_BAR_CLASS_NAME, BOM_FILTER_BAR_CLASS_NAME, BomPanelFrame, BomStageFilters, BomTableHeader, BomTableItemRow } from "./BomTablePrimitives";
import { EmptyState } from "../../common";
import { useItemSearch } from "@/lib/queries/useItemSearch";
import { QuantityInput } from "../../common/QuantityInput";
import { AdminReadBoundary, type useAdminReadState } from "../_admin_primitives/AdminReadState";
import { AdminTableSkeleton } from "../_admin_primitives/AdminSkeleton";
import { AdminVirtualRows } from "../_admin_primitives/AdminVirtualRows";
import { AdminDetailViewport } from "../_admin_primitives/AdminDetailViewport";

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
  parent: Item | null;
  read?: ReturnType<typeof useAdminReadState>;
  bomRows: BOMEntry[];
  items: Item[];
  onAdd: (childId: string, childName: string, qty: number) => Promise<boolean>;
  isLocked?: boolean;
}


export function BomChildAddBox({ parent, bomRows, items, onAdd, isLocked = false, read }: Props) {
  const { matchesItem } = useItemSearch();
  const [search, setSearch] = useAdminSessionState<string>("bom.children.search", "");
  const [deptFilter, setDeptFilter] = useAdminSessionState<DeptLetter | "">("bom.children.department", "");
  const [stageFilter, setStageFilter] = useAdminSessionState<"ALL" | StageLetter>("bom.children.stage", "ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState("1");
  const [busyId, setBusyId] = useState<string | null>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useAdminScrollRestoration("bom.children.scroll", scrollRef, !read?.loading);

  const childIdSet = useMemo(() => new Set(bomRows.map((r) => r.child_item_id)), [bomRows]);

  // 부모/필터 바뀌면 펼친 입력 닫기
  useEffect(() => {
    setExpandedId(null);
  }, [parent?.item_id]);

  useEffect(() => {
    if (expandedId) {
      qtyRef.current?.focus();
      qtyRef.current?.select();
    }
  }, [expandedId]);

  useEffect(() => {
    if (isLocked) {
      setExpandedId(null);
      setQtyDraft("1");
    }
  }, [isLocked]);

  const candidates = useMemo(() => {
    return items
      .filter((i) => i.item_id !== parent?.item_id)
      .filter((i) => {
        if (!deptFilter) return true;
        return deptOf(i.process_type_code) === deptFilter;
      })
      .filter((i) => {
        if (stageFilter === "ALL") return true;
        return stageOf(i.process_type_code) === stageFilter;
      })
      .filter((i) => {
        return matchesItem(i, search);
      });
  }, [items, parent?.item_id, search, deptFilter, stageFilter, matchesItem]);

  function openRow(id: string) {
    if (isLocked || read?.loading || read?.error || !parent) return;
    setExpandedId(id);
    setQtyDraft("1");
  }

  function closeRow() {
    setExpandedId(null);
    setQtyDraft("1");
  }

  async function commit(child: Item) {
    if (isLocked || read?.loading || read?.error || !parent) return;
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
      data-scrollbar-rail-shell
      className="relative flex min-h-0 flex-1 flex-col rounded-2xl"
      style={{ background: LEGACY_COLORS.s2 }}
    >
      <div className={BOM_SEARCH_BAR_CLASS_NAME} style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
        <div className="shrink-0 text-xs font-bold uppercase tracking-widest" style={{ color: LEGACY_COLORS.muted2 }}>
          하위 품목 추가
        </div>
        <div className="min-w-0 flex-1">
          <BomSearchInput value={search} onChange={setSearch} bg={LEGACY_COLORS.s1 as string} />
        </div>
        <span aria-hidden={!isLocked || undefined} className={`shrink-0 whitespace-nowrap text-xs font-semibold ${isLocked ? "" : "invisible"}`} style={{ color: LEGACY_COLORS.muted2 }}>
          완료 해제 후 수정 가능
        </span>
      </div>

      <div className={BOM_FILTER_BAR_CLASS_NAME}>
        <div className="overflow-x-auto">
          <div className="flex min-w-full w-max items-center gap-1">
            <BomStageFilters value={stageFilter} onChange={setStageFilter} includeRaw />

            <div className="shrink-0">
              <div
                role="group"
                aria-label="공정 필터"
                className="ml-1.5 flex shrink-0 items-center gap-1.5 border-l pl-3"
                style={{ borderColor: LEGACY_COLORS.border }}
              >
              <button
                type="button"
                onClick={() => setDeptFilter("")}
                aria-pressed={deptFilter === ""}
                className="whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold transition-colors"
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
                    aria-pressed={active}
                    className="whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold transition-colors"
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
            </div>
          </div>
        </div>
      </div>

      <AdminDetailViewport selectionKey={`${parent?.item_id}:${read?.loading ? "loading" : read?.error ? "error" : "ready"}`}
        loading={read?.loading} className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          data-scrollbar-rail-viewport
          className="absolute inset-y-0 left-0 right-0 overflow-y-auto lg:-right-2.5 lg:[scrollbar-gutter:stable]"
        >
          <div className="flex min-h-full min-w-full flex-col" style={{ background: LEGACY_COLORS.s2 }}>
            <BomTableHeader
              variant="candidate"
              gridTemplateColumns={BOM_EDIT_LIST_GRID_TEMPLATE}
            />
            <AdminReadBoundary reveal={false} read={read ?? { loading: false, error: undefined, retry: () => {} }} label="하위 품목 목록" skeleton={<AdminTableSkeleton columns={BOM_EDIT_LIST_GRID_TEMPLATE} count={4} rowClassName="h-[37px]" />}>
            {candidates.length === 0 ? (
              <EmptyState variant="no-search-result" compact illustrated />
            ) : (
              <AdminVirtualRows items={candidates} getKey={(item) => item.item_id} estimateSize={37}
                pinnedKeys={[expandedId, busyId].filter((id): id is string => !!id)} scrollRef={scrollRef} renderItem={(c) => {
            const already = childIdSet.has(c.item_id);
            const expanded = expandedId === c.item_id;
            const busy = busyId === c.item_id;
            return (
            <div key={c.item_id}>
                <BomTableItemRow
                  item={c}
                  gridTemplateColumns={BOM_EDIT_LIST_GRID_TEMPLATE}
                  disabled={already || isLocked}
                  onClick={() => (expanded ? closeRow() : openRow(c.item_id))}
                  background={expanded ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent)` : undefined}
                  trailing={already ? (
                    <span
                      className="inline-flex justify-self-center items-center gap-1 whitespace-nowrap text-[12px] font-semibold"
                      style={{ color: LEGACY_COLORS.green }}
                    >
                      <Check size={12} className="shrink-0" /> 등록됨
                    </span>
                  ) : (
                    <span className="justify-self-center" style={{ color: LEGACY_COLORS.blue }}>
                      {expanded ? <X size={14} /> : <Plus size={14} />}
                    </span>
                  )}
                />

                {expanded && !already && (
                  <div
                    className="flex items-center gap-2 px-3 py-2.5"
                    style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 5%, transparent)` }}
                  >
                    <span className="text-xs font-semibold" style={{ color: LEGACY_COLORS.muted }}>
                      수량
                    </span>
                    <QuantityInput
                      ref={qtyRef}
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
                      className="w-24 rounded-md border px-2 py-1 text-sm font-semibold"
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
                        className="standard-hover rounded-md px-3 py-1 text-xs font-bold transition-colors disabled:opacity-60"
                        style={{ background: LEGACY_COLORS.blueSolid, color: LEGACY_COLORS.white }}
                      >
                        {busy ? "추가 중…" : "추가 (Enter)"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={closeRow}
                        className="standard-hover rounded-md border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-60"
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
              }} />
            )}
            </AdminReadBoundary>
          </div>
        </div>
      </AdminDetailViewport>
      <BomPanelFrame />
    </div>
  );
}
