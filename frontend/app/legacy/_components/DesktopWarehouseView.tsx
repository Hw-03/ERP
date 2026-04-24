"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Boxes, Check, ChevronDown, Package, PackageCheck, RotateCcw, Search, Workflow, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, type Department, type Employee, type Item, type ProductModel, type ShipPackage, type TransactionLog } from "@/lib/api";
import { SelectedItemsPanel } from "./SelectedItemsPanel";
import {
  LEGACY_COLORS,
  employeeColor,
  firstEmployeeLetter,
  formatNumber,
  getStockState,
  normalizeDepartment,
} from "./legacyUi";

const PAGE_SIZE = 100;

const DEPT_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "창고", value: "창고" },
  { label: "튜브", value: "튜브" },
  { label: "고압", value: "고압" },
  { label: "진공", value: "진공" },
  { label: "튜닝", value: "튜닝" },
  { label: "조립", value: "조립" },
  { label: "출하", value: "출하" },
];

type WorkType =
  | "raw-io"
  | "warehouse-io"
  | "dept-io"
  | "package-out"
  | "defective-register"
  | "supplier-return";
type Direction = "in" | "out";
type TransferDirection = "wh-to-dept" | "dept-to-wh";
type DefectiveSource = "warehouse" | "production";

const PROD_DEPTS: Department[] = ["조립", "고압", "진공", "튜닝", "튜브", "출하"];

const WORK_TYPES: { id: WorkType; label: string; icon: React.ElementType; description: string }[] = [
  { id: "raw-io", label: "원자재 입출고", icon: Boxes, description: "창고 기준 입고/출고" },
  { id: "warehouse-io", label: "창고 이동", icon: ArrowLeftRight, description: "창고↔생산부서 이동" },
  { id: "dept-io", label: "부서 입출고", icon: Workflow, description: "생산부서 기준 입고/출고" },
  { id: "package-out", label: "패키지 출고", icon: PackageCheck, description: "등록된 묶음 출고" },
  { id: "defective-register", label: "불량 등록", icon: AlertTriangle, description: "불량 격리 처리" },
  { id: "supplier-return", label: "공급업체 반품", icon: RotateCcw, description: "공급업체 반품 처리" },
];

const CAUTION_WORK_TYPES: WorkType[] = ["defective-register", "supplier-return"];

const CATEGORY_LABEL: Record<string, string> = {
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

function matchesSearch(item: Item, keyword: string) {
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

function SettingLabel({ n, label, done }: { n?: number; label: string; done?: boolean }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      {n != null && (
        <span
          className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black"
          style={{
            background: done ? LEGACY_COLORS.blue : LEGACY_COLORS.s3,
            color: done ? "#fff" : LEGACY_COLORS.muted2,
          }}
        >
          {done ? <Check className="h-2.5 w-2.5" /> : n}
        </span>
      )}
      <span className="text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </span>
      {done && n == null && <Check className="h-3 w-3" style={{ color: LEGACY_COLORS.green }} />}
    </div>
  );
}

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

function SummaryRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[11px] font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>{label}</dt>
      <dd className="truncate text-xs font-black tabular-nums text-right" style={{ color: muted ? LEGACY_COLORS.muted2 : LEGACY_COLORS.text }}>
        {value}
      </dd>
    </div>
  );
}

function EmptySelectionBox({
  icon: Icon,
  title,
  description,
  accent,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  accent: string;
}) {
  return (
    <div
      className="flex h-full min-h-[200px] flex-col items-center justify-center rounded-[22px] border-2 border-dashed px-6 py-8 text-center"
      style={{
        borderColor: `color-mix(in srgb, ${accent} 30%, ${LEGACY_COLORS.border})`,
        background: `color-mix(in srgb, ${accent} 3%, transparent)`,
      }}
    >
      <div
        className="mb-3 flex h-12 w-12 items-center justify-center rounded-full"
        style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent }}
      >
        <Icon className="h-6 w-6" />
      </div>
      <div className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>
        {title}
      </div>
      <div className="mt-1.5 max-w-[320px] whitespace-pre-line text-xs leading-relaxed" style={{ color: LEGACY_COLORS.muted2 }}>
        {description}
      </div>
    </div>
  );
}

