"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Boxes,
  PackageCheck,
  RefreshCw,
  Search,
  UserRound,
  Workflow,
} from "lucide-react";
import { api, type Employee, type Item, type ShipPackage } from "@/lib/api";
import {
  LEGACY_COLORS,
  LEGACY_FILE_TYPES,
  LEGACY_MODELS,
  employeeColor,
  firstEmployeeLetter,
  formatNumber,
  normalizeDepartment,
} from "./legacyUi";

type WorkType = "raw-io" | "warehouse-io" | "dept-io" | "package-out";
type Direction = "in" | "out";
type TransferDirection = "wh-to-dept" | "dept-to-wh";

const WORK_TYPES: { id: WorkType; label: string; subtitle: string; icon: React.ReactNode; tone: string; accent: string }[] = [
  { id: "raw-io", label: "원자재 입출고", subtitle: "외부 ↔ 창고", icon: <Boxes className="h-4 w-4" />, tone: "color-mix(in srgb, var(--c-green) 16%, transparent)", accent: "var(--c-green)" },
  { id: "warehouse-io", label: "창고 입출고", subtitle: "창고 ↔ 부서", icon: <ArrowLeftRight className="h-4 w-4" />, tone: "color-mix(in srgb, var(--c-blue) 16%, transparent)", accent: "var(--c-blue)" },
  { id: "dept-io", label: "부서 입출고", subtitle: "공정 내부 처리", icon: <Workflow className="h-4 w-4" />, tone: "color-mix(in srgb, var(--c-purple) 18%, transparent)", accent: "var(--c-purple)" },
  { id: "package-out", label: "패키지 출하", subtitle: "묶음 출하 처리", icon: <PackageCheck className="h-4 w-4" />, tone: "color-mix(in srgb, var(--c-yellow) 16%, transparent)", accent: "var(--c-yellow)" },
];

const QUICK_STEPS = [-10, -1, 1, 10];

function sanitizeQuantity(nextValue: number) {
  if (!Number.isFinite(nextValue)) return "0";
  return String(Math.max(0, Math.floor(nextValue)));
}

