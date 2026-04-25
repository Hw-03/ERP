"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  Check,
  ChevronDown,
  Package,
  PackageCheck,
  Pencil,
  Search,
  Workflow,
  RotateCcw,
  X,
} from "lucide-react";
import { EmptyState } from "./common/EmptyState";
import type { LucideIcon } from "lucide-react";
import type { Department, Employee, Item, ProductModel, ShipPackage } from "@/lib/api";
import { SelectedItemsPanel } from "./SelectedItemsPanel";
import {
  LEGACY_COLORS,
  employeeColor,
  firstEmployeeLetter,
  formatNumber,
  getStockState,
  normalizeDepartment,
} from "./legacyUi";

// ───────────────────────────── Types ─────────────────────────────

export type WorkType =
  | "raw-io"
  | "warehouse-io"
  | "dept-io"
  | "package-out"
  | "defective-register"
  | "supplier-return";
export type Direction = "in" | "out";
export type TransferDirection = "wh-to-dept" | "dept-to-wh";
export type DefectiveSource = "warehouse" | "production";

// ─────────────────────────── Constants ───────────────────────────

export const PAGE_SIZE = 100;

export const PROD_DEPTS: Department[] = ["조립", "고압", "진공", "튜닝", "튜브", "출하"];

export const WORK_TYPES: { id: WorkType; label: string; icon: LucideIcon; description: string }[] = [
  { id: "raw-io", label: "원자재 입출고", icon: Boxes, description: "창고 기준 입고/출고" },
  { id: "warehouse-io", label: "창고 이동", icon: ArrowLeftRight, description: "창고↔생산부서 이동" },
  { id: "dept-io", label: "부서 입출고", icon: Workflow, description: "생산부서 기준 입고/출고" },
  { id: "package-out", label: "패키지 출고", icon: PackageCheck, description: "등록된 묶음 출고" },
  { id: "defective-register", label: "불량 등록", icon: AlertTriangle, description: "불량 격리 처리" },
  { id: "supplier-return", label: "공급업체 반품", icon: RotateCcw, description: "공급업체 반품 처리" },
];

export const CAUTION_WORK_TYPES: WorkType[] = ["defective-register", "supplier-return"];

export const DEPT_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "창고", value: "창고" },
  { label: "튜브", value: "튜브" },
  { label: "고압", value: "고압" },
  { label: "진공", value: "진공" },
  { label: "튜닝", value: "튜닝" },
  { label: "조립", value: "조립" },
  { label: "출하", value: "출하" },
];

export const CATEGORY_LABEL: Record<string, string> = {
  RM: "원자재",
  TA: "튜브조립",
  HA: "고압조립",
  VA: "진공조립",
  BA: "브라켓",
  TF: "튜브반제",
  HF: "고압반제",
  VF: "진공반제",
  AF: "조립반제",
  FG: "완제품",
};

// ─────────────────────────── Helpers ─────────────────────────────

export function matchesSearch(item: Item, keyword: string) {
  if (!keyword) return true;
  const haystack = [
    item.erp_code,
    item.item_name,
    item.barcode ?? "",
    item.spec ?? "",
    item.legacy_model ?? "",
    item.legacy_part ?? "",
    item.location ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(keyword);
}

export function workTypeNeedsDept(wt: WorkType): boolean {
  return (
    wt === "warehouse-io"
    || wt === "dept-io"
    || wt === "defective-register"
    || wt === "supplier-return"
  );
}

// ─────────────────────────── Atoms ───────────────────────────────

function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[9px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-[10px] border px-2 py-1.5 pr-6 text-xs font-semibold outline-none"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2" style={{ color: LEGACY_COLORS.muted2 }} />
      </div>
    </label>
  );
}

function SettingLabel({ label }: { label: string }) {
  return (
    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
      {label}
    </div>
  );
}

// ───────────────────────── WizardStepCard ────────────────────────

