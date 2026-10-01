"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, Check, Pencil, Plus, RotateCcw, Search, X } from "lucide-react";
import { api, type Supplier } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { matchesSearchText } from "@/lib/searchText";
import { Button } from "@/lib/ui/Button";
import { EmptyState } from "../common/EmptyState";
import { SkeletonBlock, dataRevealClassName } from "../common/LoadingSkeleton";
import scrollStyles from "../mobile/primitives/MobileScrollFrame.module.css";

type SupplierPickerStepProps = {
  employeeId: string;
  selectedSupplierId: string | null;
  selectedSupplierName?: string | null;
  onSelect: (supplier: Supplier | null) => void;
  onLoadStateChange?: (ready: boolean) => void;
  variant: "desktop" | "mobile";
  mode?: "manage" | "select";
  outbound?: boolean;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "공급업체 정보를 처리하지 못했습니다. 다시 시도해 주세요.";
}

/** 표시명을 보존하면서 영문 우선·가나다 순으로 비교한다. */
function compareSuppliers(left: Supplier, right: Supplier): number {
  const leftName = left.name.trim().replace(/^㈜\s*/, "").normalize("NFKC");
  const rightName = right.name.trim().replace(/^㈜\s*/, "").normalize("NFKC");
  const groupOrder = Number(!/^[a-z]/i.test(leftName)) - Number(!/^[a-z]/i.test(rightName));
  return groupOrder || leftName.localeCompare(rightName, "ko-KR", { sensitivity: "base", numeric: true })
    || left.supplier_id.localeCompare(right.supplier_id);
}

/**
 * 원자재 입출고의 공급업체 선택·관리 화면.
 * 목록과 관리 동작은 한 곳에 두고, 부모 화면은 desktop/mobile 배치만 결정한다.
 */
