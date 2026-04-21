"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Boxes, PackageCheck, Search, Sparkles, TrendingUp, UserRound, Workflow } from "lucide-react";
import { api, type Employee, type Item, type ShipPackage, type TransactionLog } from "@/lib/api";
import { DesktopRightPanel } from "./DesktopRightPanel";
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

type WorkType = "raw-io" | "warehouse-io" | "dept-io" | "package-out";
type Direction = "in" | "out";
type TransferDirection = "wh-to-dept" | "dept-to-wh";

const WORK_TYPES: { id: WorkType; label: string; icon: React.ElementType }[] = [
  { id: "raw-io", label: "원자재 입출고", icon: Boxes },
  { id: "warehouse-io", label: "창고 이동", icon: ArrowLeftRight },
  { id: "dept-io", label: "부서 입출고", icon: Workflow },
  { id: "package-out", label: "패키지 출고", icon: PackageCheck },
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
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<ShipPackage | null>(null);
  const [itemLogs, setItemLogs] = useState<TransactionLog[]>([]);
  const [localSearch, setLocalSearch] = useState("");
  const [fileType, setFileType] = useState("전체");
  const [modelFilter, setModelFilter] = useState("전체");
  const [quantity, setQuantity] = useState("1");
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
      setSelectedItem(preselectedItem);
      setPendingScrollId(preselectedItem.item_id);
    }
  }, [preselectedItem]);

  useEffect(() => {
    if (!selectedItem) {
      setItemLogs([]);
      return;
    }
    void api.getTransactions({ itemId: selectedItem.item_id, limit: 8 }).then(setItemLogs).catch(() => setItemLogs([]));
  }, [selectedItem]);

  const selectedEmployee = employees.find((e) => e.employee_id === employeeId) ?? null;
  const searchKeyword = `${globalSearch} ${localSearch}`.trim().toLowerCase();
  const numericQty = Number(quantity || 0);

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
          ? "창고→부서 이동"
          : "부서→창고 반납"
        : workType === "dept-io"
          ? `부서 ${deptDirection === "in" ? "입고" : "출고"}`
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

  const expectedQuantity =
    selectedItem && numericQty > 0 && workType !== "package-out"
      ? isOutbound
        ? Number(selectedItem.quantity) - numericQty
        : Number(selectedItem.quantity) + numericQty
      : null;

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

  async function submit() {
    if (!selectedEmployee) return setError("담당 직원을 먼저 선택해 주세요.");
    if (!numericQty || numericQty <= 0) return setError("수량은 1 이상이어야 합니다.");
    if (workType === "package-out" && !selectedPackage) return setError("출고할 패키지를 선택해 주세요.");
    if (workType !== "package-out" && !selectedItem) return setError("품목을 먼저 선택해 주세요.");

    try {
      setSubmitting(true);
      setError(null);
      const producedBy = `${selectedEmployee.name} (${normalizeDepartment(selectedEmployee.department)})`;

      if (workType === "package-out" && selectedPackage) {
        await api.shipPackage({
          package_id: selectedPackage.package_id,
          quantity: numericQty,
          reference_no: referenceNo || undefined,
          produced_by: producedBy,
          notes: notes || undefined,
        });
      } else if (selectedItem) {
        const payload = {
          item_id: selectedItem.item_id,
          quantity: numericQty,
          reference_no: referenceNo || undefined,
          produced_by: producedBy,
          notes: notes || undefined,
        };
        if (isOutbound) await api.shipInventory(payload);
        else await api.receiveInventory(payload);
      }

      setReferenceNo("");
      setNotes("");
      setQuantity("1");
      onStatusChange(`${effectiveLabel} 처리를 완료했습니다.`);

      if (selectedItem) {
        const refreshed = await api.getItem(selectedItem.item_id);
        setSelectedItem(refreshed);
        setItemLogs(await api.getTransactions({ itemId: selectedItem.item_id, limit: 8 }));
      }
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
                      {([
                        { label: "상태", nowrap: true },
                        { label: "품목명", nowrap: false },
                        { label: "코드", nowrap: true },
                        { label: "구분", nowrap: true },
                        { label: "현재고", nowrap: true },
                        { label: "모델", nowrap: true },
                      ] as { label: string; nowrap: boolean }[]).map(({ label, nowrap }) => (
                        <th key={label} className={`border-b px-4 py-3 text-left text-[11px] font-bold${nowrap ? " whitespace-nowrap" : ""}`} style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => {
                      const stock = getStockState(Number(item.quantity), item.min_stock == null ? null : Number(item.min_stock));
                      const badge = fileTypeBadge(item.legacy_file_type);
                      const active = selectedItem?.item_id === item.item_id;
                      return (
                        <tr
                          key={item.item_id}
                          data-item-id={item.item_id}
                          onClick={() => setSelectedItem((c) => (c?.item_id === item.item_id ? null : item))}
                          className="cursor-pointer transition-colors hover:bg-white/[0.12]"
                          style={{ background: active ? "rgba(101,169,255,.08)" : "transparent" }}
                        >
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
            : (selectedItem ? selectedItem.item_name : "품목을 선택하세요")
        }
        subtitle={
          selectedItem && workType !== "package-out"
            ? `${selectedItem.item_code} / 현재고 ${formatNumber(selectedItem.quantity)}`
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

          {/* 수량 입력 */}
          <section className="rounded-[28px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: LEGACY_COLORS.muted2 }}>
              수량 및 메모
            </div>
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ""))}
              className="w-full rounded-[18px] border px-4 py-4 text-center font-mono text-[34px] font-black outline-none"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              placeholder="0"
            />
            <div className="mt-2 grid grid-cols-4 gap-2">
              {[-10, -1, 1, 10].map((step) => (
                <button
                  key={step}
                  onClick={() => setQuantity(String(Math.max(0, Number(quantity || 0) + step)))}
                  className="rounded-[14px] px-2 py-2.5 text-sm font-bold"
                  style={{
                    background: step > 0 ? "rgba(67,211,157,.16)" : "rgba(255,123,123,.14)",
                    color: step > 0 ? LEGACY_COLORS.green : LEGACY_COLORS.red,
                  }}
                >
                  {step > 0 ? `+${step}` : step}
                </button>
              ))}
            </div>

            {selectedItem && numericQty > 0 && workType !== "package-out" && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-[16px] border px-3 py-2.5" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                  <div className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>현재고</div>
                  <div className="font-mono font-black">{formatNumber(selectedItem.quantity)}</div>
                </div>
                <div className="rounded-[16px] border px-3 py-2.5" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                  <div className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>예상 재고</div>
                  <div className="font-mono font-black">{expectedQuantity == null ? "-" : formatNumber(expectedQuantity)}</div>
                </div>
              </div>
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

          {error && (
            <div className="rounded-[18px] border px-4 py-3 text-sm" style={{ background: "rgba(255,123,123,.10)", borderColor: "rgba(255,123,123,.24)", color: LEGACY_COLORS.red }}>
              {error}
            </div>
          )}

          <button
            onClick={() => void submit()}
            disabled={submitting || (!selectedItem && !selectedPackage)}
            className="w-full rounded-[18px] px-4 py-4 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: isOutbound ? LEGACY_COLORS.red : LEGACY_COLORS.blue }}
          >
            {submitting ? "처리 중..." : `${effectiveLabel} 실행`}
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