export function DesktopWarehouseView({
  globalSearch,
  onStatusChange,
  preselectedItem,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
  preselectedItem?: Item | null;
}) {
  const [workType, setWorkType] = useState<WorkType>("raw-io");
  const [rawDirection, setRawDirection] = useState<Direction>("in");
  const [warehouseDirection, setWarehouseDirection] = useState<TransferDirection>("wh-to-dept");
  const [deptDirection, setDeptDirection] = useState<Direction>("in");
  const [selectedDept, setSelectedDept] = useState<Department>("조립");
  const [defectiveSource, setDefectiveSource] = useState<DefectiveSource>("warehouse");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [selectedItems, setSelectedItems] = useState<Map<string, number>>(new Map());
  const [selectedPackage, setSelectedPackage] = useState<ShipPackage | null>(null);
  const [itemLogs, setItemLogs] = useState<TransactionLog[]>([]);
  const [localSearch, setLocalSearch] = useState("");
  const [dept, setDept] = useState("ALL");
  const [modelFilter, setModelFilter] = useState("전체");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);
  const [productModels, setProductModels] = useState<ProductModel[]>([]);
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ count: number; label: string } | null>(null);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
  const [employeeExpanded, setEmployeeExpanded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void api.getModels().then(setProductModels).catch(() => {});
  }, []);

  useEffect(() => {
    void Promise.all([
      api.getEmployees({ activeOnly: true }),
      api.getItems({ limit: 2000, search: globalSearch.trim() || undefined }),
      api.getShipPackages(),
    ])
      .then(([nextEmployees, nextItems, nextPackages]) => {
        setEmployees(nextEmployees);
        setItems(nextItems);
        setPackages(nextPackages);
        onStatusChange(`입출고 준비 완료: 직원 ${nextEmployees.length}명, 품목 ${nextItems.length}건`);
      })
      .catch((nextError) => {
        onStatusChange(nextError instanceof Error ? nextError.message : "입출고 데이터를 불러오지 못했습니다.");
      });
  }, [globalSearch, onStatusChange]);

  useEffect(() => {
    if (preselectedItem) {
      setSelectedItems(new Map([[preselectedItem.item_id, 1]]));
      setPendingScrollId(preselectedItem.item_id);
    }
  }, [preselectedItem]);

  const selectedEntries = useMemo(
    () =>
      Array.from(selectedItems.entries())
        .map(([id, qty]) => ({ item: items.find((i) => i.item_id === id)!, quantity: qty }))
        .filter((e) => e.item != null),
    [selectedItems, items],
  );

  const singleSelectedItem = selectedEntries.length === 1 ? selectedEntries[0].item : null;

  useEffect(() => {
    if (!singleSelectedItem) {
      setItemLogs([]);
      return;
    }
    void api.getTransactions({ itemId: singleSelectedItem.item_id, limit: 8 }).then(setItemLogs).catch(() => setItemLogs([]));
  }, [singleSelectedItem]);

  const selectedEmployee = employees.find((e) => e.employee_id === employeeId) ?? null;
  const searchKeyword = `${globalSearch} ${localSearch}`.trim().toLowerCase();

  const isOutbound =
    workType === "raw-io"
      ? rawDirection === "out"
      : workType === "warehouse-io"
        ? warehouseDirection === "wh-to-dept"
        : workType === "dept-io"
          ? deptDirection === "out"
          : true;

  const effectiveLabel =
    workType === "raw-io"
      ? `원자재 ${rawDirection === "in" ? "입고" : "출고"}`
      : workType === "warehouse-io"
        ? warehouseDirection === "wh-to-dept"
          ? `창고→${selectedDept} 이동`
          : `${selectedDept}→창고 복귀`
        : workType === "dept-io"
          ? `${selectedDept} ${deptDirection === "in" ? "입고" : "출고"}`
          : workType === "defective-register"
            ? `불량 등록 (${defectiveSource === "warehouse" ? "창고" : selectedDept} → ${selectedDept} 격리)`
            : workType === "supplier-return"
              ? `공급업체 반품 (${selectedDept} 불량)`
              : "패키지 출고";

  const shortLabel = effectiveLabel.replace(/\s*\(.*\)\s*$/, "");
  const totalQty = Array.from(selectedItems.values()).reduce((sum, q) => sum + q, 0);
  const quantityInvalid =
    workType !== "package-out" && selectedEntries.some((e) => e.quantity <= 0);
  const canExecute =
    !!selectedEmployee
    && (workType === "package-out" ? !!selectedPackage : selectedEntries.length > 0)
    && !quantityInvalid;
  const accent = isOutbound ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
  const isCaution = CAUTION_WORK_TYPES.includes(workType);

  const filteredItems = useMemo(
    () =>
      items
        .filter((item) => {
          if (dept === "ALL") return true;
          if (dept === "창고") return (item.warehouse_qty ?? 0) > 0;
          return item.locations?.some((loc) => loc.department === dept && loc.quantity > 0) ?? false;
        })
        .filter((item) => modelFilter === "전체" || item.legacy_model === modelFilter)
        .filter((item) => {
          if (categoryFilter === "ALL") return true;
          if (categoryFilter === "RM") return item.category === "RM";
          if (categoryFilter === "A") return ["TA", "HA", "VA", "BA"].includes(item.category);
          if (categoryFilter === "F") return ["TF", "HF", "VF", "AF"].includes(item.category);
          if (categoryFilter === "FG") return item.category === "FG";
          return true;
        })
        .filter((item) => matchesSearch(item, searchKeyword)),
    [items, dept, modelFilter, categoryFilter, searchKeyword],
  );

  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
  }, [filteredItems]);

  useEffect(() => {
    if (!pendingScrollId || !listRef.current) return;
    const row = listRef.current.querySelector(`[data-item-id="${pendingScrollId}"]`);
    if (row) {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
      setPendingScrollId(null);
    }
  }, [pendingScrollId, filteredItems]);

  const filteredPackages = useMemo(
    () =>
      packages.filter((pkg) =>
        searchKeyword ? `${pkg.name} ${pkg.package_code}`.toLowerCase().includes(searchKeyword) : true,
      ),
    [packages, searchKeyword],
  );

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

  async function dispatchSingleItem(item: Item, qty: number, producedBy: string) {
    const baseRef = referenceNo || undefined;
    const baseNotes = notes || undefined;
    if (workType === "raw-io") {
      const payload = { item_id: item.item_id, quantity: qty, reference_no: baseRef, produced_by: producedBy, notes: baseNotes };
      if (rawDirection === "out") await api.shipInventory(payload);
      else await api.receiveInventory(payload);
    } else if (workType === "warehouse-io") {
      const payload = { item_id: item.item_id, quantity: qty, department: selectedDept, reference_no: baseRef, produced_by: producedBy, notes: baseNotes };
      if (warehouseDirection === "wh-to-dept") await api.transferToProduction(payload);
      else await api.transferToWarehouse(payload);
    } else if (workType === "dept-io") {
      const payload = { item_id: item.item_id, quantity: qty, department: selectedDept, reference_no: baseRef, produced_by: producedBy, notes: baseNotes };
      if (deptDirection === "in") await api.transferToProduction(payload);
      else await api.transferToWarehouse(payload);
    } else if (workType === "defective-register") {
      await api.markDefective({
        item_id: item.item_id,
        quantity: qty,
        source: defectiveSource,
        source_department: defectiveSource === "production" ? selectedDept : undefined,
        target_department: selectedDept,
        reason: baseNotes,
        operator: producedBy,
      });
    } else if (workType === "supplier-return") {
      await api.returnToSupplier({ item_id: item.item_id, quantity: qty, from_department: selectedDept, reference_no: baseRef, notes: baseNotes, operator: producedBy });
    }
  }

  async function submit() {
    if (!selectedEmployee) return setError("담당 직원을 먼저 선택해 주세요.");
    if (workType === "package-out" && !selectedPackage) return setError("출고할 패키지를 선택해 주세요.");
    if (workType !== "package-out" && selectedEntries.length === 0) return setError("품목을 먼저 선택해 주세요.");
    if (workType !== "package-out" && selectedEntries.some((e) => e.quantity <= 0)) return setError("모든 선택 품목의 수량은 1 이상이어야 합니다.");

    try {
      setSubmitting(true);
      setError(null);
      const producedBy = `${selectedEmployee.name} (${normalizeDepartment(selectedEmployee.department)})`;

      if (workType === "package-out" && selectedPackage) {
        await api.shipPackage({
          package_id: selectedPackage.package_id,
          quantity: 1,
          reference_no: referenceNo || undefined,
          produced_by: producedBy,
          notes: notes || undefined,
        });
      } else {
        const failures: string[] = [];
        for (const entry of selectedEntries) {
          try {
            await dispatchSingleItem(entry.item, entry.quantity, producedBy);
          } catch {
            failures.push(entry.item.item_name);
          }
        }
        if (failures.length > 0) {
          setError(`처리 실패 품목: ${failures.join(", ")}`);
          return;
        }
      }

      const doneCount = workType !== "package-out" ? selectedEntries.length : 1;
      setReferenceNo("");
      setNotes("");
      setSelectedItems(new Map());
      const refreshed = await api.getItems({ limit: 2000, search: globalSearch.trim() || undefined });
      setItems(refreshed);
      setLastResult({ count: doneCount, label: effectiveLabel });
      onStatusChange(`${effectiveLabel} ${workType !== "package-out" ? selectedEntries.length + "건 " : ""}처리를 완료했습니다.`);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "입출고 처리를 완료하지 못했습니다.";
      setError(message);
      onStatusChange(message);
    } finally {
      setSubmitting(false);
    }
  }

  const blockerText = !selectedEmployee
    ? "담당자를 선택하세요"
    : workType === "package-out" && !selectedPackage
      ? "출고할 패키지를 선택하세요"
      : workType !== "package-out" && selectedEntries.length === 0
        ? "품목을 선택하세요"
        : quantityInvalid
          ? "수량을 확인하세요"
          : null;
  const buttonMulti =
    workType !== "package-out" && selectedEntries.length > 1
      ? ` ${selectedEntries.length}건`
      : "";
  const buttonLabel = submitting ? "처리 중..." : `${shortLabel}${buttonMulti} 실행`;

  const visibleEmployees = employeeExpanded ? employees : employees.slice(0, 9);
  const hasEmployeeOverflow = !employeeExpanded && employees.length > 9;

  function toggleSelectItem(itemId: string) {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.set(itemId, 1);
      return next;
    });
  }

  function resetAll() {
    setSelectedItems(new Map());
    setReferenceNo("");
    setNotes("");
    setEmployeeId("");
    setSelectedPackage(null);
    setError(null);
  }

  return (
    <div className="flex min-h-0 flex-1 gap-3 pl-0 pr-4">
      {/* ── LEFT: 작업 설정 + 실행 ── */}
      <aside
        className="flex h-full min-h-0 w-[32%] shrink-0 flex-col overflow-hidden rounded-[28px] border"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        <header
          className="px-5 pt-5 pb-3"
          style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>작업 설정</h2>
            <button
              onClick={resetAll}
              className="text-[11px] font-bold transition-colors hover:brightness-125"
              style={{ color: LEGACY_COLORS.blue }}
            >
              초기화
            </button>
          </div>
          <div className="mt-0.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            유형 → 방향 → 부서 → 담당자 → 실행
          </div>
        </header>

        <div className="scrollbar-hide flex-1 space-y-3 overflow-y-auto p-4">
          {lastResult && (
            <div
              className="flex items-center gap-3 rounded-[16px] border px-3 py-2.5"
              style={{
                background: `color-mix(in srgb, ${LEGACY_COLORS.green} 10%, transparent)`,
                borderColor: `color-mix(in srgb, ${LEGACY_COLORS.green} 40%, transparent)`,
              }}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: LEGACY_COLORS.green }}>
                <Check className="h-4 w-4" color="#041008" strokeWidth={3} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.green }}>
                  방금 완료
                </div>
                <div className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
                  {lastResult.label} · {lastResult.count}건
                </div>
              </div>
              <button
                className="shrink-0 rounded-full px-1.5 py-0.5 text-xs transition-colors hover:bg-white/10"
                style={{ color: LEGACY_COLORS.muted2 }}
                onClick={() => setLastResult(null)}
              >
                ✕
              </button>
            </div>
          )}

          {/* 작업 유형 */}
          <section>
            <SettingLabel n={1} label="작업 유형" />
            <div className="grid grid-cols-2 gap-1.5">
              {WORK_TYPES.map((entry) => {
                const Icon = entry.icon;
                const active = entry.id === workType;
                const cardTone = CAUTION_WORK_TYPES.includes(entry.id) ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
                return (
                  <button
                    key={entry.id}
                    onClick={() => { setWorkType(entry.id); setError(null); }}
                    className="flex flex-col items-start gap-0.5 rounded-[14px] border p-2.5 text-left transition-all hover:brightness-110"
                    style={{
                      background: active ? `color-mix(in srgb, ${cardTone} 14%, transparent)` : LEGACY_COLORS.s2,
                      borderColor: active ? cardTone : LEGACY_COLORS.border,
                      borderWidth: active ? 2 : 1,
                      color: active ? cardTone : LEGACY_COLORS.text,
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-[13px] font-black leading-tight">{entry.label}</span>
                    </div>
                    <span className="text-[10px] font-semibold leading-tight" style={{ color: active ? cardTone : LEGACY_COLORS.muted2 }}>
                      {entry.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {directionButtons.length > 0 && (
            <section>
              <SettingLabel n={2} label="이동 방향" />
              <div className="grid grid-cols-2 gap-1.5">
                {directionButtons.map((btn) => (
                  <button
                    key={btn.id}
                    onClick={btn.onClick}
                    className="flex items-center justify-center gap-1 rounded-[12px] border px-2.5 py-2 text-sm font-bold transition-all hover:brightness-110"
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
            </section>
          )}

          {(workType === "warehouse-io"
            || workType === "dept-io"
            || workType === "defective-register"
            || workType === "supplier-return") && (
            <section>
              <SettingLabel
                label={workType === "supplier-return"
                  ? "반품할 부서"
                  : workType === "defective-register"
                    ? "불량 격리 부서"
                    : "대상 부서"}
              />
              <div className="grid grid-cols-3 gap-1.5">
                {PROD_DEPTS.map((d) => {
                  const active = d === selectedDept;
                  return (
                    <button
                      key={d}
                      onClick={() => setSelectedDept(d)}
                      className="rounded-[12px] border px-1 py-1.5 text-sm font-bold transition-all hover:brightness-110"
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
            </section>
          )}

          {workType === "defective-register" && (
            <section>
              <SettingLabel label="불량 발견 위치" />
              <div className="grid grid-cols-2 gap-1.5">
                {(["warehouse", "production"] as DefectiveSource[]).map((src) => {
                  const active = src === defectiveSource;
                  const label = src === "warehouse" ? "창고에서 발견" : `${selectedDept}에서 발견`;
                  return (
                    <button
                      key={src}
                      onClick={() => setDefectiveSource(src)}
                      className="rounded-[12px] border px-2 py-2 text-sm font-bold transition-all hover:brightness-110"
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
            </section>
          )}

          {/* 담당자 (2줄 5열 그리드) */}
          <section>
            <SettingLabel n={3} label="담당자" done={!!selectedEmployee} />
            <div className="grid grid-cols-5 gap-2">
              {visibleEmployees.map((emp) => {
                const active = emp.employee_id === employeeId;
                const tone = employeeColor(emp.department);
                return (
                  <button
                    key={emp.employee_id}
                    onClick={() => setEmployeeId(emp.employee_id)}
                    className="flex flex-col items-center gap-1 rounded-[12px] border p-2 transition-all hover:brightness-110"
                    style={{
                      background: active ? `color-mix(in srgb, ${tone} 14%, transparent)` : LEGACY_COLORS.s2,
                      borderColor: active ? tone : LEGACY_COLORS.border,
                      borderWidth: active ? 2 : 1,
                    }}
                  >
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-black text-white"
                      style={{ background: tone }}
                    >
                      {firstEmployeeLetter(emp.name)}
                    </span>
                    <span className="text-[10px] font-bold" style={{ color: active ? tone : LEGACY_COLORS.text }}>
                      {emp.name}
                    </span>
                  </button>
                );
              })}
              {hasEmployeeOverflow && (
                <button
                  onClick={() => setEmployeeExpanded(true)}
                  className="flex flex-col items-center justify-center gap-0.5 rounded-[12px] border-2 border-dashed p-2 text-[10px] font-bold transition-colors hover:brightness-110"
                  style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
                >
                  <span className="text-lg leading-none">+</span>
                  <span>추가 {employees.length - 9}명</span>
                </button>
              )}
            </div>
          </section>

          {/* 실행 요약 */}
          <section
            className="rounded-[16px] border p-3"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
                실행 요약
              </div>
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black"
                style={{
                  background: canExecute ? `color-mix(in srgb, ${LEGACY_COLORS.green} 14%, transparent)` : "transparent",
                  border: `1px ${canExecute ? "solid" : "dashed"} ${canExecute ? LEGACY_COLORS.green : LEGACY_COLORS.border}`,
                  color: canExecute ? LEGACY_COLORS.green : LEGACY_COLORS.muted2,
                }}
              >
                {canExecute && <Check className="h-3 w-3" />}
                {canExecute ? "실행 가능" : "대기 중"}
              </span>
            </div>
            <dl className="space-y-1.5 text-xs">
              <SummaryRow label="작업 유형" value={WORK_TYPES.find((w) => w.id === workType)?.label ?? "-"} />
              {directionButtons.length > 0 && (
                <SummaryRow label="이동 방향" value={directionButtons.find((b) => b.active)?.label ?? "-"} />
              )}
              {(workType === "warehouse-io" || workType === "dept-io" || workType === "defective-register" || workType === "supplier-return") && (
                <SummaryRow label="대상 부서" value={selectedDept} />
              )}
              <SummaryRow
                label="담당자"
                value={selectedEmployee ? `${selectedEmployee.name} · ${normalizeDepartment(selectedEmployee.department)}` : "미선택"}
                muted={!selectedEmployee}
              />
              {workType === "package-out" ? (
                <SummaryRow label="패키지" value={selectedPackage ? selectedPackage.name : "미선택"} muted={!selectedPackage} />
              ) : (
                <>
                  <SummaryRow label="선택 품목" value={selectedEntries.length > 0 ? `${selectedEntries.length}건` : "미선택"} muted={selectedEntries.length === 0} />
                  <SummaryRow label="총 수량" value={totalQty > 0 ? `${formatNumber(totalQty)} EA` : "-"} muted={totalQty === 0} />
                </>
              )}
            </dl>
          </section>

          {/* 주의 사항 */}
          {(isCaution || quantityInvalid) && (
            <section
              className="flex items-start gap-2 rounded-[14px] border p-3"
              style={{
                background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 8%, transparent)`,
                borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 40%, transparent)`,
              }}
            >
              <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.yellow }} />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.yellow }}>
                  주의 사항
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: LEGACY_COLORS.text }}>
                  {isCaution
                    ? workType === "defective-register"
                      ? "불량 등록은 재고가 격리 상태로 이동합니다. 대상 부서·발견 위치를 확인하세요."
                      : "공급업체 반품은 되돌릴 수 없습니다. 반품 부서와 수량을 확인하세요."
                    : "수량 0 이하인 항목이 있습니다. 실행 전에 수량을 확인하세요."}
                </div>
              </div>
            </section>
          )}

          {error && (
            <div
              className="rounded-[14px] border px-3 py-2 text-xs"
              style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.red} 10%, transparent)`, borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 24%, transparent)`, color: LEGACY_COLORS.red }}
            >
              {error}
            </div>
          )}
        </div>

        <footer
          className="space-y-2 px-4 pb-4 pt-3"
          style={{ borderTop: `1px solid ${LEGACY_COLORS.border}` }}
        >
          {blockerText && (
            <div className="text-center text-[11px] font-bold" style={{ color: LEGACY_COLORS.yellow }}>
              {blockerText}
            </div>
          )}
          <button
            onClick={() => void submit()}
            disabled={submitting || !canExecute}
            className="flex w-full items-center justify-center gap-2 rounded-[16px] px-4 py-4 text-base font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50"
            style={{ background: accent }}
          >
            {isCaution && !submitting && <AlertTriangle className="h-4 w-4" />}
            {buttonLabel}
          </button>
        </footer>
      </aside>

      {/* ── RIGHT: 위(품목 테이블) + 아래(수량 조정) ── */}
      <section className="flex min-h-0 flex-1 flex-col gap-3">
        {/* ── RIGHT TOP: 품목 찾기 / 선택 ── */}
        <div
          className="flex min-h-0 flex-[1.2] flex-col overflow-hidden rounded-[28px] border"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          <header
            className="space-y-2.5 px-4 pt-4 pb-3"
            style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>
                {workType === "package-out" ? "패키지 찾기 / 선택" : "품목 찾기 / 선택"}
              </h2>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.muted2 }}
              >
                {workType === "package-out"
                  ? `${formatNumber(filteredPackages.length)}개`
                  : `${formatNumber(filteredItems.length)}개`}
              </span>
            </div>

            {workType !== "package-out" ? (
              <div className="grid grid-cols-[1fr_1fr_1fr_2fr] gap-1.5">
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
          </header>

          <div ref={listRef} className="scrollbar-hide flex-1 overflow-y-auto">
            {workType === "package-out" ? (
              <ul className="space-y-1.5 p-2">
                {filteredPackages.map((pkg) => {
                  const active = selectedPackage?.package_id === pkg.package_id;
                  return (
                    <li key={pkg.package_id}>
                      <button
                        onClick={() => setSelectedPackage((c) => (c?.package_id === pkg.package_id ? null : pkg))}
                        className="flex w-full items-center justify-between gap-2 rounded-[14px] px-3 py-2.5 text-left transition-colors hover:brightness-110"
                        style={{
                          background: active ? `color-mix(in srgb, ${LEGACY_COLORS.purple} 14%, transparent)` : LEGACY_COLORS.s2,
                          borderLeft: `3px solid ${active ? LEGACY_COLORS.purple : "transparent"}`,
                        }}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>{pkg.name}</div>
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
                  <li className="py-8 text-center text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                    검색 결과가 없습니다
                  </li>
                )}
              </ul>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10" style={{ background: LEGACY_COLORS.s1 }}>
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
                        onClick={() => toggleSelectItem(item.item_id)}
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
                      <td colSpan={6} className="py-8 text-center text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                        검색 결과가 없습니다
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {workType !== "package-out" && filteredItems.length > displayLimit && (
              <div className="p-2">
                <button
                  onClick={() => setDisplayLimit((prev) => prev + PAGE_SIZE)}
                  className="w-full rounded-[12px] border py-2.5 text-xs font-semibold"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
                >
                  100개 더 보기 ({formatNumber(Math.min(displayLimit + PAGE_SIZE, filteredItems.length))} / {formatNumber(filteredItems.length)})
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT BOTTOM: 선택 품목 · 수량 조정 ── */}
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          <header
            className="flex items-center justify-between gap-3 px-5 pt-5 pb-3"
            style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
          >
            <div className="min-w-0">
              <h2 className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>
                {workType === "package-out" ? "패키지 · 수량 확인" : "선택 품목 · 수량 조정"}
              </h2>
              <div className="mt-0.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                {workType === "package-out"
                  ? (selectedPackage ? "좌측 작업 설정에서 실행하세요" : "위에서 출고할 패키지를 선택하세요")
                  : selectedEntries.length === 0
                    ? "위 목록에서 품목을 선택하면 이곳에서 수량을 조정합니다"
                    : "각 품목의 수량을 조정한 뒤 좌측에서 실행하세요"}
              </div>
            </div>
            {workType !== "package-out" && selectedEntries.length > 0 && (
              <div className="shrink-0 text-right">
                <span className="text-[11px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                  {selectedEntries.length}개 선택됨 · 선택 총 수량{" "}
                </span>
                <span className="text-lg font-black tabular-nums" style={{ color: LEGACY_COLORS.blue }}>
                  {formatNumber(totalQty)}
                </span>
              </div>
            )}
          </header>

          <div className="scrollbar-hide flex-1 overflow-y-auto">
            {workType === "package-out" ? (
              selectedPackage ? (
                <div
                  className="m-5 rounded-[20px] border-2 p-5"
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
                      <div className="mt-1 truncate text-[22px] font-black" style={{ color: LEGACY_COLORS.text }}>
                        {selectedPackage.name}
                      </div>
                      <div className="mt-1 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                        {selectedPackage.package_code} · {selectedPackage.items.length}종 구성
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedPackage(null)}
                      className="shrink-0 rounded-full p-1 transition-colors hover:bg-white/10"
                      style={{ color: LEGACY_COLORS.muted2 }}
                      title="선택 해제"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {selectedPackage.items.length > 0 && (
                    <ul className="mt-4 divide-y rounded-[14px] border" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
                      {selectedPackage.items.map((pi, i) => (
                        <li key={i} className="flex items-center justify-between px-3 py-2 text-xs" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
                          <span className="truncate">{pi.item_name ?? pi.item_id}</span>
                          <span className="shrink-0 font-black tabular-nums" style={{ color: LEGACY_COLORS.muted2 }}>×{formatNumber(pi.quantity)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="p-5">
                  <EmptySelectionBox
                    icon={PackageCheck}
                    title="패키지를 선택하세요"
                    description={"위 패키지 목록에서 출고할 묶음을 선택하세요"}
                    accent={LEGACY_COLORS.purple}
                  />
                </div>
              )
            ) : selectedEntries.length === 0 ? (
              <div className="p-5">
                <EmptySelectionBox
                  icon={Package}
                  title="선택된 품목이 없습니다"
                  description={"위 목록에서 입출고할 품목을 선택하세요"}
                  accent={LEGACY_COLORS.blue}
                />
              </div>
            ) : (
              <SelectedItemsPanel
                entries={selectedEntries}
                outgoing={isOutbound}
                onQuantityChange={(itemId, qty) => {
                  setSelectedItems((prev) => {
                    const next = new Map(prev);
                    next.set(itemId, qty);
                    return next;
                  });
                }}
                onRemove={(itemId) => {
                  setSelectedItems((prev) => {
                    const next = new Map(prev);
                    next.delete(itemId);
                    return next;
                  });
                }}
              />
            )}
          </div>

          <footer
            className="grid grid-cols-2 gap-3 px-5 py-4"
            style={{ borderTop: `1px solid ${LEGACY_COLORS.border}` }}
          >
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
                참조 번호 (선택)
              </span>
              <input
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="예) PO-202405-001"
                className="rounded-[12px] border px-3 py-2 text-sm outline-none"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
                메모 (선택)
              </span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="메모를 입력하세요"
                className="rounded-[12px] border px-3 py-2 text-sm outline-none"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              />
            </label>
          </footer>
        </div>
      </section>
    </div>
  );
}
