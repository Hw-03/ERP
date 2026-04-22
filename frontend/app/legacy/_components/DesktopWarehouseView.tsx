"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Boxes, Check, PackageCheck, RotateCcw, Search, Sparkles, TrendingUp, UserRound, Workflow } from "lucide-react";
import { api, type Department, type Employee, type Item, type ShipPackage, type TransactionLog } from "@/lib/api";
import { DesktopRightPanel } from "./DesktopRightPanel";
import { SelectedItemsPanel } from "./SelectedItemsPanel";
import {
  LEGACY_COLORS,
  LEGACY_FILE_TYPES,
  LEGACY_MODELS,
  displayFileType,
  employeeColor,
  fileTypeBadge,
  firstEmployeeLetter,
  formatNumber,
  getStockState,
  normalizeDepartment,
  normalizeModel,
  transactionColor,
  transactionLabel,
} from "./legacyUi";

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

const WORK_TYPES: { id: WorkType; label: string; icon: React.ElementType }[] = [
  { id: "raw-io", label: "원자재 입출고", icon: Boxes },
  { id: "warehouse-io", label: "창고 이동", icon: ArrowLeftRight },
  { id: "dept-io", label: "부서 입출고", icon: Workflow },
  { id: "package-out", label: "패키지 출고", icon: PackageCheck },
  { id: "defective-register", label: "불량 등록", icon: AlertTriangle },
  { id: "supplier-return", label: "공급업체 반품", icon: RotateCcw },
];