type StepState = "active" | "complete" | "locked";

export function WizardStepCard({
  n,
  title,
  state,
  summary,
  onChange,
  accent,
  children,
}: {
  n: number;
  title: string;
  state: StepState;
  summary?: React.ReactNode;
  onChange?: () => void;
  accent?: string;
  children?: React.ReactNode;
}) {
  const tone = accent ?? LEGACY_COLORS.blue;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const animStyle = {
    opacity: mounted ? 1 : 0,
    transform: mounted ? "translateY(0)" : "translateY(-4px)",
    transition:
      "opacity 200ms ease, transform 200ms ease, border-color 240ms cubic-bezier(0.16,1,0.3,1), background-color 240ms ease, padding 240ms ease",
  } as const;

  if (state === "active") {
    return (
      <section
        className="rounded-[24px] border-2 p-6"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: `color-mix(in srgb, ${tone} 50%, transparent)`,
          boxShadow: "var(--c-card-shadow)",
          backgroundImage: "var(--c-panel-glow)",
          ...animStyle,
        }}
      >
        <header className="mb-5 flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-black text-white"
            style={{ background: tone }}
          >
            {n}
          </span>
          <div className="min-w-0">
            <div className="text-xl font-black leading-tight" style={{ color: LEGACY_COLORS.text }}>
              {title}
            </div>
          </div>
        </header>
        {children}
      </section>
    );
  }

  if (state === "complete") {
    const handleKey = (e: React.KeyboardEvent<HTMLElement>) => {
      if (!onChange) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onChange();
      }
    };
    return (
      <section
        role={onChange ? "button" : undefined}
        tabIndex={onChange ? 0 : undefined}
        onClick={onChange}
        onKeyDown={onChange ? handleKey : undefined}
        className="group flex items-center gap-3 rounded-[18px] border px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: `color-mix(in srgb, ${LEGACY_COLORS.green} 30%, ${LEGACY_COLORS.border})`,
          cursor: onChange ? "pointer" : "default",
          ...animStyle,
        }}
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ background: LEGACY_COLORS.green }}
        >
          <Check className="h-4 w-4" color="#041008" strokeWidth={3} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="text-[10px] font-bold uppercase tracking-[1.5px]"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            {n}. {title}
          </div>
          <div className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
            {summary}
          </div>
        </div>
        {onChange && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange();
            }}
            className="flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors group-hover:brightness-125"
            style={{
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 30%, ${LEGACY_COLORS.border})`,
              color: LEGACY_COLORS.blue,
              background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent)`,
            }}
          >
            <Pencil className="h-3 w-3" />
            변경
          </button>
        )}
      </section>
    );
  }

  // locked
  return (
    <section
      className="pointer-events-none flex items-center gap-3 rounded-[18px] border px-4 py-3 opacity-50"
      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, ...animStyle }}
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black"
        style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.muted2 }}
      >
        {n}
      </span>
      <div className="min-w-0 flex-1 text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
        {title}
      </div>
    </section>
  );
}

// ─────────────────────────── Step 1: 담당자 ─────────────────────────