export function SupplierPickerStep({
  employeeId,
  selectedSupplierId,
  selectedSupplierName,
  onSelect,
  onLoadStateChange,
  variant,
  mode = "manage",
  outbound = false,
}: SupplierPickerStepProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidSupplierName, setInvalidSupplierName] = useState<string | null>(null);
  const supplierLoadRequestRef = useRef(0);
  const loadedEmployeeRef = useRef<string | null>(null);

  const canManage = mode === "manage";
  const selectedSupplierLoadKey = canManage ? selectedSupplierId : null;
  const loadSuppliers = async (
    includeInactive = canManage,
  ) => {
    const requestId = ++supplierLoadRequestRef.current;
    if (!employeeId) {
      setSuppliers([]);
      setLoading(false);
      onLoadStateChange?.(false);
      return;
    }
    const isInitialLoad = variant === "mobile" ? loadedEmployeeRef.current !== employeeId : suppliers.length === 0;
    if (isInitialLoad) {
      setLoading(true);
      onLoadStateChange?.(false);
    }
    setError(null);
    try {
      const loaded = await api.listSuppliers(employeeId, includeInactive);
      if (requestId !== supplierLoadRequestRef.current) return;
      const selectedSupplier = selectedSupplierId == null
        ? null
        : loaded.find((supplier) => supplier.supplier_id === selectedSupplierId);
      setSuppliers(loaded);
      loadedEmployeeRef.current = employeeId;
      if (selectedSupplierId != null && (!selectedSupplier || !selectedSupplier.is_active)) {
        setInvalidSupplierName(selectedSupplier?.name ?? "선택한");
        onSelect(null);
      } else if (selectedSupplier && selectedSupplier.name !== selectedSupplierName) {
        onSelect(selectedSupplier);
      }
      onLoadStateChange?.(true);
    } catch (nextError) {
      if (requestId !== supplierLoadRequestRef.current) return;
      setError(errorMessage(nextError));
      onLoadStateChange?.(false);
    } finally {
      if (requestId === supplierLoadRequestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    void loadSuppliers(canManage);
    // employeeId/showInactive 변경 때만 새 목록을 조회한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, showInactive, selectedSupplierLoadKey, canManage]);

  const visibleSuppliers = useMemo(() => {
    const activeOrManaged = suppliers.filter((supplier) => (
      (canManage && showInactive) || supplier.is_active
    ));
    return activeOrManaged.filter((supplier) => matchesSearchText(supplier.name, search)).sort(compareSuppliers);
  }, [canManage, search, showInactive, suppliers]);

  const accent = outbound ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
  const candidateName = search.trim();
  const matchingSupplier = suppliers.find((supplier) =>
    supplier.name.normalize("NFKC").trim().toLowerCase() === candidateName.normalize("NFKC").toLowerCase(),
  );

  async function addSupplier() {
    const name = candidateName;
    if (!canManage || !name || matchingSupplier || loading || saving || !employeeId) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api.createSupplier(employeeId, name);
      setSuppliers((previous) => [...previous, created]);
      setSearch("");
      setInvalidSupplierName(null);
      onSelect(created);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setSaving(false);
    }
  }

  async function saveName(supplier: Supplier) {
    const name = editingName.trim();
    if (!name || saving || !employeeId) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateSupplier(supplier.supplier_id, employeeId, { name });
      setSuppliers((previous) => previous.map((row) => row.supplier_id === updated.supplier_id ? updated : row));
      if (selectedSupplierId === updated.supplier_id) onSelect(updated);
      setEditingId(null);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setSaving(false);
    }
  }

  async function setActive(supplier: Supplier, isActive: boolean) {
    if (saving || !employeeId) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateSupplier(supplier.supplier_id, employeeId, { is_active: isActive });
      if (!isActive && selectedSupplierId === supplier.supplier_id) onSelect(null);
      setSuppliers((previous) => previous.map((row) => row.supplier_id === updated.supplier_id ? updated : row));
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setSaving(false);
    }
  }

  const compact = variant === "mobile";
  return (
    <section className={compact ? "flex h-full min-h-[180px] flex-col gap-2" : "flex h-full min-h-0 flex-col gap-4"} aria-label="공급업체 검색·선택">
      <div className={compact ? "flex shrink-0 flex-wrap items-end gap-2" : "flex flex-wrap items-end gap-2"}>
        <label className="min-w-[180px] flex-1">
          <span className="sr-only">공급업체 검색</span>
          <span className="relative block">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: LEGACY_COLORS.muted2 }} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="업체명을 입력하세요"
              className="h-11 w-full rounded-[12px] border bg-transparent py-2 pl-10 pr-3 text-sm font-medium outline-none transition focus-visible:ring-2"
              style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            />
          </span>
        </label>
        {canManage && candidateName && !matchingSupplier && !loading && !error && (
          <Button variant="primary" size="md" loading={saving} disabled={!employeeId} iconLeft={<Plus />} className="min-h-11 text-sm" style={{ background: outbound ? LEGACY_COLORS.red : LEGACY_COLORS.blueSolid }} onClick={() => void addSupplier()}>
            추가하고 선택
          </Button>
        )}
        {canManage && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => setShowInactive((value) => !value)}
            className="min-h-11 text-sm"
            aria-pressed={showInactive}
          >
            {showInactive ? "숨김 업체 닫기" : "숨김 업체 관리"}
          </Button>
        )}
      </div>

      {canManage && matchingSupplier && !matchingSupplier.is_active && !showInactive && (
        <p className="text-sm font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>같은 이름의 업체가 숨김 처리되어 있습니다. 숨김 업체 관리에서 복원하세요.</p>
      )}

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-[12px] border px-3 py-2.5 text-sm font-bold" style={{ background: tint(LEGACY_COLORS.red, 10), borderColor: tint(LEGACY_COLORS.red, 35), color: LEGACY_COLORS.red }}>
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void loadSuppliers()} className="min-h-11">다시 시도</Button>
        </div>
      )}

      <div data-supplier-scroll-shell={compact ? "" : undefined} className={compact ? "relative min-h-0 flex-1 rounded-[20px]" : "flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[16px] border p-2 "} style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        <div data-supplier-scroll-viewport={compact ? "" : undefined} data-keep-scroll={compact ? true : undefined} className={compact ? scrollStyles.viewport : "contents"} style={compact ? { overscrollBehavior: "contain" } : undefined}>
        {loading || (variant === "mobile" && loadedEmployeeRef.current !== employeeId && !error) ? variant === "mobile" ? (
          <div role="status" aria-label="공급업체 목록 불러오는 중" aria-busy="true">
            <span className="sr-only">공급업체 목록 불러오는 중</span>
            {[0, 1, 2, 3].map((row) => <div key={row} aria-hidden="true" className="flex min-h-[60px] items-center gap-3 border-b p-2" style={{ borderColor: LEGACY_COLORS.border }}><SkeletonBlock className="h-4 w-2/3" /><SkeletonBlock className="ml-auto h-5 w-5 rounded-full" /></div>)}
          </div>
        ) : <p className="p-3 text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>공급업체 목록을 불러오는 중입니다.</p>
        : variant === "mobile" && error && loadedEmployeeRef.current !== employeeId ? null : visibleSuppliers.length === 0 ? (
          <EmptyState
            illustrated
            title={canManage && candidateName ? "일치하는 공급업체가 없습니다." : canManage ? "등록된 공급업체가 없습니다." : "선택할 수 있는 활성 공급업체가 없습니다."}
            description={canManage ? matchingSupplier ? "숨김 업체 관리에서 업체를 확인하세요." : candidateName ? "추가하고 선택 버튼으로 등록하세요." : "업체명을 입력해 새 업체를 추가하세요." : "원자재 입출고에서 공급업체를 추가하세요."}
          />
        ) : (
          <ul className={`${compact ? "divide-y divide-[var(--c-border)]" : "space-y-2"} ${variant === "mobile" ? dataRevealClassName : ""}`}>
            {visibleSuppliers.map((supplier) => {
              const selected = supplier.supplier_id === selectedSupplierId;
              const editing = editingId === supplier.supplier_id;
              return (
                <li key={supplier.supplier_id} className={compact ? "p-2" : "rounded-[12px] border p-2.5"} style={{ background: selected ? tint(accent, 10) : compact ? "transparent" : LEGACY_COLORS.s2, borderColor: selected ? accent : LEGACY_COLORS.border }}>
                  <div className="flex min-h-11 items-center gap-2">
                    {canManage && editing ? (
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        className="h-11 min-w-0 flex-1 rounded-[10px] border bg-transparent px-3 text-sm font-bold outline-none focus-visible:ring-2"
                        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                        aria-label={`${supplier.name} 이름 수정`}
                      />
                    ) : (
                      <button type="button" onClick={() => { if (supplier.is_active) { setInvalidSupplierName(null); onSelect(supplier); } }} disabled={!supplier.is_active} className="min-h-11 min-w-0 flex-1 rounded-[10px] px-2 text-left text-sm font-black outline-none focus-visible:ring-2 disabled:cursor-not-allowed" style={{ color: supplier.is_active ? LEGACY_COLORS.text : LEGACY_COLORS.muted2 }}>
                        <span className="flex items-center gap-2"><span className={compact ? "[overflow-wrap:anywhere]" : "truncate"}>{supplier.name}</span>{selected && <Check aria-label="선택됨" className="h-4 w-4 shrink-0" style={{ color: accent }} />}{!supplier.is_active && <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: tint(LEGACY_COLORS.muted2, 12) }}>숨김</span>}</span>
                      </button>
                    )}
                    {canManage && editing ? (
                      <>
                        <Button variant="primary" size="sm" onClick={() => void saveName(supplier)} disabled={!editingName.trim()} className="min-h-11" aria-label="이름 저장"><Check /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} className="min-h-11" aria-label="이름 수정 취소"><X /></Button>
                      </>
                    ) : canManage ? (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => { setEditingId(supplier.supplier_id); setEditingName(supplier.name); }} className="min-h-11" aria-label={`${supplier.name} 이름 수정`}><Pencil /></Button>
                        {supplier.is_active ? (
                          <Button variant="ghost" size="sm" onClick={() => void setActive(supplier, false)} className="min-h-11" aria-label={`${supplier.name} 숨김`}><Archive /></Button>
                        ) : (
                          <Button variant="secondary" size="sm" onClick={() => void setActive(supplier, true)} className="min-h-11" aria-label={`${supplier.name} 복원`}><RotateCcw /></Button>
                        )}
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        </div>
        {compact && (
          <>
            <div data-supplier-scroll-frame aria-hidden className="pointer-events-none absolute inset-0 z-20 rounded-[20px] border" style={{ borderColor: LEGACY_COLORS.border }} />
            <div aria-hidden className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between">
              <div className="flex justify-between">
                <span className="h-5 w-5" style={{ background: "radial-gradient(circle at 100% 100%, transparent 0 19px, var(--c-bg) 20px)" }} />
                <span className="h-5 w-5" style={{ background: "radial-gradient(circle at 0 100%, transparent 0 19px, var(--c-bg) 20px)" }} />
              </div>
              <div className="flex justify-between">
                <span className="h-5 w-5" style={{ background: "radial-gradient(circle at 100% 0, transparent 0 19px, var(--c-bg) 20px)" }} />
                <span className="h-5 w-5" style={{ background: "radial-gradient(circle at 0 0, transparent 0 19px, var(--c-bg) 20px)" }} />
              </div>
            </div>
          </>
        )}
      </div>
      {!loading && !error && selectedSupplierId == null && invalidSupplierName && (
        <p className="text-sm font-bold" style={{ color: LEGACY_COLORS.red }}>{invalidSupplierName} 업체는 숨김 처리되었습니다. 활성 공급업체를 다시 선택하세요.</p>
      )}
    </section>
  );
}
