"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, Check, Pencil, Plus, RotateCcw, Search, X } from "lucide-react";
import { api, type Supplier } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { matchesSearchText } from "@/lib/searchText";
import { Button } from "@/lib/ui/Button";

type SupplierPickerStepProps = {
  employeeId: string;
  selectedSupplierId: string | null;
  selectedSupplierName?: string | null;
  onSelect: (supplier: Supplier | null) => void;
  onLoadStateChange?: (ready: boolean) => void;
  variant: "desktop" | "mobile";
  mode?: "manage" | "select";
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "공급업체 정보를 처리하지 못했습니다. 다시 시도해 주세요.";
}

/**
 * 원자재 입고의 공급업체 선택·관리 화면.
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
}: SupplierPickerStepProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidSupplierName, setInvalidSupplierName] = useState<string | null>(null);
  const supplierLoadRequestRef = useRef(0);

  const canManage = mode === "manage";
  const selectedSupplierLoadKey = canManage ? selectedSupplierId : null;
  const loadSuppliers = async (
    includeInactive = canManage && (showInactive || selectedSupplierId != null),
  ) => {
    const requestId = ++supplierLoadRequestRef.current;
    if (!employeeId) {
      setSuppliers([]);
      setLoading(false);
      onLoadStateChange?.(false);
      return;
    }
    const isInitialLoad = suppliers.length === 0;
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
    void loadSuppliers(canManage && (showInactive || selectedSupplierId != null));
    // employeeId/showInactive 변경 때만 새 목록을 조회한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, showInactive, selectedSupplierLoadKey, canManage]);

  const visibleSuppliers = useMemo(() => {
    const activeOrManaged = suppliers.filter((supplier) => (
      (canManage && showInactive) || supplier.is_active
    ));
    return activeOrManaged.filter((supplier) => matchesSearchText(supplier.name, search));
  }, [canManage, search, showInactive, suppliers]);

  async function addSupplier() {
    const name = newName.trim();
    if (!name || saving || !employeeId) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api.createSupplier(employeeId, name);
      setSuppliers((previous) => [...previous, created]);
      setNewName("");
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
      if (isActive || showInactive) {
        setSuppliers((previous) => previous.map((row) => row.supplier_id === updated.supplier_id ? updated : row));
      } else {
        setSuppliers((previous) => previous.filter((row) => row.supplier_id !== updated.supplier_id));
      }
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setSaving(false);
    }
  }

  const compact = variant === "mobile";
  return (
    <section className={compact ? "flex min-h-full flex-col gap-3" : "flex h-full min-h-0 flex-col gap-4"} aria-label="공급업체 검색·선택">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[180px] flex-1">
          <span className="mb-1 block text-xs font-black tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
            공급업체 검색·선택
          </span>
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

      {canManage && <form
        className="flex flex-wrap gap-2 rounded-[16px] border p-3"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        onSubmit={(event) => { event.preventDefault(); void addSupplier(); }}
      >
        <label className="min-w-[180px] flex-1">
          <span className="sr-only">새 공급업체 이름</span>
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="새 공급업체 이름"
            className="h-11 w-full rounded-[12px] border bg-transparent px-3 text-sm font-medium outline-none transition focus-visible:ring-2"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          />
        </label>
        <Button variant="primary" size="md" loading={saving} disabled={!newName.trim() || !employeeId} iconLeft={<Plus />} className="min-h-11 text-sm" onClick={() => void addSupplier()}>
          추가하고 선택
        </Button>
      </form>}

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-[12px] border px-3 py-2.5 text-sm font-bold" style={{ background: tint(LEGACY_COLORS.red, 10), borderColor: tint(LEGACY_COLORS.red, 35), color: LEGACY_COLORS.red }}>
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void loadSuppliers()} className="min-h-11">다시 시도</Button>
        </div>
      )}

      <div className={`min-h-0 flex-1 overflow-y-auto rounded-[16px] border p-2 ${compact ? "max-h-[360px]" : ""}`} style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        {loading ? (
          <p className="p-3 text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>공급업체 목록을 불러오는 중입니다.</p>
        ) : visibleSuppliers.length === 0 ? (
          <p className="p-3 text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
            {canManage ? "등록된 공급업체가 없습니다. 위에서 새 업체를 추가하세요." : "선택할 수 있는 활성 공급업체가 없습니다."}
          </p>
        ) : (
          <ul className="space-y-2">
            {visibleSuppliers.map((supplier) => {
              const selected = supplier.supplier_id === selectedSupplierId;
              const editing = editingId === supplier.supplier_id;
              return (
                <li key={supplier.supplier_id} className="rounded-[12px] border p-2.5" style={{ background: selected ? tint(LEGACY_COLORS.blue, 10) : LEGACY_COLORS.s2, borderColor: selected ? LEGACY_COLORS.blue : LEGACY_COLORS.border }}>
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
                        <span className="flex items-center gap-2"><span className="truncate">{supplier.name}</span>{selected && <Check aria-label="선택됨" className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.blue }} />}{!supplier.is_active && <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: tint(LEGACY_COLORS.muted2, 12) }}>숨김</span>}</span>
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
      {!loading && !error && selectedSupplierId == null && (
        <p className="text-sm font-bold" style={{ color: LEGACY_COLORS.red }}>{invalidSupplierName ? `${invalidSupplierName} 업체는 숨김 처리되었습니다. 활성 공급업체를 다시 선택하세요.` : "다음 단계로 진행하려면 활성 공급업체를 선택하세요."}</p>
      )}
    </section>
  );
}
