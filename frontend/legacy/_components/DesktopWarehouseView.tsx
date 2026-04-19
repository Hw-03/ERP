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
import { DesktopRightPanel } from "./DesktopRightPanel";
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

const WORK_TYPES: { id: WorkType; label: string; subtitle: string; icon: React.ReactNode; accent: string; soft: string }[] = [
  { id: "raw-io", label: "원자재 입출고", subtitle: "외부 <-> 창고", icon: <Boxes className="h-4 w-4" />, accent: LEGACY_COLORS.green, soft: LEGACY_COLORS.greenSoft },
  { id: "warehouse-io", label: "창고 입출고", subtitle: "창고 <-> 부서", icon: <ArrowLeftRight className="h-4 w-4" />, accent: LEGACY_COLORS.blue, soft: LEGACY_COLORS.blueSoft },
  { id: "dept-io", label: "부서 입출고", subtitle: "공정 내부 처리", icon: <Workflow className="h-4 w-4" />, accent: LEGACY_COLORS.purple, soft: LEGACY_COLORS.purpleSoft },
  { id: "package-out", label: "패키지 출하", subtitle: "묶음 출하 처리", icon: <PackageCheck className="h-4 w-4" />, accent: LEGACY_COLORS.yellow, soft: LEGACY_COLORS.yellowSoft },
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
  if (workType === "warehouse-io") return warehouseDirection === "wh-to-dept" ? "창고 -> 부서" : "부서 -> 창고";
  if (workType === "dept-io") return `부서 ${deptDirection === "in" ? "입고" : "출고"}`;
  return "패키지 출하";
}

function workSubtitle(workType: WorkType, rawDirection: Direction, warehouseDirection: TransferDirection, deptDirection: Direction) {
  if (workType === "raw-io") return rawDirection === "in" ? "외부에서 창고로 입고" : "창고에서 외부로 출고";
  if (workType === "warehouse-io") return warehouseDirection === "wh-to-dept" ? "창고 재고를 부서로 이동" : "부서 재고를 창고로 반납";
  if (workType === "dept-io") return deptDirection === "in" ? "공정 내부 입고 처리" : "공정 내부 출고 처리";
  return "출하 묶음을 한 번에 실행";
}

