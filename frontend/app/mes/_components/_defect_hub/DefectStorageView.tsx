"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { defectsApi } from "@/lib/api/defects";
import type { DefectLocation, DefectManagementCategory } from "@/lib/api/types/defects";
import { PIN_LENGTH } from "@/lib/auth/constants";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { matchesDefectSearch } from "./defectSearch";
import { DefectManagementCategoryControl } from "./DefectManagementCategoryControl";
import { DefectDepartmentList } from "./DefectDepartmentList";
import { DefectFilterBar, type DefectScope } from "./DefectFilterBar";
import { useDefectFilterPreferences } from "./useDefectFilterPreferences";
import { filterDefectLocations } from "./defectCategoryFilter";
import { LoadFailureCard } from "../common/LoadFailureCard";
import type { Item, ProductModel } from "../_warehouse_v2/types";
import { DesktopPanelCloseButton } from "../DesktopRightPanel";

type StorageFilter = "ALL" | "B_GRADE" | "OBSOLETE";

const categoryLabel: Record<DefectManagementCategory, string> = {
  DEFECT: "불량 격리", B_GRADE: "B급", OBSOLETE: "구형",
};

function categoryOf(location: DefectLocation): DefectManagementCategory {
  return location.management_category ?? "DEFECT";
}

export function DefectStorageView({
  locations,
  currentEmployee,
  onBack,
  onUpdated,
  onRestore,
  onMemoUpdated,
  items = [],
  productModels = [],
  loading = false,
  loadError = null,
  onRetry,
}: {
  locations: DefectLocation[];
  currentEmployee: { employee_id: string; name: string; department: string };
  onBack: () => void;
  onUpdated: (recordId: string, category: DefectManagementCategory) => void;
  onRestore: (location: DefectLocation) => void;
  onMemoUpdated?: (recordId: string, memo: string) => void;
  items?: Item[];
  productModels?: ProductModel[];
  loading?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
}) {
  const [filter, setFilter] = useState<StorageFilter>("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DefectLocation | null>(null);
  const {
    scope, actorScope, sort, filterLocked, setScope, setActorScope, setSort, setFilterLocked,
    selectedDepartments, selectedModels, selectedProcessSteps, setSelectedDepartments, setSelectedModels,
    setSelectedProcessSteps, resetCategoryFilters,
  } = useDefectFilterPreferences({ employeeId: currentEmployee.employee_id, defaultScope: "all", defaultSort: "newest", currentDept: currentEmployee.department, storageScope: "storage" });
  const departmentOptions = useMemo(() => Array.from(new Set(locations.map((location) => location.department))).sort(), [locations]);
  const modelOptions = useMemo(() => Array.from(new Set(productModels.map((model) => model.model_name).filter((name): name is string => Boolean(name)))), [productModels]);
  const scoped = useMemo(() => {
    let result = locations.filter((location) => ["B_GRADE", "OBSOLETE"].includes(categoryOf(location)));
    if (scope === "my") result = result.filter((location) => location.department === currentEmployee.department);
    if (scope === "production") result = result.filter((location) => ["튜브", "고압", "진공", "튜닝", "조립", "출하"].includes(location.department));
    if (actorScope === "mine") result = result.filter((location) => location.quarantined_by_employee_id === currentEmployee.employee_id);
    return filterDefectLocations(result, items, productModels, { departments: selectedDepartments, models: selectedModels, processSteps: selectedProcessSteps });
  }, [locations, scope, actorScope, currentEmployee.department, currentEmployee.employee_id, items, productModels, selectedDepartments, selectedModels, selectedProcessSteps]);
  const searched = useMemo(() => scoped.filter((location) => matchesDefectSearch(location, search)), [scoped, search]);
  const storage = useMemo(() => searched.filter((location) => {
    const category = categoryOf(location);
    return (category === "B_GRADE" || category === "OBSOLETE")
      && (filter === "ALL" || category === filter);
  }).sort((left, right) => {
    const leftTime = left.defective_at ? new Date(left.defective_at).getTime() : 0;
    const rightTime = right.defective_at ? new Date(right.defective_at).getTime() : 0;
    return sort === "oldest" ? leftTime - rightTime : rightTime - leftTime;
  }), [filter, searched, sort]);
  const counts = useMemo(() => ({
    ALL: searched.length,
    B_GRADE: searched.filter((location) => categoryOf(location) === "B_GRADE").length,
    OBSOLETE: searched.filter((location) => categoryOf(location) === "OBSOLETE").length,
  }), [searched]);

  return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
    <header className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={onBack} className="standard-hover flex min-h-11 items-center gap-1 rounded-[10px] border px-3 text-sm font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2 }}><ArrowLeft className="h-4 w-4" />작업 선택</button>
      <div><h2 className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>B급·구형 자재</h2><p className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>양품 재고에서 제외한 자재를 보관 분류별로 관리합니다.</p></div>
    </header>
    {loading && locations.length === 0 ? <div role="status" className="flex min-h-40 items-center justify-center gap-2 rounded-[14px] border px-6 py-8 text-sm font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}><LoaderCircle className="h-5 w-5 animate-spin" />B급·구형 자재를 불러오는 중...</div> : loadError && locations.length === 0 ? <LoadFailureCard prefix="B급·구형 보관 목록을 불러오지 못했습니다" message={loadError} retryLabel="다시 동기화" onRetry={onRetry} /> : <>
    <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="보관 분류 필터">
      {(["ALL", "B_GRADE", "OBSOLETE"] as StorageFilter[]).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className="rounded-[14px] border px-4 py-3 text-left" style={{ background: filter === value ? tint(value === "B_GRADE" ? LEGACY_COLORS.purple : value === "OBSOLETE" ? LEGACY_COLORS.muted2 : LEGACY_COLORS.blue, 12) : LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}><span className="block text-sm font-black" style={{ color: LEGACY_COLORS.text }}>{value === "ALL" ? "전체 보관" : categoryLabel[value]}</span><span className="mt-1 block text-2xl font-black" style={{ color: LEGACY_COLORS.muted2 }}>{counts[value]}건</span></button>)}
    </div>
    <DefectFilterBar scope={scope} actorScope={actorScope} sort={sort} filterLocked={filterLocked} onScopeChange={setScope} onActorScopeChange={setActorScope} onSortChange={setSort} onFilterLockedChange={setFilterLocked} currentDept={currentEmployee.department} departments={departmentOptions} selectedDepartments={selectedDepartments} onDepartmentsChange={setSelectedDepartments} models={modelOptions} selectedModels={selectedModels} onModelsChange={setSelectedModels} selectedProcessSteps={selectedProcessSteps} onProcessStepsChange={setSelectedProcessSteps} onResetCategoryFilters={resetCategoryFilters} />
    <input aria-label="B급·구형 검색" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="품목명 · 품목 코드 · 사유 검색" className="min-h-11 rounded-[10px] border px-3 text-sm font-bold outline-none" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text }} />
    {loadError && <LoadFailureCard prefix="최신 B급·구형 보관 목록을 동기화하지 못했습니다" message={loadError} retryLabel="다시 동기화" onRetry={onRetry} />}
    {storage.length === 0 ? <div className="rounded-[14px] border px-6 py-8 text-center text-sm font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}>{search.trim() ? "검색 결과가 없습니다." : "보관 중인 B급·구형 자재가 없습니다."}</div> : <DefectDepartmentList storageMode locations={storage} currentEmployee={currentEmployee} onProcess={onRestore} onMoveToStorage={setSelected} onMemoUpdated={onMemoUpdated} searchActive={search.trim().length > 0} />}
    </>}
    {selected && <ManagementCategoryModal location={selected} currentEmployee={currentEmployee} onClose={() => setSelected(null)} onUpdated={(category) => { onUpdated(selected.record_id, category); setSelected(null); }} />}
  </div>;
}