function matchesSearch(item: Item, keyword: string) {
  if (!keyword) return true;
  const haystack = [
    item.item_code,
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

function Chip({
  active,
  label,
  onClick,
  tone,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  tone: string;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-all hover:brightness-110"
      style={{
        background: active ? `${tone}22` : LEGACY_COLORS.s2,
        borderColor: active ? tone : LEGACY_COLORS.border,
        color: active ? tone : LEGACY_COLORS.muted2,
      }}
    >
      {label}
    </button>
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
  const [fileType, setFileType] = useState("전체");
  const [modelFilter, setModelFilter] = useState("전체");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  const filteredItems = useMemo(
    () =>
      items
        .filter((item) => fileType === "전체" || item.legacy_file_type === fileType)
        .filter((item) => modelFilter === "전체" || item.legacy_model === modelFilter)
        .filter((item) => matchesSearch(item, searchKeyword))
        .slice(0, 300),
    [items, fileType, modelFilter, searchKeyword],
  );

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
          { id: "in", label: "창고 입고", active: rawDirection === "in", onClick: () => setRawDirection("in") },
          { id: "out", label: "창고 출고", active: rawDirection === "out", onClick: () => setRawDirection("out") },
        ]
      : workType === "warehouse-io"
        ? [
            { id: "wh-to-dept", label: "창고→부서", active: warehouseDirection === "wh-to-dept", onClick: () => setWarehouseDirection("wh-to-dept") },
            { id: "dept-to-wh", label: "부서→창고", active: warehouseDirection === "dept-to-wh", onClick: () => setWarehouseDirection("dept-to-wh") },
          ]
        : workType === "dept-io"
          ? [
              { id: "in", label: "부서 입고", active: deptDirection === "in", onClick: () => setDeptDirection("in") },
              { id: "out", label: "부서 출고", active: deptDirection === "out", onClick: () => setDeptDirection("out") },
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

      setReferenceNo("");
      setNotes("");
      setSelectedItems(new Map());
      const refreshed = await api.getItems({ limit: 2000, search: globalSearch.trim() || undefined });
      setItems(refreshed);
      onStatusChange(`${effectiveLabel} ${workType !== "package-out" ? selectedEntries.length + "건 " : ""}처리를 완료했습니다.`);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "입출고 처리를 완료하지 못했습니다.";
      setError(message);
      onStatusChange(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 gap-4 pl-0 pr-4">
      {/* ── 좌측: 스크롤 가능한 자재 목록 ── */}
      <div ref={listRef} className="scrollbar-hide min-h-0 min-w-0 flex-1 overflow-y-auto rounded-[28px] border" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.bg }}>
        <div className="flex flex-col gap-3 pb-6">

          {/* ── 필터 (raw-io / warehouse-io / dept-io 전용) ── */}
          {workType !== "package-out" && (
            <section className="card">
              <div className="grid gap-3 xl:grid-cols-2">
                <div className="rounded-[20px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                    <Sparkles className="h-4 w-4" style={{ color: LEGACY_COLORS.blue }} />
                    파일 구분
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {LEGACY_FILE_TYPES.map((entry) => (
                      <Chip
                        key={entry}
                        active={fileType === entry}
                        label={entry === "전체" ? "전체" : displayFileType(entry)}
                        onClick={() => setFileType(entry)}
                        tone={LEGACY_COLORS.blue}
                      />
                    ))}
                  </div>
                </div>
                <div className="rounded-[20px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                    <TrendingUp className="h-4 w-4" style={{ color: LEGACY_COLORS.cyan }} />
                    모델 필터
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {LEGACY_MODELS.map((entry) => (
                      <Chip key={entry} active={modelFilter === entry} label={entry} onClick={() => setModelFilter(entry)} tone={LEGACY_COLORS.cyan} />
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ── 자재 / 패키지 목록 ── */}
          <section className="card" style={{ backgroundImage: "linear-gradient(rgba(101, 169, 255, 0.08), rgba(101, 169, 255, 0.08))" }}>
            <div
              className="sticky top-0 z-20 -mx-5 -mt-5 mb-4 flex items-center gap-3 rounded-t-[28px] px-5 pb-3 pt-5"
              style={{ background: LEGACY_COLORS.bg, backgroundImage: "linear-gradient(rgba(101, 169, 255, 0.08), rgba(101, 169, 255, 0.08))" }}
            >
              <div className="shrink-0 text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
                {workType === "package-out" ? "패키지 목록" : "자재 목록"}
              </div>
              <div className="flex flex-1 items-center gap-2 rounded-[14px] border px-3 py-2" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                <Search className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
                <input
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  placeholder={workType === "package-out" ? "패키지명 또는 코드 검색" : "품목명, 코드, 바코드 검색"}
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: LEGACY_COLORS.text }}
                />
                <span className="shrink-0 font-mono text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                  {workType === "package-out" ? formatNumber(filteredPackages.length) : formatNumber(filteredItems.length)}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto rounded-[24px] border" style={{ borderColor: LEGACY_COLORS.border }}>
              {workType === "package-out" ? (
                <table className="min-w-full border-separate border-spacing-0 text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr style={{ background: LEGACY_COLORS.s2 }}>
                      {([
                        { label: "패키지명", nowrap: false },
                        { label: "코드", nowrap: true },
                        { label: "구성 품목", nowrap: true },
                      ] as { label: string; nowrap: boolean }[]).map(({ label, nowrap }) => (
                        <th key={label} className={`border-b px-4 py-3 text-left text-[11px] font-bold${nowrap ? " whitespace-nowrap" : ""}`} style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPackages.map((pkg) => {
                      const active = selectedPackage?.package_id === pkg.package_id;
                      return (
                        <tr
                          key={pkg.package_id}
                          onClick={() => setSelectedPackage((c) => (c?.package_id === pkg.package_id ? null : pkg))}
                          className="cursor-pointer transition-colors hover:bg-white/[0.12]"
                          style={{ background: active ? "rgba(142,125,255,.08)" : "transparent" }}
                        >
                          <td className="border-b px-4 py-3 font-semibold" style={{ borderColor: LEGACY_COLORS.border }}>{pkg.name}</td>
                          <td className="border-b px-4 py-3 whitespace-nowrap font-mono text-[12px]" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>{pkg.package_code}</td>
                          <td className="border-b px-4 py-3 whitespace-nowrap font-mono" style={{ borderColor: LEGACY_COLORS.border }}>{formatNumber(pkg.items.length)}종</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <table className="min-w-full border-separate border-spacing-0 text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr style={{ background: LEGACY_COLORS.s2 }}>
                      <th className="border-b px-4 py-3 text-left text-[11px] font-bold whitespace-nowrap" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.blue, width: "72px" }}>
                        {selectedItems.size > 0 ? (
                          <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-black" style={{ background: "rgba(101,169,255,.18)", color: LEGACY_COLORS.blue }}>
                            선택 {selectedItems.size}건
                          </span>
                        ) : "선택"}
                      </th>
                      {([
                        { label: "상태", nowrap: true, width: "80px" },
                        { label: "품목명", nowrap: false, minWidth: "160px" },
                        { label: "코드", nowrap: true, width: "90px" },
                        { label: "구분", nowrap: true, width: "68px" },
                        { label: "현재고", nowrap: true, width: "72px" },
                        { label: "모델", nowrap: true, width: "80px" },
                      ] as { label: string; nowrap: boolean; width?: string; minWidth?: string }[]).map(({ label, nowrap, width, minWidth }) => (
                        <th key={label} className={`border-b px-4 py-3 text-left text-[11px] font-bold${nowrap ? " whitespace-nowrap" : ""}`} style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, width, minWidth }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => {
                      const stock = getStockState(Number(item.quantity), item.min_stock == null ? null : Number(item.min_stock));
                      const badge = fileTypeBadge(item.legacy_file_type);
                      const active = selectedItems.has(item.item_id);
                      return (
                        <tr
                          key={item.item_id}
                          data-item-id={item.item_id}
                          onClick={() => {
                            setSelectedItems((prev) => {
                              const next = new Map(prev);
                              if (next.has(item.item_id)) next.delete(item.item_id);
                              else next.set(item.item_id, 1);
                              return next;
                            });
                          }}
                          className="cursor-pointer transition-colors hover:bg-white/[0.12]"
                          style={{
                            background: active ? "rgba(101,169,255,.08)" : "transparent",
                            borderLeft: active ? `2px solid ${LEGACY_COLORS.blue}` : "2px solid transparent",
                          }}
                        >
                          <td className="border-b px-4 py-3 align-top whitespace-nowrap" style={{ borderColor: LEGACY_COLORS.border }}>
                            <div className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: active ? LEGACY_COLORS.blue : "rgba(255,255,255,.08)", border: `1.5px solid ${active ? LEGACY_COLORS.blue : LEGACY_COLORS.border}` }}>
                              {active && <Check className="h-3.5 w-3.5 text-white" />}
                            </div>
                          </td>
                          <td className="border-b px-4 py-3 align-top whitespace-nowrap" style={{ borderColor: LEGACY_COLORS.border }}>
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: stock.color, background: `${stock.color}20` }}>
                                {stock.label}
                              </span>
                              <span className="inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ color: badge.color, background: badge.bg }}>
                                {badge.label}
                              </span>
                            </div>
                          </td>
                          <td className="border-b px-4 py-3 align-top" style={{ borderColor: LEGACY_COLORS.border }}>
                            <div className="font-semibold">{item.item_name}</div>
                            <div className="mt-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>{item.spec || "-"}</div>
                          </td>
                          <td className="border-b px-4 py-3 align-top whitespace-nowrap font-mono text-[12px]" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                            {item.item_code}
                          </td>
                          <td className="border-b px-4 py-3 align-top whitespace-nowrap" style={{ borderColor: LEGACY_COLORS.border }}>
                            {displayFileType(item.legacy_file_type)}
                          </td>
                          <td
                            className="border-b px-4 py-3 text-right align-top whitespace-nowrap font-mono text-[13px] font-bold"
                            style={{ borderColor: LEGACY_COLORS.border, color: Number(item.quantity) > 0 ? LEGACY_COLORS.green : LEGACY_COLORS.red }}
                          >
                            {formatNumber(item.quantity)}
                          </td>
                          <td className="border-b px-4 py-3 align-top whitespace-nowrap text-[12px]" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                            {normalizeModel(item.legacy_model)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ── 우측: 입출고 실행 패널 ── */}
      <DesktopRightPanel
        title={
          workType === "package-out"
            ? (selectedPackage ? selectedPackage.name : "패키지를 선택하세요")
            : selectedEntries.length === 0
              ? "품목을 선택하세요"
              : selectedEntries.length === 1
                ? selectedEntries[0].item.item_name
                : `${selectedEntries.length}건 선택됨`
        }
        subtitle={
          selectedEntries.length === 1 && workType !== "package-out"
            ? `${selectedEntries[0].item.item_code} / 현재고 ${formatNumber(selectedEntries[0].item.quantity)}`
            : undefined
        }
      >
        <div className="space-y-4">
          {/* 작업 유형 */}
          <section className="rounded-[28px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: LEGACY_COLORS.muted2 }}>
              작업 유형
            </div>
            <div className="grid grid-cols-2 gap-2">
              {WORK_TYPES.map((entry) => {
                const Icon = entry.icon;
                const active = entry.id === workType;
                return (
                  <button
                    key={entry.id}
                    onClick={() => { setWorkType(entry.id); setError(null); }}
                    className="flex items-center gap-2 rounded-[18px] border px-3 py-3 text-left text-xs font-semibold transition-all hover:brightness-110"
                    style={{
                      background: active ? "rgba(101,169,255,.14)" : LEGACY_COLORS.s1,
                      borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                      color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
                    }}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{entry.label}</span>
                  </button>
                );
              })}
            </div>
            {directionButtons.length > 0 && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {directionButtons.map((btn) => (
                  <button
                    key={btn.id}
                    onClick={btn.onClick}
                    className="rounded-[16px] border px-3 py-2.5 text-xs font-semibold transition-all hover:brightness-110"
                    style={{
                      background: btn.active ? "rgba(78,201,245,.12)" : LEGACY_COLORS.s1,
                      borderColor: btn.active ? LEGACY_COLORS.cyan : LEGACY_COLORS.border,
                      color: btn.active ? LEGACY_COLORS.cyan : LEGACY_COLORS.muted2,
                    }}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            )}

            {/* 부서 선택 — warehouse-io / dept-io / defective-register / supplier-return */}
            {(workType === "warehouse-io"
              || workType === "dept-io"
              || workType === "defective-register"
              || workType === "supplier-return") && (
              <div className="mt-3">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: LEGACY_COLORS.muted2 }}>
                  {workType === "supplier-return"
                    ? "반품할 부서 (불량 보관 위치)"
                    : workType === "defective-register"
                      ? "불량 격리 부서"
                      : "대상 부서"}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {PROD_DEPTS.map((dept) => {
                    const active = dept === selectedDept;
                    return (
                      <button
                        key={dept}
                        onClick={() => setSelectedDept(dept)}
                        className="rounded-[14px] border px-2 py-2 text-xs font-semibold transition-all hover:brightness-110"
                        style={{
                          background: active ? "rgba(142,125,255,.14)" : LEGACY_COLORS.s1,
                          borderColor: active ? LEGACY_COLORS.purple : LEGACY_COLORS.border,
                          color: active ? LEGACY_COLORS.purple : LEGACY_COLORS.muted2,
                        }}
                      >
                        {dept}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 불량 source 토글 */}
            {workType === "defective-register" && (
              <div className="mt-3">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: LEGACY_COLORS.muted2 }}>
                  불량 발견 위치
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["warehouse", "production"] as DefectiveSource[]).map((src) => {
                    const active = src === defectiveSource;
                    const label = src === "warehouse" ? "창고에서 발견" : `${selectedDept}에서 발견`;
                    return (
                      <button
                        key={src}
                        onClick={() => setDefectiveSource(src)}
                        className="rounded-[14px] border px-3 py-2 text-xs font-semibold transition-all hover:brightness-110"
                        style={{
                          background: active ? "rgba(255,123,123,.14)" : LEGACY_COLORS.s1,
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
          </section>

          {/* 담당 직원 */}
          <section className="rounded-[28px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: LEGACY_COLORS.muted2 }}>
              <UserRound className="h-3.5 w-3.5" />
              담당 직원
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {employees.map((emp) => {
                const active = emp.employee_id === employeeId;
                const tone = employeeColor(emp.department);
                return (
                  <button key={emp.employee_id} onClick={() => setEmployeeId(emp.employee_id)} className="flex shrink-0 flex-col items-center gap-1.5">
                    <span
                      className="flex h-12 w-12 items-center justify-center rounded-full text-base font-black text-white"
                      style={{ background: tone, boxShadow: active ? `0 0 0 3px ${tone}44` : "none", opacity: active ? 1 : 0.5 }}
                    >
                      {firstEmployeeLetter(emp.name)}
                    </span>
                    <span className="text-[11px] font-semibold" style={{ color: active ? LEGACY_COLORS.text : LEGACY_COLORS.muted2 }}>
                      {emp.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 선택 품목 + 수량 스테퍼 */}
          {workType !== "package-out" && (
            <section className="rounded-[28px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
              <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: LEGACY_COLORS.muted2 }}>
                선택 품목 및 수량
              </div>
              {selectedEntries.length === 0 ? (
                <div className="rounded-[18px] border py-6 text-center text-sm" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                  좌측 목록에서 품목을 선택하세요
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
              <input
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="참조 번호"
                className="mt-3 w-full rounded-[18px] border px-4 py-3 text-sm outline-none"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="메모"
                className="mt-2 min-h-[80px] w-full rounded-[18px] border px-4 py-3 text-sm outline-none"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              />
            </section>
          )}

          {/* 패키지 출고: 참조번호/메모만 */}
          {workType === "package-out" && (
            <section className="rounded-[28px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
              <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: LEGACY_COLORS.muted2 }}>
                메모
              </div>
              <input
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="참조 번호"
                className="w-full rounded-[18px] border px-4 py-3 text-sm outline-none"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="메모"
                className="mt-2 min-h-[80px] w-full rounded-[18px] border px-4 py-3 text-sm outline-none"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              />
            </section>
          )}

          {error && (
            <div className="rounded-[18px] border px-4 py-3 text-sm" style={{ background: "rgba(255,123,123,.10)", borderColor: "rgba(255,123,123,.24)", color: LEGACY_COLORS.red }}>
              {error}
            </div>
          )}

          <button
            onClick={() => void submit()}
            disabled={submitting || (workType !== "package-out" && selectedEntries.length === 0) || (workType === "package-out" && !selectedPackage)}
            className="w-full rounded-[18px] px-4 py-4 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: isOutbound ? LEGACY_COLORS.red : LEGACY_COLORS.blue }}
          >
            {submitting
              ? "처리 중..."
              : workType !== "package-out" && selectedEntries.length > 1
                ? `${effectiveLabel} ${selectedEntries.length}건 실행`
                : `${effectiveLabel} 실행`}
          </button>

          {/* 선택 품목 최근 이력 */}
          {itemLogs.length > 0 && (
            <section className="rounded-[28px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
              <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: LEGACY_COLORS.muted2 }}>
                최근 이력
              </div>
              <div className="space-y-2">
                {itemLogs.map((log) => (
                  <div key={log.log_id} className="rounded-[16px] border p-3" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold" style={{ color: transactionColor(log.transaction_type) }}>
                        {transactionLabel(log.transaction_type)}
                      </span>
                      <span className="font-mono text-xs">{formatNumber(log.quantity_change)}</span>
                    </div>
                    <div className="mt-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                      {log.notes || "메모 없음"}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </DesktopRightPanel>
    </div>
  );
}
