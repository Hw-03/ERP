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
  employeeColor,
  firstEmployeeLetter,
  formatNumber,
  normalizeDepartment,
} from "./legacyUi";

type WorkType = "raw-io" | "warehouse-io" | "dept-io" | "package-out";
type Direction = "in" | "out";
type TransferDirection = "wh-to-dept" | "dept-to-wh";

const WORK_TYPES: { id: WorkType; label: string; subtitle: string; icon: React.ReactNode; tone: string }[] = [
  { id: "raw-io", label: "원자재 입출고", subtitle: "외부 <-> 창고", icon: <Boxes className="h-4 w-4" />, tone: "rgba(31,209,122,.16)" },
  { id: "warehouse-io", label: "창고 입출고", subtitle: "창고 <-> 부서", icon: <ArrowLeftRight className="h-4 w-4" />, tone: "rgba(79,142,247,.16)" },
  { id: "dept-io", label: "부서 입출고", subtitle: "공정 내부 처리", icon: <Workflow className="h-4 w-4" />, tone: "rgba(124,92,255,.18)" },
  { id: "package-out", label: "패키지 출하", subtitle: "묶음 출하 처리", icon: <PackageCheck className="h-4 w-4" />, tone: "rgba(255,180,48,.16)" },
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

  const modelOptions = useMemo(() => {
    const models = Array.from(
      new Set(items.map((item) => item.legacy_model?.trim()).filter((value): value is string => Boolean(value))),
    );
    return ["전체", ...models.slice(0, 10)];
  }, [items]);

  const filteredItems = useMemo(
    () =>
      items
        .filter((item) => (modelFilter === "전체" ? true : item.legacy_model === modelFilter))
        .filter((item) => matchesWarehouseSearch(item, searchKeyword))
        .slice(0, 200),
    [items, modelFilter, searchKeyword],
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
      <section className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        <div className="border-b px-5 py-4" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: LEGACY_COLORS.muted2 }}>
            Operations
          </div>
          <div className="mt-1 text-xl font-black">입출고 처리</div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="rounded-[30px] border px-5 py-5" style={{ background: "linear-gradient(180deg, rgba(14,18,31,.96) 0%, rgba(10,14,24,.94) 100%)", borderColor: LEGACY_COLORS.border }}>
            <div className="mb-3 flex items-center gap-2 text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
              <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black text-white" style={{ background: LEGACY_COLORS.blue }}>
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
                    className="rounded-[16px] border px-4 py-5 text-center transition"
                    style={{
                      background: active ? entry.tone : LEGACY_COLORS.s2,
                      borderColor: active ? "rgba(120,167,255,.32)" : LEGACY_COLORS.border,
                      color: active ? LEGACY_COLORS.text : LEGACY_COLORS.muted2,
                    }}
                  >
                    <div className="mb-2 flex justify-center">{entry.icon}</div>
                    <div className="text-lg font-bold">{entry.label}</div>
                    <div className="mt-1 text-xs" style={{ color: active ? "#cbd9ff" : LEGACY_COLORS.muted }}>
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
                className="w-full rounded-[16px] border px-4 py-5 text-center transition"
                style={{
                  background: workType === "package-out" ? WORK_TYPES[3].tone : LEGACY_COLORS.s2,
                  borderColor: workType === "package-out" ? "rgba(255,206,112,.32)" : LEGACY_COLORS.border,
                  color: workType === "package-out" ? LEGACY_COLORS.text : LEGACY_COLORS.muted2,
                }}
              >
                <div className="mb-2 flex justify-center">{WORK_TYPES[3].icon}</div>
                <div className="text-lg font-bold">{WORK_TYPES[3].label}</div>
                <div className="mt-1 text-xs" style={{ color: workType === "package-out" ? "#fff2d0" : LEGACY_COLORS.muted }}>
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
                    className="rounded-[14px] border px-4 py-3 text-center transition"
                    style={{
                      background: entry.active ? entry.tone : LEGACY_COLORS.s2,
                      borderColor: entry.active ? "rgba(255,255,255,.14)" : LEGACY_COLORS.border,
                      color: entry.active ? LEGACY_COLORS.text : LEGACY_COLORS.muted2,
                    }}
                  >
                    <div className="text-base font-bold">{entry.label}</div>
                    <div className="mt-1 text-[11px]" style={{ color: entry.active ? entry.color : LEGACY_COLORS.muted }}>
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

            <div className="flex flex-wrap gap-x-3 gap-y-3">
              {employees.slice(0, 14).map((employee) => {
                const active = employee.employee_id === employeeId;
                return (
                  <button key={employee.employee_id} onClick={() => setEmployeeId(employee.employee_id)} className="flex w-[58px] flex-col items-center text-center transition">
                    <span className="flex h-[40px] w-[40px] items-center justify-center rounded-full text-[16px] font-black text-white" style={{ background: active ? LEGACY_COLORS.blue : "rgba(79,142,247,.85)", boxShadow: active ? "0 0 0 3px rgba(79,142,247,.14)" : "none" }}>
                      {firstEmployeeLetter(employee.name)}
                    </span>
                    <span className="mt-1 text-[11px] font-bold" style={{ color: active ? LEGACY_COLORS.text : LEGACY_COLORS.muted2 }}>
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
              <div className="mb-2 flex flex-wrap gap-2">
                {modelOptions.map((model) => (
                  <button
                    key={model}
                    onClick={() => setModelFilter(model)}
                    className="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
                    style={{
                      background: modelFilter === model ? LEGACY_COLORS.blue : LEGACY_COLORS.s2,
                      borderColor: modelFilter === model ? "rgba(120,167,255,.42)" : LEGACY_COLORS.border,
                      color: modelFilter === model ? "#fff" : LEGACY_COLORS.muted2,
                    }}
                  >
                    {model}
                  </button>
                ))}
              </div>
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
                        style={{ borderBottom: index === filteredPackages.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`, background: active ? "rgba(124,92,255,.14)" : "transparent" }}
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
                        style={{ borderBottom: index === filteredItems.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`, background: active ? "rgba(79,142,247,.12)" : "transparent" }}
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

      <section className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        <div className="border-b px-5 py-4" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: LEGACY_COLORS.muted2 }}>
            Confirm & Execute
          </div>
          <div className="mt-1 text-xl font-black">실행 확인</div>
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
                            className="rounded-[12px] px-3 py-3 text-lg font-black transition"
                            style={{ background: positive ? "rgba(5,87,54,.72)" : "rgba(86,32,39,.72)", color: positive ? "#2ff0a1" : "#ff6a73" }}
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
                  <div className="rounded-2xl border px-4 py-3 text-sm" style={{ background: "rgba(242,95,92,.12)", borderColor: "rgba(242,95,92,.24)", color: LEGACY_COLORS.red }}>
                    {error}
                  </div>
                ) : null}
              </div>

              <div className="border-t px-5 py-5" style={{ borderColor: LEGACY_COLORS.border }}>
                <button
                  onClick={() => void submit()}
                  disabled={submitting || (!selectedItem && !selectedPackage)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                  style={{ background: isOutbound ? LEGACY_COLORS.red : LEGACY_COLORS.blue }}
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