export function ManagementCategoryModal({
  location,
  currentEmployee,
  onClose,
  onUpdated,
}: {
  location: DefectLocation;
  currentEmployee: { employee_id: string };
  onClose: () => void;
  onUpdated: (category: DefectManagementCategory) => void;
}) {
  const initialCategory = categoryOf(location);
  const [mounted, setMounted] = useState(false);
  const [category, setCategory] = useState(initialCategory);
  const [memo, setMemo] = useState("");
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  async function save() {
    if (pin.length !== PIN_LENGTH || saving || category === initialCategory) return;
    setSaving(true);
    setError(null);
    try {
      await defectsApi.updateManagementCategory(location.record_id, {
        management_category: category,
        expected_management_category: initialCategory,
        memo: memo || null,
        actor_employee_id: currentEmployee.employee_id,
        pin,
      });
      onUpdated(category);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "분류 변경에 실패했습니다.");
      setPin("");
    } finally {
      setSaving(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="보관 분류 변경"
      className="fixed inset-0 z-[450] flex items-end justify-center bg-black/[0.55] p-4 backdrop-blur-sm sm:items-center"
    >
      <form
        data-testid="management-category-panel"
        className="w-full max-w-lg rounded-[24px] border p-5"
        style={{
          background: "var(--c-popup-bg)",
          borderColor: LEGACY_COLORS.border,
          boxShadow: "var(--c-popup-shadow)",
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-black" style={{ color: LEGACY_COLORS.text }}>보관 분류 변경</h3>
          <DesktopPanelCloseButton ariaLabel="닫기" onClick={onClose} />
        </div>

        <div
          className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-[12px] border px-4 py-3 text-sm"
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
        >
          <span className="col-span-2 font-black" style={{ color: LEGACY_COLORS.text }}>{location.item_name}</span>
          <span>부서 {location.department}</span>
          <span>남은 수량 {location.available_quantity}개</span>
        </div>

        <div className="mt-3">
          <DefectManagementCategoryControl
            fullWidth
            excludedValue={initialCategory}
            value={category}
            onChange={setCategory}
          />
        </div>

        <textarea
          aria-label="분류 변경 메모"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          className="mt-3 h-24 w-full resize-none rounded-[12px] border p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-purple)]"
          placeholder="변경 사유 메모"
          style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text }}
        />
        <input
          aria-label="직원 PIN"
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void save();
          }}
          inputMode="numeric"
          type="password"
          className="mt-2 min-h-11 w-full rounded-[12px] border px-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-purple)]"
          placeholder="직원 PIN"
          style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text }}
        />
        {error && <p className="mt-2 text-sm font-bold" style={{ color: LEGACY_COLORS.red }}>{error}</p>}

        <div className="mt-3 flex gap-2">
          <button
            type="submit"
            disabled={pin.length !== PIN_LENGTH || saving || category === initialCategory}
            className="standard-hover min-h-11 rounded-[12px] px-4 text-sm font-black text-white disabled:opacity-40"
            style={{ background: LEGACY_COLORS.purpleSolid }}
          >
            변경 저장
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
