"use client";

import { useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
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
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { useRealtimeRevision } from "@/lib/queries/realtime";
import styles from "./ReasonFormFields.module.css";
import { SearchInput } from "../common/SearchInput";

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
  showCategory?: boolean;
  animateCategory?: boolean;
  categoryPlaceholder?: string;
  /** 처리 화면의 수량·추가·삭제를 사유 입력과 함께 배치하고 격리는 관리 분류도 표시한다. */
  quarantineControls?: { quantity: ReactNode; management?: ReactNode; remove: ReactNode; add?: ReactNode };
}

/** 선택기는 마스터를 공유하고, 개별 이력에 저장된 사유 이름은 보존한다. */
export function ReasonFormFields({
  employeeId, category, categoryId, memo, onCategoryChange, onMemoChange,
  required = true, mobilePresentation = false, quarantineControls, showCategory = true, animateCategory = false, categoryPlaceholder = "카테고리 선택",
}: ReasonFormFieldsProps): ReactElement {
  const queryClient = useQueryClient();
  const revision = useRealtimeRevision();
  const queryKey = ["defect-reason-categories", employeeId, revision];
  const query = useQuery({
    queryKey, queryFn: () => defectsApi.listReasonCategories(employeeId, true),
    enabled: Boolean(employeeId) && showCategory, staleTime: 30_000,
  });
  const [open, setOpen] = useState(false);
  const dialogId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const editingRef = useRef<HTMLInputElement>(null);
  const [hideTarget, setHideTarget] = useState<DefectReasonCategory | null>(null);
  const hideTriggerRef = useRef<HTMLButtonElement | null>(null);
  const hideStatusRef = useRef<HTMLParagraphElement>(null);
  const focusFrameRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const dialogRef = useFocusTrap<HTMLDivElement>(open && showCategory && !hideTarget, { initialFocusRef: searchRef });
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const desktopFieldsRef = useRef<HTMLDivElement>(null);
  const [narrowDesktop, setNarrowDesktop] = useState(false);
  const desktopQuarantine = Boolean(quarantineControls && !mobilePresentation);
  useEffect(() => {
    const fields = desktopFieldsRef.current;
    if (!desktopQuarantine || !fields) return;
    // Inline-size containment can collapse this fieldset on live validation changes.
    // Observe the same content width without removing its children from sizing.
    const observer = new ResizeObserver(([entry]) => setNarrowDesktop(entry.contentRect.width <= 380));
    observer.observe(fields);
    return () => observer.disconnect();
  }, [desktopQuarantine]);
  const categories = [...(query.data ?? [])].sort((a, b) =>
    Number(a.is_other) - Number(b.is_other) || a.name.localeCompare(b.name, "ko"));
  const selected = categories.find((entry) => categoryId ? entry.category_id === categoryId : entry.name === category);
  const needle = search.trim().normalize("NFKC").toLocaleLowerCase();
  const matches = (entry: DefectReasonCategory): boolean => matchesSearchText(entry.name.normalize("NFKC"), needle);
  const visible = categories.filter((entry) => (entry.is_active || showInactive) && matches(entry));
  const otherMissingMemo = Boolean(showCategory && selected?.is_other && !memo.trim());
  const nameTaken = categories.some((entry) => entry.name.normalize("NFKC").trim().toLocaleLowerCase() === needle);
  const hiddenNameTaken = categories.some((entry) => !entry.is_active && entry.name.normalize("NFKC").trim().toLocaleLowerCase() === needle);
  const canCreate = Boolean(search.trim() && !nameTaken);

  useEffect(() => () => {
    if (focusFrameRef.current !== null) cancelAnimationFrame(focusFrameRef.current);
  }, []);

  useEffect(() => {
    if (showCategory) return;
    setOpen(false);
    setHideTarget(null);
  }, [showCategory]);

  /** 중첩 팝업의 포커스 복원 이후 선택창의 올바른 조작으로 돌아간다. */
  function closeHideConfirmation(toSearch: boolean = false): void {
    if (savingRef.current) return;
    setHideTarget(null);
    setError(null);
    if (focusFrameRef.current !== null) cancelAnimationFrame(focusFrameRef.current);
    focusFrameRef.current = requestAnimationFrame(() => {
      const trigger = hideTriggerRef.current;
      (toSearch || !trigger?.isConnected ? searchRef.current : trigger)?.focus();
      focusFrameRef.current = null;
    });
  }

  useEffect(() => {
    if (editingId) editingRef.current?.focus();
  }, [editingId]);

  useEffect(() => {
    if (hideTarget && busy) hideStatusRef.current?.focus();
    else if (hideTarget && document.activeElement === hideStatusRef.current) {
      hideStatusRef.current?.closest('[role="dialog"]')?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    }
  }, [hideTarget, busy]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent): void => {
      if (hideTarget && busy && event.key === "Tab") {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!busy) {
        if (hideTarget) closeHideConfirmation();
        else setOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [open, busy, hideTarget]);

  useEffect(() => {
    if (!showCategory || !query.data || !category) return;
    const current = query.data.find((entry) => categoryId ? entry.category_id === categoryId : entry.name === category);
    if (!current?.is_active) onCategoryChange("", null);
    else if (current.name !== category || (categoryId !== undefined && current.category_id !== categoryId)) {
      onCategoryChange(current.name, current.category_id);
    }
  }, [showCategory, query.data, category, categoryId, onCategoryChange]);

  async function save(changes: { name?: string; is_active?: boolean }, id?: string): Promise<boolean> {
    if (savingRef.current || !employeeId) return false;
    savingRef.current = true;
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
      if (id && !hideTarget) searchRef.current?.focus();
      await queryClient.invalidateQueries({ queryKey: ["defect-reason-categories", employeeId] });
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "사유를 저장하지 못했습니다.");
      return false;
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  }

  const categoryField = <div className="flex min-w-0 flex-col gap-1">
      <label className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>
        사유 카테고리 {required && <span style={{ color: LEGACY_COLORS.red }}>*</span>}
      </label>
      <button type="button" aria-label="사유 카테고리 선택" aria-haspopup="dialog" aria-expanded={open}
        aria-controls={open ? dialogId : undefined} disabled={!employeeId}
        onClick={() => { setSearch(""); setEditingId(null); setError(null); setShowInactive(false); setOpen(true); }}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[12px] border px-3 text-left text-sm outline-none focus-visible:ring-2 disabled:opacity-40"
        style={{ background: LEGACY_COLORS.s2, color: category ? LEGACY_COLORS.text : quarantineControls && required ? LEGACY_COLORS.red : LEGACY_COLORS.muted2, borderColor: LEGACY_COLORS.border }}>
        <span className="min-w-0 break-words">{selected?.name || category || categoryPlaceholder}</span>
        <ChevronDown size={16} className="shrink-0" />
      </button>
    </div>;
  const memoField = <div className="flex min-w-0 flex-col gap-1">
      <label className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>
        메모 {showCategory && selected?.is_other ? <span style={{ color: LEGACY_COLORS.red }}>*</span> : !mobilePresentation && "(선택)"}
      </label>
      <textarea aria-label="메모" value={memo} onChange={(event) => onMemoChange(event.target.value)} placeholder="예: 스크래치 다수 / 우측 끝단" rows={2}
        className="w-full resize-none rounded-[10px] border px-3 py-2 text-sm outline-none focus-visible:ring-2"
        style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text, borderColor: otherMissingMemo ? LEGACY_COLORS.red : LEGACY_COLORS.border }} />
      {otherMissingMemo && <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>기타를 선택하면 메모를 입력하세요.</span>}
    </div>;

  return <div className={`flex min-w-0 flex-col ${animateCategory && !quarantineControls ? "gap-0" : "gap-3"}`}>
    {quarantineControls ? mobilePresentation ? <div className={styles.mobileFields}>
      <div className={styles.mobileTop}>
        {quarantineControls.quantity}
        {quarantineControls.management && <div className={styles.mobileRight}>
          <div className={styles.mobileHeading}>
            <span className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>관리 분류</span>
          </div>
          {quarantineControls.management}
        </div>}
        <div className={styles.mobileRemove}>{quarantineControls.remove}</div>
      </div>
      {categoryField}
      {memoField}
    </div> : <div ref={desktopFieldsRef} data-reason-desktop-fields className={`${styles.desktopFields} ${narrowDesktop ? styles.desktopNarrow : ""}`}>
      <div className={styles.desktopTop}>
        {quarantineControls.quantity}
        {categoryField}
        <div className={styles.add}>{quarantineControls.add}</div>
        <div className={styles.remove}>{quarantineControls.remove}</div>
      </div>
      <div className={`${styles.desktopBottom} ${quarantineControls.management ? "" : styles.withoutManagement}`}>
        <div className={styles.memo}>{memoField}</div>
        {quarantineControls.management && <div className={`${styles.management} [&_button]:min-h-11 [&_button]:text-sm`}>
          <span className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>관리 분류</span>
          {quarantineControls.management}
        </div>}
      </div>
    </div> : <>
      {animateCategory ? <div className={`${styles.categoryReveal} ${showCategory ? styles.categoryExpanded : ""}`} aria-hidden={!showCategory} inert={!showCategory}>
        <div className={styles.categoryClip}><div className={styles.categorySpacing}>{categoryField}</div></div>
      </div> : showCategory && categoryField}
      {memoField}
    </>}
    {open && showCategory && createPortal(<div className="fixed inset-0 z-[500] flex items-end justify-center bg-black/30 p-3 backdrop-blur-sm md:items-center"
      onClick={(event) => { if (event.target === event.currentTarget && !busy && !hideTarget) setOpen(false); }}>
      <div ref={dialogRef} id={dialogId} role="dialog" aria-modal={!hideTarget || undefined} aria-hidden={Boolean(hideTarget)} inert={Boolean(hideTarget)} aria-labelledby={`${dialogId}-title`}
        className="flex h-[min(76dvh,600px)] w-full max-w-[430px] min-h-0 min-w-0 flex-col gap-3 rounded-[24px] border p-4 md:max-w-[560px] md:p-5"
        style={{ background: "var(--c-popup-bg)", borderColor: LEGACY_COLORS.border, boxShadow: "var(--c-popup-shadow)", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
        <div className="flex shrink-0 items-center justify-between gap-2">
          <h2 id={`${dialogId}-title`} className="text-lg font-black" style={{ color: LEGACY_COLORS.text }}>사유 카테고리</h2>
          <Button variant="ghost" className="min-h-11 min-w-11 !px-2" aria-label="사유 선택 닫기" disabled={busy} onClick={() => setOpen(false)}><X size={18} /></Button>
        </div>
        <SearchInput value={search} onChange={setSearch} inputRef={searchRef}
          ariaLabel="사유 검색" placeholder="사유명을 입력하세요" clearable={false}
          inputProps={{ type: "search", className: "!font-normal" }}
          leading={<Search size={18} className="pointer-events-none shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />}
          className="min-w-0 shrink-0 !gap-1 !rounded-[12px] !pr-1"
          trailing={<div className="flex shrink-0 items-center py-1">
            <div aria-hidden={!canCreate} inert={!canCreate}
              className={`overflow-hidden transition-[max-width,opacity,transform] duration-200 ease-out motion-reduce:transition-none ${canCreate ? "max-w-[48px] translate-x-0 opacity-100 md:max-w-[132px]" : "max-w-0 -translate-x-1 opacity-0"}`}>
              <div className="pr-1">
                <Button iconLeft={<Plus size={16} />} loading={busy}
                  aria-label="추가하고 선택" title="추가하고 선택"
                  disabled={!canCreate || search.trim().length > 32 || query.isPending || query.isError}
                  className="min-h-11 min-w-11 whitespace-nowrap !px-2" onClick={() => void save({ name: search.trim() })}><span className="hidden md:inline">추가하고 선택</span></Button>
              </div>
            </div>
            <Button variant="ghost" iconLeft={<Archive size={16} />} className="min-h-11 min-w-11 !px-2"
              aria-label={showInactive ? "숨김 사유 닫기" : "숨김 사유 관리"} title={showInactive ? "숨김 사유 닫기" : "숨김 사유 관리"}
              aria-pressed={showInactive} disabled={busy}
              onClick={() => setShowInactive((value) => !value)}><span className="hidden md:inline">{showInactive ? "숨김 사유 닫기" : "숨김 사유 관리"}</span></Button>
          </div>}
        />
        {hiddenNameTaken && <p className="shrink-0 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>같은 이름의 사유가 숨김 상태입니다. 숨김 사유 관리에서 복원하세요.</p>}
        {error && !hideTarget && <p role="alert" className="shrink-0 text-sm" style={{ color: LEGACY_COLORS.red }}>{error}</p>}
        {query.isError && <div role="alert" className="shrink-0 text-sm" style={{ color: LEGACY_COLORS.red }}>
          사유 목록을 불러오지 못했습니다. <Button variant="ghost" className="min-h-11" onClick={() => void query.refetch()}>다시 시도</Button>
        </div>}
        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-y-0 left-0 right-0 overflow-y-auto overscroll-contain lg:-right-2.5 lg:[scrollbar-gutter:stable]">
            <div className="min-h-full p-2">
          {query.isPending ? <p role="status" className="p-3 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>사유 목록 불러오는 중...</p>
            : visible.length === 0 ? <p className="p-3 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>검색한 사유가 없습니다.</p>
              : visible.map((entry) => <div key={entry.category_id}
                className="mb-2 flex min-h-11 items-center gap-1 rounded-[12px] border p-2 last:mb-0 md:gap-2 md:p-2.5"
                style={{ borderColor: LEGACY_COLORS.border, background: entry.category_id === selected?.category_id ? tint(LEGACY_COLORS.blue, 10) : LEGACY_COLORS.s2 }}>
                {editingId === entry.category_id ? <>
                  <input ref={editingRef} aria-label={`${entry.name} 이름 수정`} value={editingName} maxLength={32} disabled={busy}
                    onChange={(event) => setEditingName(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-[10px] border px-2 text-sm"
                    style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text, borderColor: LEGACY_COLORS.border }} />
                  <Button variant="secondary" className="min-h-11 min-w-11 !px-2" aria-label="이름 저장" disabled={busy || !editingName.trim()}
                    onClick={() => void save({ name: editingName.trim() }, entry.category_id)}><Check size={16} /></Button>
                  <Button variant="ghost" className="min-h-11 min-w-11 !px-2" aria-label="이름 수정 취소" disabled={busy}
                    onClick={() => { setEditingId(null); searchRef.current?.focus(); }}><X size={16} /></Button>
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
                    <Button variant="ghost" className="min-h-11 min-w-11 !px-2" aria-label={`${entry.name} 이름 수정`} title="이름 수정" disabled={busy}
                      onClick={() => { setEditingId(entry.category_id); setEditingName(entry.name); }}><Pencil size={16} /></Button>
                    <Button variant={entry.is_active ? "ghost" : "secondary"} className="min-h-11 min-w-11 !px-2"
                      aria-label={`${entry.name} ${entry.is_active ? "숨김" : "복원"}`} title={entry.is_active ? "숨김" : "복원"} disabled={busy}
                      onClick={(event) => {
                        if (!entry.is_active) { void save({ is_active: true }, entry.category_id); return; }
                        hideTriggerRef.current = event.currentTarget;
                        setError(null);
                        setHideTarget(entry);
                      }}>
                      {entry.is_active ? <Archive size={16} /> : <RotateCcw size={16} />}
                    </Button>
                  </>}
                </>}
              </div>)}
            </div>
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-0 z-20 rounded-[16px] border" style={{ borderColor: LEGACY_COLORS.border }} />
          <div aria-hidden className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between">
            <div className="flex justify-between">
              <span className="h-4 w-4" style={{ background: "radial-gradient(circle at 100% 100%, transparent 0 15px, var(--c-popup-bg) 16px)" }} />
              <span className="h-4 w-4" style={{ background: "radial-gradient(circle at 0 100%, transparent 0 15px, var(--c-popup-bg) 16px)" }} />
            </div>
            <div className="flex justify-between">
              <span className="h-4 w-4" style={{ background: "radial-gradient(circle at 100% 0, transparent 0 15px, var(--c-popup-bg) 16px)" }} />
              <span className="h-4 w-4" style={{ background: "radial-gradient(circle at 0 0, transparent 0 15px, var(--c-popup-bg) 16px)" }} />
            </div>
          </div>
        </div>
      </div>
    </div>, document.body)}
    <ConfirmModal open={showCategory && Boolean(hideTarget)} title={`“${hideTarget?.name ?? ""}” 사유를 숨길까요?`}
      className="!z-[600]" tone="caution" confirmLabel="숨기기" busy={busy}
      onClose={() => closeHideConfirmation()}
      onConfirm={async () => { if (hideTarget && await save({ is_active: false }, hideTarget.category_id)) closeHideConfirmation(true); }}>
      <p ref={hideStatusRef} tabIndex={-1} className="text-sm outline-none" style={{ color: LEGACY_COLORS.text }}>새 작업의 선택 목록에서 숨겨집니다. 기존 기록은 유지됩니다.</p>
      {error && hideTarget && <p role="alert" className="mt-3 text-sm" style={{ color: LEGACY_COLORS.red }}>{error}</p>}
    </ConfirmModal>
  </div>;
}