function matchesWarehouseSearch(item: Item, keyword: string) {
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

function workLabel(workType: WorkType, rawDirection: Direction, warehouseDirection: TransferDirection, deptDirection: Direction) {
  if (workType === "raw-io") return `원자재 ${rawDirection === "in" ? "입고" : "출고"}`;
  if (workType === "warehouse-io") return warehouseDirection === "wh-to-dept" ? "창고->부서" : "부서->창고";
  if (workType === "dept-io") return `부서 ${deptDirection === "in" ? "입고" : "출고"}`;
  return "패키지 출하";
}

function workSubtitle(workType: WorkType, rawDirection: Direction, warehouseDirection: TransferDirection, deptDirection: Direction) {
  if (workType === "raw-io") return rawDirection === "in" ? "외부 -> 창고" : "창고 -> 외부";
  if (workType === "warehouse-io") return warehouseDirection === "wh-to-dept" ? "창고 -> 부서 이동" : "부서 -> 창고 반납";
  if (workType === "dept-io") return deptDirection === "in" ? "공정 내부 입고" : "공정 내부 출고";
  return "묶음 출하 처리";
}

export function DesktopWarehouseView({
  globalSearch,
  onStatusChange,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
}) {
  const [workType, setWorkType] = useState<WorkType>("raw-io");
  const [rawDirection, setRawDirection] = useState<Direction>("in");
  const [warehouseDirection, setWarehouseDirection] = useState<TransferDirection>("wh-to-dept");
  const [deptDirection, setDeptDirection] = useState<Direction>("in");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [itemId, setItemId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [localSearch, setLocalSearch] = useState("");
  const [fileType, setFileType] = useState("전체");
  const [modelFilter, setModelFilter] = useState("전체");
  const [quantity, setQuantity] = useState("0");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        onStatusChange(`입출고용 직원 ${nextEmployees.length}명, 품목 ${nextItems.length}건, 패키지 ${nextPackages.length}건을 불러왔습니다.`);
      })
      .catch((nextError) => {
        onStatusChange(nextError instanceof Error ? nextError.message : "입출고 데이터를 불러오지 못했습니다.");
      });
  }, [globalSearch, onStatusChange]);

  const selectedEmployee = employees.find((employee) => employee.employee_id === employeeId) ?? null;
  const selectedItem = items.find((item) => item.item_id === itemId) ?? null;
  const selectedPackage = packages.find((pkg) => pkg.package_id === packageId) ?? null;
  const activeWorkType = WORK_TYPES.find((entry) => entry.id === workType)!;
  const searchKeyword = `${globalSearch} ${localSearch}`.trim().toLowerCase();
  const numericQty = Number(quantity || 0);

  const filteredItems = useMemo(
    () =>
      items
        .filter((item) => (fileType === "전체" ? true : item.legacy_file_type === fileType))
        .filter((item) => (modelFilter === "전체" ? true : item.legacy_model === modelFilter))
        .filter((item) => matchesWarehouseSearch(item, searchKeyword))
        .slice(0, 200),
    [items, fileType, modelFilter, searchKeyword],
  );

  const filteredPackages = useMemo(
    () => packages.filter((pkg) => (searchKeyword ? `${pkg.name} ${pkg.package_code}`.toLowerCase().includes(searchKeyword) : true)),
    [packages, searchKeyword],
  );

  const effectiveLabel = workLabel(workType, rawDirection, warehouseDirection, deptDirection);
  const effectiveSubtitle = workSubtitle(workType, rawDirection, warehouseDirection, deptDirection);
  const isOutbound =
    workType === "raw-io"
      ? rawDirection === "out"
      : workType === "warehouse-io"
        ? warehouseDirection === "wh-to-dept"
        : workType === "dept-io"
          ? deptDirection === "out"
          : true;

  const expectedQuantity =
    selectedItem && numericQty > 0 && workType !== "package-out"
      ? isOutbound
        ? Number(selectedItem.quantity) - numericQty
        : Number(selectedItem.quantity) + numericQty
      : null;

  async function submit() {
    if (!selectedEmployee) return setError("담당 직원을 먼저 선택해 주세요.");
    if (!numericQty || numericQty <= 0) return setError("수량은 1 이상이어야 합니다.");
    if (workType === "package-out" && !selectedPackage) return setError("출하할 패키지를 먼저 선택해 주세요.");
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
      setQuantity("0");
      onStatusChange(`${effectiveLabel} 처리를 완료했습니다.`);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "입출고 처리를 완료하지 못했습니다.";
      setError(message);
      onStatusChange(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(820px,1.45fr)_minmax(420px,0.88fr)] gap-4 px-6 py-6">
      <section
        className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
          boxShadow: "var(--c-elev-2), var(--c-inner-hl)",
        }}
      >
        <div className="border-b px-5 py-4" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
            Operations
          </div>
          <div className="mt-1 text-xl font-bold tracking-[-0.02em]">입출고 처리</div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div
            className="rounded-[30px] border px-5 py-5"
            style={{
              background: "linear-gradient(180deg, color-mix(in srgb, var(--c-s2) 92%, transparent) 0%, color-mix(in srgb, var(--c-bg) 88%, transparent) 100%)",
              borderColor: LEGACY_COLORS.border,
              boxShadow: "var(--c-inner-hl)",
            }}
          >
            <div className="mb-3 flex items-center gap-2 text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{
                  background: "linear-gradient(135deg, var(--c-blue) 0%, color-mix(in srgb, var(--c-blue) 78%, #000 22%) 100%)",
                  boxShadow: "var(--c-glow-blue)",
                }}
              >
                1
              </span>
              작업 유형 선택
            </div>

            <div className="grid grid-cols-3 gap-2">
              {WORK_TYPES.slice(0, 3).map((entry) => {
                const active = workType === entry.id;
                return (
                  <button
                    key={entry.id}
                    onClick={() => {
                      setWorkType(entry.id);
                      setError(null);
                    }}
                    className="rounded-[16px] border px-4 py-5 text-center transition-all duration-200 ease-out hover:-translate-y-0.5"
                    style={{
                      background: active ? entry.tone : LEGACY_COLORS.s2,
                      borderColor: active ? `color-mix(in srgb, ${entry.accent} 45%, transparent)` : LEGACY_COLORS.border,
                      color: active ? entry.accent : LEGACY_COLORS.muted2,
                      boxShadow: active
                        ? `0 0 0 1px color-mix(in srgb, ${entry.accent} 28%, transparent), 0 10px 24px -10px color-mix(in srgb, ${entry.accent} 55%, transparent), var(--c-inner-hl)`
                        : "var(--c-inner-hl)",
                    }}
                  >
                    <div className="mb-2 flex justify-center">{entry.icon}</div>
                    <div className="text-lg font-bold tracking-[-0.01em]" style={{ color: active ? "var(--c-text)" : "var(--c-text)" }}>
                      {entry.label}
                    </div>
                    <div className="mt-1 text-xs" style={{ color: active ? entry.accent : LEGACY_COLORS.muted }}>
                      {entry.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-2">
              <button
                onClick={() => {
                  setWorkType("package-out");
                  setError(null);
                }}
                className="w-full rounded-[16px] border px-4 py-5 text-center transition-all duration-200 ease-out hover:-translate-y-0.5"
                style={{
                  background: workType === "package-out" ? WORK_TYPES[3].tone : LEGACY_COLORS.s2,
                  borderColor: workType === "package-out" ? `color-mix(in srgb, ${WORK_TYPES[3].accent} 45%, transparent)` : LEGACY_COLORS.border,
                  color: workType === "package-out" ? "var(--c-text)" : LEGACY_COLORS.muted2,
                  boxShadow: workType === "package-out"
                    ? `0 0 0 1px color-mix(in srgb, ${WORK_TYPES[3].accent} 28%, transparent), 0 10px 24px -10px color-mix(in srgb, ${WORK_TYPES[3].accent} 55%, transparent), var(--c-inner-hl)`
                    : "var(--c-inner-hl)",
                }}
              >
                <div className="mb-2 flex justify-center">{WORK_TYPES[3].icon}</div>
                <div className="text-lg font-bold tracking-[-0.01em]">{WORK_TYPES[3].label}</div>
                <div className="mt-1 text-xs" style={{ color: workType === "package-out" ? WORK_TYPES[3].accent : LEGACY_COLORS.muted }}>
                  {WORK_TYPES[3].subtitle}
                </div>
              </button>
            </div>

            {workType !== "package-out" ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(workType === "raw-io"
                  ? [
                      { id: "in", label: "창고 입고", subtitle: "외부 -> 창고", active: rawDirection === "in", onClick: () => setRawDirection("in"), color: "#c3ffde", tone: "rgba(31,209,122,.16)" },
                      { id: "out", label: "창고 출고", subtitle: "창고 -> 외부", active: rawDirection === "out", onClick: () => setRawDirection("out"), color: "#ffd4d6", tone: "rgba(242,95,92,.16)" },
                    ]
                  : workType === "warehouse-io"
                    ? [
                        { id: "wh-to-dept", label: "창고->부서", subtitle: "창고 -> 부서", active: warehouseDirection === "wh-to-dept", onClick: () => setWarehouseDirection("wh-to-dept"), color: "#d3e4ff", tone: "rgba(79,142,247,.16)" },
                        { id: "dept-to-wh", label: "부서->창고", subtitle: "부서 -> 창고", active: warehouseDirection === "dept-to-wh", onClick: () => setWarehouseDirection("dept-to-wh"), color: "#d3e4ff", tone: "rgba(79,142,247,.16)" },
                      ]
                    : [
                        { id: "in", label: "부서 입고", subtitle: "공정 내부 입고", active: deptDirection === "in", onClick: () => setDeptDirection("in"), color: "#f0eaff", tone: "rgba(124,92,255,.18)" },
                        { id: "out", label: "부서 출고", subtitle: "공정 내부 출고", active: deptDirection === "out", onClick: () => setDeptDirection("out"), color: "#f0eaff", tone: "rgba(124,92,255,.18)" },
                      ]
                ).map((entry) => (
                  <button
                    key={entry.id}
                    onClick={entry.onClick}
                    className="rounded-[14px] border px-4 py-3 text-center transition-all duration-200 ease-out"
                    style={{
                      background: entry.active ? entry.tone : LEGACY_COLORS.s2,
                      borderColor: entry.active ? "var(--c-accent-strong)" : LEGACY_COLORS.border,
                      color: entry.active ? LEGACY_COLORS.text : LEGACY_COLORS.muted2,
                      boxShadow: entry.active ? "var(--c-elev-1), var(--c-inner-hl)" : "var(--c-inner-hl)",
                    }}
                  >
                    <div className="text-base font-bold tracking-[-0.01em]">{entry.label}</div>
                    <div className="mt-1 text-[11px]" style={{ color: entry.active ? LEGACY_COLORS.muted2 : LEGACY_COLORS.muted }}>
                      {entry.subtitle}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mb-3 mt-5 flex items-center gap-2 text-sm font-bold" style={{ color: "#8e73d4" }}>
              <UserRound className="h-4 w-4" />
              담당 직원
            </div>

            <div className="flex gap-4 overflow-x-auto pb-1">
              {employees.map((employee) => {
                const active = employee.employee_id === employeeId;
                const deptColor = employeeColor(employee.department);
                return (
                  <button
                    key={employee.employee_id}
                    onClick={() => setEmployeeId(employee.employee_id)}
                    className="flex shrink-0 flex-col items-center gap-[6px] text-center transition-all duration-200 ease-out hover:-translate-y-0.5"
                  >
                    <span
                      className="flex h-[52px] w-[52px] items-center justify-center rounded-full text-[20px] font-bold text-white transition-all duration-200 ease-out"
                      style={{
                        background: `linear-gradient(135deg, ${deptColor} 0%, color-mix(in srgb, ${deptColor} 78%, #000 22%) 100%)`,
                        opacity: employeeId && !active ? 0.45 : 1,
                        boxShadow: active
                          ? `0 0 0 2px ${deptColor}, 0 0 24px -4px color-mix(in srgb, ${deptColor} 60%, transparent)`
                          : "var(--c-elev-1), var(--c-inner-hl)",
                        outline: "none",
                      }}
                    >
                      {firstEmployeeLetter(employee.name)}
                    </span>
                    <span
                      className="text-[11px] font-semibold tracking-[-0.005em]"
                      style={{ color: active ? deptColor : LEGACY_COLORS.muted2 }}
                    >
                      {employee.name}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="my-5 border-t" style={{ borderColor: LEGACY_COLORS.border }} />

            <div className="mb-3 text-center text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              품목 선택
            </div>

            {workType !== "package-out" ? (
              <>
                <div className="mb-2 flex flex-wrap gap-2">
                  {LEGACY_FILE_TYPES.map((entry) => (
                    <button
                      key={entry}
                      onClick={() => setFileType(entry)}
                      className="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
                      style={{
                        background: fileType === entry ? LEGACY_COLORS.blue : LEGACY_COLORS.s2,
                        borderColor: fileType === entry ? "rgba(120,167,255,.42)" : LEGACY_COLORS.border,
                        color: fileType === entry ? "#fff" : LEGACY_COLORS.muted2,
                      }}
                    >
                      {entry}
                    </button>
                  ))}
                </div>
                <div className="mb-2 flex flex-wrap gap-2">
                  {LEGACY_MODELS.map((entry) => (
                    <button
                      key={entry}
                      onClick={() => setModelFilter(entry)}
                      className="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
                      style={{
                        background: modelFilter === entry ? LEGACY_COLORS.cyan : LEGACY_COLORS.s2,
                        borderColor: modelFilter === entry ? LEGACY_COLORS.cyan : LEGACY_COLORS.border,
                        color: modelFilter === entry ? "#fff" : LEGACY_COLORS.muted2,
                      }}
                    >
                      {entry}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            <div className="mb-2 flex items-center gap-3 rounded-[16px] border px-4 py-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
              <Search className="h-4 w-4" style={{ color: "#b98eff" }} />
              <input
                value={localSearch}
                onChange={(event) => setLocalSearch(event.target.value)}
                placeholder={workType === "package-out" ? "패키지명, 코드 검색" : "코드, 품명, 바코드, 모델 검색"}
                className="w-full bg-transparent text-sm outline-none"
                style={{ color: LEGACY_COLORS.text }}
              />
            </div>

            <div className="mb-2 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
              {workType === "package-out" ? `${formatNumber(filteredPackages.length)}개 패키지` : `${formatNumber(filteredItems.length)}개 품목`}
            </div>

            {workType === "package-out" ? (
              <div className="max-h-[420px] overflow-y-auto rounded-[18px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                {filteredPackages.length === 0 ? (
                  <div className="px-4 py-5 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>검색 결과가 없습니다.</div>
                ) : (
                  filteredPackages.map((pkg, index) => {
                    const active = pkg.package_id === packageId;
                    return (
                      <button
                        key={pkg.package_id}
                        onClick={() => setPackageId((current) => (current === pkg.package_id ? "" : pkg.package_id))}
                        className="flex w-full items-center justify-between px-4 py-4 text-left transition"
                        style={{ borderBottom: index === filteredPackages.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`, background: active ? "color-mix(in srgb, var(--c-purple) 14%, transparent)" : "transparent" }}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{pkg.name}</div>
                          <div className="mt-1 truncate text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>{pkg.package_code}</div>
                        </div>
                        <div className="ml-3 text-right">
                          <div className="text-[11px]" style={{ color: active ? "#ddd4ff" : LEGACY_COLORS.muted2 }}>구성 품목</div>
                          <div className="font-mono text-base font-black" style={{ color: "#b99cff" }}>{formatNumber(pkg.items.length)}</div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto rounded-[18px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                {filteredItems.length === 0 ? (
                  <div className="px-4 py-5 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>검색 결과가 없습니다.</div>
                ) : (
                  filteredItems.map((item, index) => {
                    const active = item.item_id === itemId;
                    return (
                      <button
                        key={item.item_id}
                        onClick={() => setItemId((current) => (current === item.item_id ? "" : item.item_id))}
                        className="flex w-full items-center justify-between px-4 py-3 text-left transition"
                        style={{ borderBottom: index === filteredItems.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`, background: active ? "var(--c-accent-soft)" : "transparent" }}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{item.item_name}</div>
                          <div className="mt-1 truncate text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                            {item.item_code} / {item.spec || "-"} / {item.barcode || "-"}
                          </div>
                        </div>
                        <div className="ml-3 text-right">
                          <div className="text-[11px]" style={{ color: active ? "#cfe0ff" : LEGACY_COLORS.muted2 }}>현재고</div>
                          <div className="font-mono text-base font-black" style={{ color: Number(item.quantity) > 0 ? LEGACY_COLORS.green : LEGACY_COLORS.red }}>
                            {formatNumber(item.quantity)}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section
        className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
          boxShadow: "var(--c-elev-2), var(--c-inner-hl)",
        }}
      >
        <div className="border-b px-5 py-4" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
            Confirm & Execute
          </div>
          <div className="mt-1 text-xl font-bold tracking-[-0.02em]">실행 확인</div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-between">
          {!selectedItem && !selectedPackage ? (
            <>
              <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                <div className="mb-5 rounded-3xl p-4" style={{ background: "rgba(79,142,247,.10)", color: LEGACY_COLORS.blue }}>
                  <PackageCheck className="h-8 w-8" />
                </div>
                <div className="text-lg font-bold">품목을 선택해 주세요</div>
                <div className="mt-3 max-w-[260px] text-sm leading-6" style={{ color: LEGACY_COLORS.muted2 }}>
                  작업 유형을 고른 뒤 담당 직원과 품목을 선택하면 실행 확인 내용이 표시됩니다.
                </div>
              </div>
              <div className="border-t px-5 py-5" style={{ borderColor: LEGACY_COLORS.border }}>
                <button disabled className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-white opacity-40" style={{ background: LEGACY_COLORS.blue }}>
                  <PackageCheck className="h-4 w-4" />
                  {effectiveLabel} 실행
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-4 px-5 py-5">
                <div className="rounded-[24px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full font-black text-white" style={{ background: selectedEmployee ? employeeColor(selectedEmployee.department) : LEGACY_COLORS.muted }}>
                      {selectedEmployee ? firstEmployeeLetter(selectedEmployee.name) : <UserRound className="h-4 w-4" />}
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                        담당 직원
                      </div>
                      <div className="text-sm font-bold">{selectedEmployee?.name || "미선택"}</div>
                    </div>
                  </div>

                  <div className="space-y-3 text-sm">
                    <div className="rounded-[18px] border p-4" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                      <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em]" style={{ color: LEGACY_COLORS.muted2 }}>
                        {effectiveLabel}
                      </div>
                      {workType === "package-out" && selectedPackage ? (
                        <>
                          <div className="font-semibold">{selectedPackage.name}</div>
                          <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{selectedPackage.package_code}</div>
                        </>
                      ) : selectedItem ? (
                        <>
                          <div className="font-semibold">{selectedItem.item_name}</div>
                          <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{selectedItem.item_code}</div>
                          <div className="mt-4 grid grid-cols-2 gap-3">
                            <div>
                              <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>현재고</div>
                              <div className="font-mono text-xl font-black">{formatNumber(selectedItem.quantity)}</div>
                            </div>
                            <div>
                              <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>예상 재고</div>
                              <div className="font-mono text-xl font-black">{expectedQuantity == null ? "-" : formatNumber(expectedQuantity)}</div>
                            </div>
                          </div>
                        </>
                      ) : null}
                    </div>

                    <input
                      value={quantity}
                      onChange={(event) => setQuantity(sanitizeQuantity(Number(event.target.value.replace(/[^\d-]/g, ""))))}
                      className="w-full rounded-[18px] border px-4 py-4 text-center font-mono text-[34px] font-black outline-none"
                      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                    />

                    <div className="grid grid-cols-4 gap-2">
                      {QUICK_STEPS.map((step) => {
                        const positive = step > 0;
                        return (
                          <button
                            key={step}
                            onClick={() => setQuantity((current) => sanitizeQuantity(Number(current || 0) + step))}
                            className="rounded-[12px] px-3 py-3 text-lg font-bold tabular-nums transition-all duration-200 ease-out hover:-translate-y-0.5"
                            style={{
                              background: positive
                                ? "color-mix(in srgb, var(--c-green) 14%, var(--c-s2))"
                                : "color-mix(in srgb, var(--c-red) 14%, var(--c-s2))",
                              color: positive ? "var(--c-green)" : "var(--c-red)",
                              border: `1px solid ${positive ? "color-mix(in srgb, var(--c-green) 28%, transparent)" : "color-mix(in srgb, var(--c-red) 28%, transparent)"}`,
                              boxShadow: "var(--c-inner-hl)",
                            }}
                          >
                            {step > 0 ? `+${step}` : step}
                          </button>
                        );
                      })}
                    </div>

                    <input
                      value={referenceNo}
                      onChange={(event) => setReferenceNo(event.target.value)}
                      placeholder="참조 번호"
                      className="w-full rounded-[14px] border px-4 py-3 text-sm outline-none"
                      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                    />

                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="비고"
                      className="min-h-[92px] w-full rounded-[14px] border px-4 py-3 text-sm outline-none"
                      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                    />
                  </div>
                </div>

                {error ? (
                  <div
                    className="rounded-2xl border px-4 py-3 text-sm"
                    style={{
                      background: "color-mix(in srgb, var(--c-red) 12%, transparent)",
                      borderColor: "color-mix(in srgb, var(--c-red) 28%, transparent)",
                      color: LEGACY_COLORS.red,
                    }}
                  >
                    {error}
                  </div>
                ) : null}
              </div>

              <div className="border-t px-5 py-5" style={{ borderColor: LEGACY_COLORS.border }}>
                <button
                  onClick={() => void submit()}
                  disabled={submitting || (!selectedItem && !selectedPackage)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-white transition-all duration-200 ease-out hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100"
                  style={{
                    background: isOutbound
                      ? "linear-gradient(135deg, var(--c-red) 0%, color-mix(in srgb, var(--c-red) 75%, #000 25%) 100%)"
                      : "linear-gradient(135deg, var(--c-blue) 0%, color-mix(in srgb, var(--c-blue) 78%, #000 22%) 100%)",
                    boxShadow: "var(--c-elev-2), var(--c-inner-hl)",
                  }}
                >
                  {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                  {submitting ? "처리 중..." : `${effectiveLabel} 실행`}
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