export function EmployeeStep({
  employees,
  selectedId,
  onSelect,
  expanded,
  setExpanded,
}: {
  employees: Employee[];
  selectedId: string;
  onSelect: (id: string) => void;
  expanded: boolean;
  setExpanded: (e: boolean) => void;
}) {
  const visible = expanded ? employees : employees.slice(0, 10);
  const overflow = !expanded && employees.length > 10;

  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {visible.map((emp) => {
          const active = emp.employee_id === selectedId;
          const tone = employeeColor(emp.department);
          return (
            <button
              key={emp.employee_id}
              onClick={() => onSelect(emp.employee_id)}
              className="flex flex-col items-center gap-1.5 rounded-[14px] border p-3 transition-all hover:brightness-110"
              style={{
                background: active ? `color-mix(in srgb, ${tone} 14%, transparent)` : LEGACY_COLORS.s2,
                borderColor: active ? tone : LEGACY_COLORS.border,
                borderWidth: active ? 2 : 1,
              }}
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full text-base font-black text-white"
                style={{ background: tone }}
              >
                {firstEmployeeLetter(emp.name)}
              </span>
              <span className="text-xs font-bold" style={{ color: active ? tone : LEGACY_COLORS.text }}>
                {emp.name}
              </span>
              <span className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                {normalizeDepartment(emp.department)}
              </span>
            </button>
          );
        })}
        {overflow && (
          <button
            onClick={() => setExpanded(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-[14px] border-2 border-dashed p-3 text-xs font-bold transition-colors hover:brightness-110"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
          >
            <span className="text-2xl leading-none">+</span>
            <span>추가 {employees.length - 10}명</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── Step 2: 작업 유형 ─────────────────────

export function WorkTypeStep({
  workType,
  onWorkTypeChange,
  rawDirection,
  setRawDirection,
  warehouseDirection,
  setWarehouseDirection,
  deptDirection,
  setDeptDirection,
  selectedDept,
  setSelectedDept,
  defectiveSource,
  setDefectiveSource,
  ready,
  onConfirm,
}: {
  workType: WorkType;
  onWorkTypeChange: (wt: WorkType) => void;
  rawDirection: Direction;
  setRawDirection: (d: Direction) => void;
  warehouseDirection: TransferDirection;
  setWarehouseDirection: (d: TransferDirection) => void;
  deptDirection: Direction;
  setDeptDirection: (d: Direction) => void;
  selectedDept: Department;
  setSelectedDept: (d: Department) => void;
  defectiveSource: DefectiveSource;
  setDefectiveSource: (s: DefectiveSource) => void;
  ready: boolean;
  onConfirm: () => void;
}) {
  const isCaution = CAUTION_WORK_TYPES.includes(workType);
  const accent = isCaution ? LEGACY_COLORS.red : LEGACY_COLORS.blue;

  const directionButtons =
    workType === "raw-io"
      ? [
          { id: "in", label: "창고에 입고", active: rawDirection === "in", onClick: () => setRawDirection("in") },
          { id: "out", label: "창고에서 출고", active: rawDirection === "out", onClick: () => setRawDirection("out") },
        ]
      : workType === "warehouse-io"
        ? [
            { id: "wh-to-dept", label: `창고→${selectedDept}`, active: warehouseDirection === "wh-to-dept", onClick: () => setWarehouseDirection("wh-to-dept") },
            { id: "dept-to-wh", label: `${selectedDept}→창고`, active: warehouseDirection === "dept-to-wh", onClick: () => setWarehouseDirection("dept-to-wh") },
          ]
        : workType === "dept-io"
          ? [
              { id: "in", label: `${selectedDept}에 입고`, active: deptDirection === "in", onClick: () => setDeptDirection("in") },
              { id: "out", label: `${selectedDept}에서 출고`, active: deptDirection === "out", onClick: () => setDeptDirection("out") },
            ]
          : [];

  return (
    <div className="space-y-5">
      {/* 작업 유형 grid */}
      <div>
        <SettingLabel label="작업 유형 선택" />
        <div className="grid grid-cols-3 gap-2">
          {WORK_TYPES.map((entry) => {
            const Icon = entry.icon;
            const active = entry.id === workType;
            const cardTone = CAUTION_WORK_TYPES.includes(entry.id) ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
            return (
              <button
                key={entry.id}
                onClick={() => onWorkTypeChange(entry.id)}
                className="flex flex-col items-start gap-1 rounded-[14px] border p-3 text-left transition-all hover:brightness-110"
                style={{
                  background: active ? `color-mix(in srgb, ${cardTone} 14%, transparent)` : LEGACY_COLORS.s2,
                  borderColor: active ? cardTone : LEGACY_COLORS.border,
                  borderWidth: active ? 2 : 1,
                  color: active ? cardTone : LEGACY_COLORS.text,
                }}
              >
                <div className="flex items-center gap-1.5">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="text-sm font-black leading-tight">{entry.label}</span>
                </div>
                <span
                  className="text-[10px] font-semibold leading-tight"
                  style={{ color: active ? cardTone : LEGACY_COLORS.muted2 }}
                >
                  {entry.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 이동 방향 */}
      {directionButtons.length > 0 && (
        <div>
          <SettingLabel label="이동 방향" />
          <div className="grid grid-cols-2 gap-2">
            {directionButtons.map((btn) => (
              <button
                key={btn.id}
                onClick={btn.onClick}
                className="flex items-center justify-center gap-1.5 rounded-[12px] border px-3 py-2.5 text-sm font-bold transition-all hover:brightness-110"
                style={{
                  background: btn.active ? `color-mix(in srgb, ${accent} 14%, transparent)` : LEGACY_COLORS.s2,
                  borderColor: btn.active ? accent : LEGACY_COLORS.border,
                  color: btn.active ? accent : LEGACY_COLORS.muted2,
                }}
              >
                {btn.active && <Check className="h-3.5 w-3.5" />}
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 부서 */}
      {workTypeNeedsDept(workType) && (
        <div>
          <SettingLabel
            label={
              workType === "supplier-return"
                ? "반품할 부서"
                : workType === "defective-register"
                  ? "불량 격리 부서"
                  : "대상 부서"
            }
          />
          <div className="grid grid-cols-6 gap-2">
            {PROD_DEPTS.map((d) => {
              const active = d === selectedDept;
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDept(d)}
                  className="rounded-[12px] border px-1 py-2 text-sm font-bold transition-all hover:brightness-110"
                  style={{
                    background: active ? `color-mix(in srgb, ${LEGACY_COLORS.purple} 14%, transparent)` : LEGACY_COLORS.s2,
                    borderColor: active ? LEGACY_COLORS.purple : LEGACY_COLORS.border,
                    color: active ? LEGACY_COLORS.purple : LEGACY_COLORS.muted2,
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 불량 발견 위치 */}
      {workType === "defective-register" && (
        <div>
          <SettingLabel label="불량 발견 위치" />
          <div className="grid grid-cols-2 gap-2">
            {(["warehouse", "production"] as DefectiveSource[]).map((src) => {
              const active = src === defectiveSource;
              const label = src === "warehouse" ? "창고에서 발견" : `${selectedDept}에서 발견`;
              return (
                <button
                  key={src}
                  onClick={() => setDefectiveSource(src)}
                  className="rounded-[12px] border px-3 py-2.5 text-sm font-bold transition-all hover:brightness-110"
                  style={{
                    background: active ? `color-mix(in srgb, ${LEGACY_COLORS.red} 14%, transparent)` : LEGACY_COLORS.s2,
                    borderColor: active ? LEGACY_COLORS.red : LEGACY_COLORS.border,
                    color: active ? LEGACY_COLORS.red : LEGACY_COLORS.muted2,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 주의 사항 */}
      {isCaution && (
        <div
          className="flex items-start gap-2 rounded-[14px] border p-3"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 8%, transparent)`,
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 40%, transparent)`,
          }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.yellow }} />
          <div className="text-[12px]" style={{ color: LEGACY_COLORS.text }}>
            {workType === "defective-register"
              ? "불량 등록은 재고가 격리 상태로 이동합니다. 대상 부서·발견 위치를 다시 한 번 확인하세요."
              : "공급업체 반품은 되돌릴 수 없습니다. 반품 부서와 수량을 확인하세요."}
          </div>
        </div>
      )}

      {/* 진행 버튼 */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onConfirm}
          disabled={!ready}
          className="rounded-[14px] px-6 py-3 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50"
          style={{ background: accent }}
        >
          이 작업으로 진행 →
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────── Step 3: 품목 선택 ─────────────────────

export function ItemPickStep({
  workType,
  filteredItems,
  filteredPackages,
  selectedItems,
  selectedPackage,
  onToggleItem,
  onSelectPackage,
  productModels,
  dept,
  setDept,
  modelFilter,
  setModelFilter,
  categoryFilter,
  setCategoryFilter,
  localSearch,
  setLocalSearch,
  displayLimit,
  setDisplayLimit,
  pendingScrollId,
  onScrolled,
}: {
  workType: WorkType;
  filteredItems: Item[];
  filteredPackages: ShipPackage[];
  selectedItems: Map<string, number>;
  selectedPackage: ShipPackage | null;
  onToggleItem: (id: string) => void;
  onSelectPackage: (pkg: ShipPackage | null) => void;
  productModels: ProductModel[];
  dept: string;
  setDept: (v: string) => void;
  modelFilter: string;
  setModelFilter: (v: string) => void;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  localSearch: string;
  setLocalSearch: (v: string) => void;
  displayLimit: number;
  setDisplayLimit: Dispatch<SetStateAction<number>>;
  pendingScrollId: string | null;
  onScrolled: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pendingScrollId || !listRef.current) return;
    const row = listRef.current.querySelector(`[data-item-id="${pendingScrollId}"]`);
    if (row) {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
      onScrolled();
    }
  }, [pendingScrollId, filteredItems, onScrolled]);

  const isPackage = workType === "package-out";

  const filteredItemIds = useMemo(
    () => new Set(filteredItems.map((it) => it.item_id)),
    [filteredItems],
  );
  const hiddenSelectedCount = useMemo(
    () =>
      isPackage
        ? 0
        : Array.from(selectedItems.keys()).filter((id) => !filteredItemIds.has(id)).length,
    [selectedItems, filteredItemIds, isPackage],
  );
  const hasActiveFilter =
    !isPackage && (dept !== "ALL" || modelFilter !== "전체" || categoryFilter !== "ALL" || !!localSearch);

  function clearFilters() {
    setDept("ALL");
    setModelFilter("전체");
    setCategoryFilter("ALL");
    setLocalSearch("");
  }

  return (
    <div className="space-y-3">
      {/* 필터로 가려진 선택 품목 안내 */}
      {hiddenSelectedCount > 0 && (
        <div
          className="flex items-center justify-between gap-3 rounded-[12px] border px-3 py-2 text-xs"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 10%, transparent)`,
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 40%, transparent)`,
            color: LEGACY_COLORS.yellow,
          }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate font-bold">
              선택한 {hiddenSelectedCount}건이 현재 필터로 가려졌습니다
            </span>
          </div>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="shrink-0 rounded-[10px] border px-2.5 py-1 text-[11px] font-bold transition-colors hover:brightness-125"
              style={{
                borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 40%, transparent)`,
                color: LEGACY_COLORS.yellow,
                background: "transparent",
              }}
            >
              필터 해제
            </button>
          )}
        </div>
      )}

      {/* 필터 */}
      {!isPackage ? (
        <div className="grid grid-cols-[1fr_1fr_1fr_2fr] gap-2">
          <LabeledSelect
            label="부서"
            value={dept}
            onChange={setDept}
            options={DEPT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
          <LabeledSelect
            label="모델"
            value={modelFilter}
            onChange={setModelFilter}
            options={["전체", "공용", ...productModels.map((m) => m.model_name ?? "")].map((v) => ({ value: v, label: v }))}
          />
          <LabeledSelect
            label="분류"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: "ALL", label: "전체" },
              { value: "RM", label: "원자재" },
              { value: "A", label: "조립품" },
              { value: "F", label: "반제품" },
              { value: "FG", label: "완제품" },
            ]}
          />
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
              검색
            </span>
            <div
              className="flex items-center gap-1.5 rounded-[10px] border px-2 py-1.5"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <Search className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
              <input
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="품목명 · ERP코드 · 바코드"
                className="flex-1 bg-transparent text-xs outline-none"
                style={{ color: LEGACY_COLORS.text }}
              />
            </div>
          </label>
        </div>
      ) : (
        <div
          className="flex items-center gap-2 rounded-[12px] border px-3 py-2"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
          <input
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="패키지명 · 코드"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: LEGACY_COLORS.text }}
          />
        </div>
      )}

      {/* 결과 영역 */}
      <div
        ref={listRef}
        className="scrollbar-hide max-h-[440px] overflow-y-auto rounded-[16px] border"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, overscrollBehavior: "contain" }}
      >
        {isPackage ? (
          <ul className="space-y-1.5 p-2">
            {filteredPackages.map((pkg) => {
              const active = selectedPackage?.package_id === pkg.package_id;
              return (
                <li key={pkg.package_id}>
                  <button
                    onClick={() => onSelectPackage(active ? null : pkg)}
                    className="flex w-full items-center justify-between gap-2 rounded-[14px] px-3 py-2.5 text-left transition-colors hover:brightness-110"
                    style={{
                      background: active ? `color-mix(in srgb, ${LEGACY_COLORS.purple} 14%, transparent)` : LEGACY_COLORS.s1,
                      borderLeft: `3px solid ${active ? LEGACY_COLORS.purple : "transparent"}`,
                    }}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
                        {pkg.name}
                      </div>
                      <div className="mt-0.5 truncate text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                        {pkg.package_code} · {pkg.items.length}종
                      </div>
                    </div>
                    {active && <Check className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.purple }} />}
                  </button>
                </li>
              );
            })}
            {filteredPackages.length === 0 && (
              <li>
                <EmptyState
                  variant={localSearch ? "no-search-result" : "no-data"}
                  compact
                  description={localSearch ? "검색어를 다시 확인해 주세요." : "등록된 패키지가 없습니다."}
                />
              </li>
            )}
          </ul>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10" style={{ background: LEGACY_COLORS.s2 }}>
              <tr
                className="text-left text-[10px] font-bold uppercase tracking-[1.5px]"
                style={{ color: LEGACY_COLORS.muted2 }}
              >
                <th className="w-10 px-3 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}></th>
                <th className="px-2 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>품목명 (ERP 코드)</th>
                <th className="px-2 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>모델</th>
                <th className="px-2 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>분류</th>
                <th className="px-2 py-2 text-center" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>상태</th>
                <th className="px-3 py-2 text-right" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>현재 재고</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.slice(0, displayLimit).map((item) => {
                const active = selectedItems.has(item.item_id);
                const stock = getStockState(Number(item.quantity), item.min_stock == null ? null : Number(item.min_stock));
                const categoryLabel = item.category ? (CATEGORY_LABEL[item.category] ?? item.category) : "-";
                return (
                  <tr
                    key={item.item_id}
                    data-item-id={item.item_id}
                    onClick={() => onToggleItem(item.item_id)}
                    className="cursor-pointer transition-colors hover:brightness-110"
                    style={{
                      background: active ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 10%, transparent)` : "transparent",
                    }}
                  >
                    <td className="px-3 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-[4px] border"
                        style={{
                          background: active ? LEGACY_COLORS.blue : "transparent",
                          borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                        }}
                      >
                        {active && <Check className="h-3.5 w-3.5 text-white" />}
                      </span>
                    </td>
                    <td className="px-2 py-2" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                      <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
                        {item.item_name}
                      </span>
                      <span className="ml-1 text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                        ({item.erp_code ?? "-"})
                      </span>
                    </td>
                    <td className="px-2 py-2 text-xs" style={{ color: LEGACY_COLORS.muted2, borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                      {item.legacy_model ?? "-"}
                    </td>
                    <td className="px-2 py-2 text-xs" style={{ color: LEGACY_COLORS.muted2, borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                      {categoryLabel}
                    </td>
                    <td className="px-2 py-2 text-center" style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}>
                      <span
                        className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ color: stock.color, background: `color-mix(in srgb, ${stock.color} 14%, transparent)` }}
                      >
                        {stock.label}
                      </span>
                    </td>
                    <td
                      className="px-3 py-2 text-right text-sm font-black tabular-nums"
                      style={{
                        color: Number(item.quantity) > 0 ? LEGACY_COLORS.text : LEGACY_COLORS.muted2,
                        borderBottom: `1px solid ${LEGACY_COLORS.border}`,
                      }}
                    >
                      {formatNumber(item.quantity)}
                    </td>
                  </tr>
                );
              })}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-2">
                    <EmptyState
                      variant={hasActiveFilter ? "filtered-out" : "no-data"}
                      compact
                      description={
                        hasActiveFilter
                          ? "필터를 해제하면 다시 표시됩니다."
                          : "조회할 품목이 없습니다."
                      }
                      action={
                        hasActiveFilter
                          ? { label: "필터 해제", onClick: clearFilters }
                          : undefined
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {!isPackage && filteredItems.length > displayLimit && (
          <div className="p-2">
            <button
              onClick={() => setDisplayLimit((prev) => prev + PAGE_SIZE)}
              className="w-full rounded-[12px] border py-2.5 text-xs font-semibold"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
            >
              100개 더 보기 ({formatNumber(Math.min(displayLimit + PAGE_SIZE, filteredItems.length))} / {formatNumber(filteredItems.length)})
            </button>
          </div>
        )}
      </div>

      {/* 선택 현황 요약 */}
      <div
        className="flex items-center justify-between rounded-[12px] border px-3 py-2"
        style={{
          background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 6%, transparent)`,
          borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 24%, transparent)`,
        }}
      >
        <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          {isPackage
            ? selectedPackage
              ? `선택됨: ${selectedPackage.name}`
              : "선택된 패키지 없음"
            : selectedItems.size > 0
              ? `선택됨: ${selectedItems.size}건`
              : "선택된 품목 없음"}
        </span>
        {(isPackage ? !!selectedPackage : selectedItems.size > 0) && (
          <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.blue }}>
            아래에서 수량을 조정하세요 ↓
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── Step 4: 수량 · 메모 ───────────────────

export function QuantityStep({
  workType,
  selectedEntries,
  isOutbound,
  selectedPackage,
  onQuantityChange,
  onRemove,
  onClearPackage,
  notes,
  setNotes,
  totalQty,
}: {
  workType: WorkType;
  selectedEntries: { item: Item; quantity: number }[];
  isOutbound: boolean;
  selectedPackage: ShipPackage | null;
  onQuantityChange: (itemId: string, qty: number) => void;
  onRemove: (itemId: string) => void;
  onClearPackage: () => void;
  notes: string;
  setNotes: (v: string) => void;
  totalQty: number;
}) {
  const isPackage = workType === "package-out";

  return (
    <div className="space-y-4">
      {/* 합계 표시 */}
      {!isPackage && selectedEntries.length > 0 && (
        <div
          className="flex items-center justify-between rounded-[14px] border px-4 py-2.5"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 6%, transparent)`,
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 24%, transparent)`,
          }}
        >
          <span className="text-[11px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
            {selectedEntries.length}개 품목 · 총 수량
          </span>
          <span className="text-2xl font-black tabular-nums" style={{ color: LEGACY_COLORS.blue }}>
            {formatNumber(totalQty)}
          </span>
        </div>
      )}

      {/* 본문 */}
      {isPackage ? (
        selectedPackage ? (
          <div
            className="rounded-[18px] border-2 p-4"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.purple} 6%, transparent)`,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.purple} 40%, transparent)`,
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  선택된 패키지
                </div>
                <div className="mt-1 truncate text-xl font-black" style={{ color: LEGACY_COLORS.text }}>
                  {selectedPackage.name}
                </div>
                <div className="mt-1 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                  {selectedPackage.package_code} · {selectedPackage.items.length}종 구성
                </div>
              </div>
              <button
                onClick={onClearPackage}
                className="shrink-0 rounded-full p-1 transition-colors hover:bg-white/10"
                style={{ color: LEGACY_COLORS.muted2 }}
                title="선택 해제"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {selectedPackage.items.length > 0 && (
              <ul
                className="mt-4 divide-y rounded-[12px] border"
                style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}
              >
                {selectedPackage.items.map((pi, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between px-3 py-2 text-xs"
                    style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                  >
                    <span className="truncate">{pi.item_name ?? pi.item_id}</span>
                    <span className="shrink-0 font-black tabular-nums" style={{ color: LEGACY_COLORS.muted2 }}>
                      ×{formatNumber(pi.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null
      ) : (
        <div
          className="overflow-hidden rounded-[16px] border"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          <SelectedItemsPanel
            entries={selectedEntries}
            outgoing={isOutbound}
            onQuantityChange={onQuantityChange}
            onRemove={onRemove}
          />
        </div>
      )}

      {/* 메모 */}
      <label className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
            메모 (선택)
          </span>
          <span
            className="text-[10px] font-bold tabular-nums"
            style={{
              color: notes.length > 200 ? LEGACY_COLORS.red : LEGACY_COLORS.muted2,
            }}
          >
            {notes.length}/200
          </span>
        </div>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="메모를 입력하세요"
          className="rounded-[12px] border px-3 py-2 text-sm outline-none"
          style={{
            background: LEGACY_COLORS.s2,
            borderColor:
              notes.length > 200
                ? `color-mix(in srgb, ${LEGACY_COLORS.red} 50%, transparent)`
                : LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
        />
      </label>
    </div>
  );
}

// ─────────────────────────── Step 5: 실행 ──────────────────────────

export function ExecuteStep({
  shortLabel,
  workType,
  selectedEntries,
  canExecute,
  isCaution,
  accent,
  blockerText,
  submitting,
  onSubmit,
}: {
  shortLabel: string;
  workType: WorkType;
  selectedEntries: { item: Item; quantity: number }[];
  canExecute: boolean;
  isCaution: boolean;
  accent: string;
  blockerText: string | null;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const isPackage = workType === "package-out";
  const buttonMulti = !isPackage && selectedEntries.length > 1 ? ` ${selectedEntries.length}건` : "";
  const buttonLabel = submitting ? "처리 중..." : `${shortLabel}${buttonMulti} 실행`;

  return (
    <div className="space-y-3">
      {/* caution 안내 */}
      {isCaution && (
        <div
          className="flex items-start gap-2 rounded-[12px] border px-3 py-2 text-xs"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)`,
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 40%, transparent)`,
            color: LEGACY_COLORS.red,
          }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="font-bold">되돌릴 수 없습니다. 최종 확인 팝업에서 한 번 더 점검하세요.</span>
        </div>
      )}

      {/* blocker */}
      {blockerText && (
        <div
          className="rounded-[12px] border px-3 py-2 text-center text-xs font-bold"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 10%, transparent)`,
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 40%, transparent)`,
            color: LEGACY_COLORS.yellow,
          }}
        >
          {blockerText}
        </div>
      )}

      {/* 실행 버튼 */}
      <button
        onClick={onSubmit}
        disabled={submitting || !canExecute}
        className="flex w-full items-center justify-center gap-2 rounded-[18px] px-6 py-5 text-lg font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50"
        style={{ background: accent }}
      >
        {isCaution && !submitting && <AlertTriangle className="h-5 w-5" />}
        {buttonLabel}
      </button>
    </div>
  );
}