function StageCard({
  active,
  accent,
  soft,
  icon,
  label,
  subtitle,
  onClick,
}: {
  active: boolean;
  accent: string;
  soft: string;
  icon: React.ReactNode;
  label: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-[20px] border px-4 py-4 text-left transition"
      style={{
        background: active ? soft : LEGACY_COLORS.s2,
        borderColor: active ? LEGACY_COLORS.borderStrong : LEGACY_COLORS.border,
        boxShadow: active ? LEGACY_COLORS.shadowSm : "none",
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-2xl"
          style={{ background: active ? accent : LEGACY_COLORS.s1, color: active ? "#fff" : LEGACY_COLORS.muted2 }}
        >
          {icon}
        </span>
      </div>
      <div className="text-sm font-bold">{label}</div>
      <div className="mt-1 text-xs leading-5" style={{ color: LEGACY_COLORS.muted2 }}>
        {subtitle}
      </div>
    </button>
  );
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

  const selectionReady = Boolean(selectedEmployee && (selectedItem || selectedPackage));

  return (
    <div className="flex h-[calc(100vh-108px)] min-h-0 flex-1 gap-5 overflow-hidden px-6 py-6">
      <section
        className="desktop-shell-panel h-full min-h-0 min-w-0 flex-1 overflow-y-auto"
        style={{
          background: `linear-gradient(180deg, ${LEGACY_COLORS.panel} 0%, ${LEGACY_COLORS.s1} 100%)`,
          borderColor: LEGACY_COLORS.border,
        }}
      >
        <div className="border-b px-5 py-5" style={{ borderColor: LEGACY_COLORS.border }}>
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <div className="desktop-section-label mb-2">Step 1</div>
              <div className="text-xl font-black">작업 유형 선택</div>
            </div>
            <div className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: activeWorkType.soft, color: activeWorkType.accent }}>
              {effectiveLabel}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {WORK_TYPES.map((entry) => (
              <StageCard
                key={entry.id}
                active={workType === entry.id}
                accent={entry.accent}
                soft={entry.soft}
                icon={entry.icon}
                label={entry.label}
                subtitle={entry.subtitle}
                onClick={() => {
                  setWorkType(entry.id);
                  setError(null);
                }}
              />
            ))}
          </div>

          {workType !== "package-out" ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {(workType === "raw-io"
                ? [
                    { id: "in", label: "창고 입고", subtitle: "외부 -> 창고", active: rawDirection === "in", onClick: () => setRawDirection("in"), color: LEGACY_COLORS.greenSoft, text: LEGACY_COLORS.green },
                    { id: "out", label: "창고 출고", subtitle: "창고 -> 외부", active: rawDirection === "out", onClick: () => setRawDirection("out"), color: LEGACY_COLORS.redSoft, text: LEGACY_COLORS.red },
                  ]
                : workType === "warehouse-io"
                  ? [
                      { id: "wh-to-dept", label: "창고 -> 부서", subtitle: "창고 재고 이동", active: warehouseDirection === "wh-to-dept", onClick: () => setWarehouseDirection("wh-to-dept"), color: LEGACY_COLORS.blueSoft, text: LEGACY_COLORS.blue },
                      { id: "dept-to-wh", label: "부서 -> 창고", subtitle: "부서 재고 반납", active: warehouseDirection === "dept-to-wh", onClick: () => setWarehouseDirection("dept-to-wh"), color: LEGACY_COLORS.blueSoft, text: LEGACY_COLORS.blue },
                    ]
                  : [
                      { id: "in", label: "부서 입고", subtitle: "공정 내부 입고", active: deptDirection === "in", onClick: () => setDeptDirection("in"), color: LEGACY_COLORS.purpleSoft, text: LEGACY_COLORS.purple },
                      { id: "out", label: "부서 출고", subtitle: "공정 내부 출고", active: deptDirection === "out", onClick: () => setDeptDirection("out"), color: LEGACY_COLORS.purpleSoft, text: LEGACY_COLORS.purple },
                    ]
              ).map((entry) => (
                <button
                  key={entry.id}
                  onClick={entry.onClick}
                  className="rounded-[20px] border px-4 py-4 text-left transition"
                  style={{
                    background: entry.active ? entry.color : LEGACY_COLORS.s2,
                    borderColor: entry.active ? LEGACY_COLORS.borderStrong : LEGACY_COLORS.border,
                  }}
                >
                  <div className="text-sm font-bold" style={{ color: entry.active ? entry.text : LEGACY_COLORS.text }}>
                    {entry.label}
                  </div>
                  <div className="mt-1 text-xs leading-5" style={{ color: LEGACY_COLORS.muted2 }}>
                    {entry.subtitle}
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="px-5 py-5">
          <div className="mb-6">
            <div className="desktop-section-label mb-3">Step 2</div>
            <div className="mb-4 text-lg font-black">담당 직원 선택</div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {employees.map((employee) => {
                const active = employee.employee_id === employeeId;
                const deptColor = employeeColor(employee.department);
                return (
                  <button
                    key={employee.employee_id}
                    onClick={() => setEmployeeId(employee.employee_id)}
                    className="flex min-w-[82px] shrink-0 flex-col items-center gap-2 rounded-[22px] border px-3 py-3 transition"
                    style={{
                      background: active ? `color-mix(in srgb, ${deptColor} 16%, ${LEGACY_COLORS.s2})` : LEGACY_COLORS.s2,
                      borderColor: active ? LEGACY_COLORS.borderStrong : LEGACY_COLORS.border,
                    }}
                  >
                    <span
                      className="flex h-[52px] w-[52px] items-center justify-center rounded-full text-[18px] font-black text-white"
                      style={{ background: deptColor, boxShadow: active ? `0 0 0 4px color-mix(in srgb, ${deptColor} 22%, transparent)` : "none" }}
                    >
                      {firstEmployeeLetter(employee.name)}
                    </span>
                    <span className="text-xs font-semibold">{employee.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-6">
            <div className="desktop-section-label mb-3">Step 3</div>
            <div className="mb-4 text-lg font-black">품목 탐색과 필터</div>

            {workType !== "package-out" ? (
              <>
                <div className="mb-3 flex flex-wrap gap-2">
                  {LEGACY_FILE_TYPES.map((entry) => (
                    <button
                      key={entry}
                      onClick={() => setFileType(entry)}
                      className="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
                      style={{
                        background: fileType === entry ? LEGACY_COLORS.blueSoft : LEGACY_COLORS.s2,
                        borderColor: fileType === entry ? LEGACY_COLORS.borderStrong : LEGACY_COLORS.border,
                        color: fileType === entry ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
                      }}
                    >
                      {entry}
                    </button>
                  ))}
                </div>
                <div className="mb-4 flex flex-wrap gap-2">
                  {LEGACY_MODELS.map((entry) => (
                    <button
                      key={entry}
                      onClick={() => setModelFilter(entry)}
                      className="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
                      style={{
                        background: modelFilter === entry ? LEGACY_COLORS.cyanSoft : LEGACY_COLORS.s2,
                        borderColor: modelFilter === entry ? LEGACY_COLORS.borderStrong : LEGACY_COLORS.border,
                        color: modelFilter === entry ? LEGACY_COLORS.cyan : LEGACY_COLORS.muted2,
                      }}
                    >
                      {entry}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            <div className="flex items-center gap-3 rounded-[18px] border px-4 py-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.borderStrong }}>
              <Search className="h-4 w-4" style={{ color: LEGACY_COLORS.blue }} />
              <input
                value={localSearch}
                onChange={(event) => setLocalSearch(event.target.value)}
                placeholder={workType === "package-out" ? "패키지명 또는 코드 검색" : "코드, 품명, 바코드, 모델 검색"}
                className="w-full bg-transparent text-sm outline-none"
                style={{ color: LEGACY_COLORS.text }}
              />
            </div>
          </div>

          <div>
            <div className="desktop-section-label mb-3">Step 4</div>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="text-lg font-black">품목 리스트</div>
              <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                {workType === "package-out" ? `${formatNumber(filteredPackages.length)}개 패키지` : `${formatNumber(filteredItems.length)}개 품목`}
              </div>
            </div>

            {workType === "package-out" ? (
              <div className="overflow-hidden rounded-[24px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                {filteredPackages.length === 0 ? (
                  <div className="px-5 py-6 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                    검색 결과가 없습니다.
                  </div>
                ) : (
                  filteredPackages.map((pkg, index) => {
                    const active = pkg.package_id === packageId;
                    return (
                      <button
                        key={pkg.package_id}
                        onClick={() => setPackageId((current) => (current === pkg.package_id ? "" : pkg.package_id))}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition"
                        style={{
                          background: active ? LEGACY_COLORS.yellowSoft : "transparent",
                          borderBottom: index === filteredPackages.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                        }}
                      >
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{pkg.name}</div>
                          <div className="mt-1 truncate text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                            {pkg.package_code}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="desktop-section-label !tracking-[0.12em]">구성품</div>
                          <div className="font-mono text-lg font-black">{formatNumber(pkg.items.length)}</div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="overflow-hidden rounded-[24px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                {filteredItems.length === 0 ? (
                  <div className="px-5 py-6 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                    검색 결과가 없습니다.
                  </div>
                ) : (
                  filteredItems.map((item, index) => {
                    const active = item.item_id === itemId;
                    return (
                      <button
                        key={item.item_id}
                        onClick={() => setItemId((current) => (current === item.item_id ? "" : item.item_id))}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition"
                        style={{
                          background: active ? LEGACY_COLORS.blueSoft : "transparent",
                          borderBottom: index === filteredItems.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                        }}
                      >
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{item.item_name}</div>
                          <div className="mt-1 truncate text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                            {item.item_code} / {item.spec || "-"} / {item.barcode || "-"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="desktop-section-label !tracking-[0.12em]">현재고</div>
                          <div className="font-mono text-lg font-black" style={{ color: Number(item.quantity) > 0 ? LEGACY_COLORS.green : LEGACY_COLORS.red }}>
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

      <DesktopRightPanel
        eyebrow="Execution Panel"
        title="실행 확인"
        subtitle={selectionReady ? `${effectiveLabel} / ${effectiveSubtitle}` : "작업 유형, 담당 직원, 품목을 선택하면 실행 내용이 순서대로 정리됩니다."}
        footer={
          <button
            onClick={() => void submit()}
            disabled={submitting || !selectionReady}
            className={isOutbound ? "desktop-action-danger w-full disabled:opacity-50" : "desktop-action-primary w-full disabled:opacity-50"}
          >
            {submitting ? "처리 중..." : `${effectiveLabel} 실행`}
          </button>
        }
      >
        <div className="space-y-4">
          <section className="rounded-[28px] border p-5" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
            <div className="desktop-section-label mb-3">작업 요약</div>
            <div className="rounded-[22px] border p-4" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}>
              <div className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: activeWorkType.accent }}>
                {activeWorkType.icon}
                {effectiveLabel}
              </div>
              <div className="text-sm leading-6" style={{ color: LEGACY_COLORS.muted2 }}>
                {effectiveSubtitle}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-[20px] border p-4" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}>
                <div className="desktop-section-label mb-2">담당 직원</div>
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-black text-white"
                    style={{ background: selectedEmployee ? employeeColor(selectedEmployee.department) : LEGACY_COLORS.muted }}
                  >
                    {selectedEmployee ? firstEmployeeLetter(selectedEmployee.name) : <UserRound className="h-4 w-4" />}
                  </div>
                  <div>
                    <div className="font-semibold">{selectedEmployee?.name || "선택 전"}</div>
                    <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                      {selectedEmployee ? normalizeDepartment(selectedEmployee.department) : "직원을 먼저 선택해 주세요"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-[20px] border p-4" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s1 }}>
                <div className="desktop-section-label mb-2">대상</div>
                <div className="font-semibold">{workType === "package-out" ? selectedPackage?.name || "선택 전" : selectedItem?.item_name || "선택 전"}</div>
                <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  {workType === "package-out" ? selectedPackage?.package_code || "패키지를 먼저 선택해 주세요" : selectedItem?.item_code || "품목을 먼저 선택해 주세요"}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border p-5" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
            <div className="desktop-section-label mb-3">수량 입력</div>
            <input
              value={quantity}
              onChange={(event) => setQuantity(sanitizeQuantity(Number(event.target.value.replace(/[^\d-]/g, ""))))}
              className="w-full rounded-[22px] border px-4 py-4 text-center font-mono text-[34px] font-black outline-none"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            />

            <div className="mt-3 grid grid-cols-4 gap-2">
              {QUICK_STEPS.map((step) => {
                const positive = step > 0;
                return (
                  <button
                    key={step}
                    onClick={() => setQuantity((current) => sanitizeQuantity(Number(current || 0) + step))}
                    className="rounded-[14px] px-3 py-3 text-lg font-black transition"
                    style={{
                      background: positive ? LEGACY_COLORS.greenSoft : LEGACY_COLORS.redSoft,
                      color: positive ? LEGACY_COLORS.green : LEGACY_COLORS.red,
                    }}
                  >
                    {step > 0 ? `+${step}` : step}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 space-y-3">
              <input
                value={referenceNo}
                onChange={(event) => setReferenceNo(event.target.value)}
                placeholder="참조 번호"
                className="w-full rounded-[16px] border px-4 py-3 text-sm outline-none"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              />
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="비고"
                className="min-h-[96px] w-full rounded-[16px] border px-4 py-3 text-sm outline-none"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
              />
            </div>
          </section>

          <section className="rounded-[28px] border p-5" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
            <div className="desktop-section-label mb-3">실행 결과 미리보기</div>
            {workType !== "package-out" && selectedItem ? (
              <div className="space-y-2 text-sm">
                <div>현재고 <span className="font-mono">{formatNumber(selectedItem.quantity)}</span></div>
                <div>처리 수량 <span className="font-mono">{formatNumber(quantity)}</span></div>
                <div>처리 후 예상 재고 <span className="font-mono">{expectedQuantity == null ? "-" : formatNumber(expectedQuantity)}</span></div>
              </div>
            ) : workType === "package-out" && selectedPackage ? (
              <div className="space-y-2 text-sm">
                <div>패키지명 <span className="font-semibold">{selectedPackage.name}</span></div>
                <div>구성품 수 <span className="font-mono">{formatNumber(selectedPackage.items.length)}</span></div>
                <div>실행 수량 <span className="font-mono">{formatNumber(quantity)}</span></div>
              </div>
            ) : (
              <div className="text-sm leading-6" style={{ color: LEGACY_COLORS.muted2 }}>
                아직 선택된 대상이 없습니다. 왼쪽 단계에서 작업 유형, 직원, 품목을 순서대로 선택해 주세요.
              </div>
            )}
          </section>

          {error ? (
            <div className="rounded-2xl border px-4 py-3 text-sm" style={{ background: LEGACY_COLORS.redSoft, borderColor: LEGACY_COLORS.borderStrong, color: LEGACY_COLORS.red }}>
              {error}
            </div>
          ) : null}

          <div className="rounded-[28px] border p-5" style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2 }}>
            <div className="desktop-section-label mb-3">액션 가이드</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[18px] px-4 py-4" style={{ background: LEGACY_COLORS.greenSoft }}>
                <div className="text-sm font-bold" style={{ color: LEGACY_COLORS.green }}>입고 계열</div>
                <div className="mt-1 text-xs leading-5" style={{ color: LEGACY_COLORS.textSoft }}>
                  원자재 입고, 부서 반환, 내부 입고는 왼쪽부터 오른쪽 흐름으로 처리됩니다.
                </div>
              </div>
              <div className="rounded-[18px] px-4 py-4" style={{ background: LEGACY_COLORS.redSoft }}>
                <div className="text-sm font-bold" style={{ color: LEGACY_COLORS.red }}>출고 계열</div>
                <div className="mt-1 text-xs leading-5" style={{ color: LEGACY_COLORS.textSoft }}>
                  창고 출고와 패키지 출하는 붉은 계열 액션 버튼으로 일관되게 처리됩니다.
                </div>
              </div>
            </div>
          </div>
        </div>
      </DesktopRightPanel>
    </div>
  );
}
