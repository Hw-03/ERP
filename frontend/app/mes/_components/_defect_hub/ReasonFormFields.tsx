"use client";

import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Check, ChevronDown, Pencil, Plus, RotateCcw, Search, X } from "lucide-react";
import { defectsApi } from "@/lib/api/defects";
import type { DefectReasonCategory } from "@/lib/api/types/defects";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";
import { matchesSearchText } from "@/lib/searchText";
import { Button } from "@/lib/ui/Button";
import { useRealtimeRevision } from "@/lib/queries/realtime";

export interface ReasonFormFieldsProps {
  employeeId: string;
  category: string;
  categoryId?: string | null;
  memo: string;
  onCategoryChange: (name: string, categoryId?: string | null) => void;
  onMemoChange: (memo: string) => void;
  required?: boolean;
  requireAny?: boolean;
  mobilePresentation?: boolean;
}

/** 선택기는 마스터를 공유하고, 개별 이력에 저장된 사유 이름은 보존한다. */
export function ReasonFormFields({
  employeeId, category, categoryId, memo, onCategoryChange, onMemoChange,
  required = true, mobilePresentation = false,
}: ReasonFormFieldsProps): ReactElement {
  const queryClient = useQueryClient();
  const revision = useRealtimeRevision();
  const queryKey = ["defect-reason-categories", employeeId, revision];
  const query = useQuery({
    queryKey, queryFn: () => defectsApi.listReasonCategories(employeeId, true),
    enabled: Boolean(employeeId), staleTime: 30_000,
  });
  const [open, setOpen] = useState(false);
  const dialogId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>(open, { initialFocusRef: searchRef });
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const categories = [...(query.data ?? [])].sort((a, b) =>
    Number(a.is_other) - Number(b.is_other) || a.name.localeCompare(b.name, "ko"));
  const selected = categories.find((entry) => categoryId ? entry.category_id === categoryId : entry.name === category);
  const needle = search.trim().normalize("NFKC").toLocaleLowerCase();
  const matches = (entry: DefectReasonCategory): boolean => matchesSearchText(entry.name.normalize("NFKC"), needle);
  const visible = categories.filter((entry) => (entry.is_active || showInactive) && matches(entry));
  const otherMissingMemo = Boolean(selected?.is_other && !memo.trim());
  const nameTaken = categories.some((entry) => entry.name.normalize("NFKC").trim().toLocaleLowerCase() === needle);
  const hiddenNameTaken = categories.some((entry) => !entry.is_active && entry.name.normalize("NFKC").trim().toLocaleLowerCase() === needle);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!busy) setOpen(false);
    };
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [open, busy]);

  useEffect(() => {
    if (!query.data || !category) return;
    const current = query.data.find((entry) => categoryId ? entry.category_id === categoryId : entry.name === category);
    if (!current?.is_active) onCategoryChange("", null);
    else if (current.name !== category || (categoryId !== undefined && current.category_id !== categoryId)) {
      onCategoryChange(current.name, current.category_id);
    }
  }, [query.data, category, categoryId, onCategoryChange]);

  async function save(changes: { name?: string; is_active?: boolean }, id?: string): Promise<void> {
    if (busy || !employeeId) return;
    setBusy(true);
    setError(null);
    try {
      const saved = id
        ? await defectsApi.updateReasonCategory(employeeId, id, changes)
        : await defectsApi.createReasonCategory(employeeId, changes.name ?? "");
      queryClient.setQueryData<DefectReasonCategory[]>(queryKey, (previous = []) =>
        [...previous.filter((entry) => entry.category_id !== saved.category_id), saved]);
      if (!id) { onCategoryChange(saved.name, saved.category_id); setOpen(false); }
      setEditingId(null);
      await queryClient.invalidateQueries({ queryKey: ["defect-reason-categories", employeeId] });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "사유를 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="flex flex-col gap-3">
    <div className="flex flex-col gap-1">
      <label className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>
        사유 카테고리 {required && <span style={{ color: LEGACY_COLORS.red }}>*</span>}
      </label>
      <button type="button" aria-label="사유 카테고리 선택" aria-haspopup="dialog" aria-expanded={open}
        aria-controls={open ? dialogId : undefined} disabled={!employeeId}
        onClick={() => { setSearch(""); setEditingId(null); setError(null); setShowInactive(false); setOpen(true); }}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[12px] border px-3 text-left text-sm outline-none focus-visible:ring-2 disabled:opacity-40"
        style={{ background: LEGACY_COLORS.s2, color: category ? LEGACY_COLORS.text : LEGACY_COLORS.muted2, borderColor: LEGACY_COLORS.border }}>
        <span className="min-w-0 break-words">{selected?.name || category || "카테고리 선택"}</span>
        <ChevronDown size={16} className="shrink-0" />
      </button>
    </div>
    <div className="flex flex-col gap-1">
      <label className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>
        메모 {selected?.is_other ? <span style={{ color: LEGACY_COLORS.red }}>*</span> : !mobilePresentation && "(선택)"}
      </label>
      <textarea value={memo} onChange={(event) => onMemoChange(event.target.value)} placeholder="예: 스크래치 다수 / 우측 끝단" rows={2}
        className="w-full resize-none rounded-[10px] border px-3 py-2 text-sm outline-none focus-visible:ring-2"
        style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text, borderColor: otherMissingMemo ? LEGACY_COLORS.red : LEGACY_COLORS.border }} />
      {otherMissingMemo && <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>기타를 선택하면 메모를 입력하세요.</span>}
    </div>
    {open && createPortal(<div className="fixed inset-0 z-[500] flex items-end justify-center bg-black/30 p-3 backdrop-blur-sm md:items-center"
      onClick={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <div ref={dialogRef} id={dialogId} role="dialog" aria-modal="true" aria-labelledby={`${dialogId}-title`}
        className="flex h-[min(76dvh,600px)] w-full max-w-[560px] min-h-0 flex-col gap-3 rounded-[24px] border p-4 md:p-5"
        style={{ background: "var(--c-popup-bg)", borderColor: LEGACY_COLORS.border, boxShadow: "var(--c-popup-shadow)", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
        <div className="flex shrink-0 items-center justify-between gap-2">
          <h2 id={`${dialogId}-title`} className="text-lg font-black" style={{ color: LEGACY_COLORS.text }}>사유 카테고리</h2>
          <Button variant="ghost" className="min-h-11 min-w-11 !px-2" aria-label="사유 선택 닫기" disabled={busy} onClick={() => setOpen(false)}><X size={18} /></Button>
        </div>
        <div className="relative shrink-0">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: LEGACY_COLORS.muted2 }} />
          <input ref={searchRef} type="search" aria-label="사유 검색" placeholder="사유명을 입력하세요"
            value={search} onChange={(event) => setSearch(event.target.value)}
            className="min-h-11 w-full rounded-[12px] border pl-10 pr-3 text-sm outline-none focus-visible:ring-2"
            style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text, borderColor: LEGACY_COLORS.border }} />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {search.trim() && !nameTaken && <Button iconLeft={<Plus size={16} />} loading={busy}
            disabled={search.trim().length > 32 || query.isPending || query.isError}
            className="min-h-11" onClick={() => void save({ name: search.trim() })}>추가하고 선택</Button>}
          <Button variant="ghost" className="min-h-11" aria-pressed={showInactive} disabled={busy}
            onClick={() => setShowInactive((value) => !value)}>{showInactive ? "숨김 사유 닫기" : "숨김 사유 관리"}</Button>
        </div>
        {hiddenNameTaken && <p className="shrink-0 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>같은 이름의 사유가 숨김 상태입니다. 숨김 사유 관리에서 복원하세요.</p>}
        {error && <p role="alert" className="shrink-0 text-sm" style={{ color: LEGACY_COLORS.red }}>{error}</p>}
        {query.isError && <div role="alert" className="shrink-0 text-sm" style={{ color: LEGACY_COLORS.red }}>
          사유 목록을 불러오지 못했습니다. <Button variant="ghost" className="min-h-11" onClick={() => void query.refetch()}>다시 시도</Button>
        </div>}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-[16px] border p-2" style={{ borderColor: LEGACY_COLORS.border }}>
          {query.isPending ? <p role="status" className="p-3 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>사유 목록 불러오는 중...</p>
            : visible.length === 0 ? <p className="p-3 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>검색한 사유가 없습니다.</p>
              : visible.map((entry) => <div key={entry.category_id}
                className="mb-2 flex min-h-11 items-center gap-1 rounded-[12px] border p-2 last:mb-0 md:gap-2 md:p-2.5"
                style={{ borderColor: LEGACY_COLORS.border, background: entry.category_id === selected?.category_id ? tint(LEGACY_COLORS.blue, 10) : LEGACY_COLORS.s2 }}>
                {editingId === entry.category_id ? <>
                  <input aria-label={`${entry.name} 이름 수정`} value={editingName} maxLength={32} disabled={busy}
                    onChange={(event) => setEditingName(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-[10px] border px-2 text-sm"
                    style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text, borderColor: LEGACY_COLORS.border }} />
                  <Button variant="secondary" className="min-h-11 min-w-11 !px-2" aria-label="이름 저장" disabled={busy || !editingName.trim()}
                    onClick={() => void save({ name: editingName.trim() }, entry.category_id)}><Check size={16} /></Button>
                  <Button variant="ghost" className="min-h-11 min-w-11 !px-2" aria-label="이름 수정 취소" disabled={busy} onClick={() => setEditingId(null)}><X size={16} /></Button>
                </> : <>
                  <button type="button" disabled={!entry.is_active || busy || query.isError} aria-pressed={entry.category_id === selected?.category_id}
                    onClick={() => { onCategoryChange(entry.name, entry.category_id); setOpen(false); }}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-[10px] px-2 text-left text-sm font-black outline-none focus-visible:ring-2 disabled:opacity-50"
                    style={{ color: entry.is_active ? LEGACY_COLORS.text : LEGACY_COLORS.muted2 }}>
                    <span className="min-w-0 break-words">{entry.name}</span>
                    {!entry.is_active && <span className="shrink-0 text-xs font-bold">숨김</span>}
                    {entry.category_id === selected?.category_id && <Check size={16} className="shrink-0" style={{ color: LEGACY_COLORS.blue }} />}
                  </button>
                  {!entry.is_other && <>
                    <Button variant="ghost" className="min-h-11 min-w-11 !px-2" aria-label={`${entry.name} 이름 수정`} disabled={busy}
                      onClick={() => { setEditingId(entry.category_id); setEditingName(entry.name); }}><Pencil size={16} /></Button>
                    <Button variant={entry.is_active ? "ghost" : "secondary"} className="min-h-11 min-w-11 !px-2"
                      aria-label={`${entry.name} ${entry.is_active ? "숨김" : "복원"}`} disabled={busy}
                      onClick={() => void save({ is_active: !entry.is_active }, entry.category_id)}>
                      {entry.is_active ? <Archive size={16} /> : <RotateCcw size={16} />}
                    </Button>
                  </>}
                </>}
              </div>)}
        </div>
      </div>
    </div>, document.body)}
  </div>;
}
