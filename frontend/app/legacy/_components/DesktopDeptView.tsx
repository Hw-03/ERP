"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, PackageCheck, RefreshCw, UserRound } from "lucide-react";
import { api, type Department, type Employee, type Item, type ShipPackage } from "@/lib/api";
import { DesktopRightPanel } from "./DesktopRightPanel";
import {
  DEPARTMENT_ICONS,
  LEGACY_COLORS,
  buildItemSearchLabel,
  employeeColor,
  firstEmployeeLetter,
  formatNumber,
  normalizeDepartment,
} from "./legacyUi";

const DEPARTMENT_OPTIONS = ["조립", "고압", "진공", "셋팅", "튜브", "출하"] as const;

function departmentToApiValue(label: (typeof DEPARTMENT_OPTIONS)[number]): Department {
  const map: Record<(typeof DEPARTMENT_OPTIONS)[number], Department> = {
    조립: "조립" as Department,
    고압: "고압" as Department,
    진공: "진공" as Department,
    셋팅: "셋팅" as Department,
    튜브: "튜브" as Department,
    출하: "출하" as Department,
  };
  return map[label];
}

export function DesktopDeptView({
  globalSearch,
  onStatusChange,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [department, setDepartment] = useState<(typeof DEPARTMENT_OPTIONS)[number]>("조립");
  const [mode, setMode] = useState<"in" | "out">("out");
  const [usePackage, setUsePackage] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [itemId, setItemId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [localSearch, setLocalSearch] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadData() {
    const [nextEmployees, nextItems, nextPackages] = await Promise.all([
      api.getEmployees({ activeOnly: true }),
      api.getItems({ limit: 2000, search: globalSearch.trim() || undefined }),
      api.getShipPackages(),
    ]);
    setEmployees(nextEmployees);
    setItems(nextItems);
    setPackages(nextPackages);
    onStatusChange(`부서입출고용 직원 ${nextEmployees.length}명, 패키지 ${nextPackages.length}건 로드`);
  }

  useEffect(() => {
    void loadData().catch((nextError) => {
      onStatusChange(nextError instanceof Error ? nextError.message : "부서입출고 데이터를 불러오지 못했습니다.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSearch]);

  const activeDepartment = departmentToApiValue(department);
  const visibleEmployees = useMemo(
    () => employees.filter((employee) => employee.department === activeDepartment),
    [activeDepartment, employees],
  );
  const visibleItems = useMemo(() => {
    const keyword = `${globalSearch} ${localSearch}`.trim().toLowerCase();
    if (!keyword) return items.slice(0, 80);
    return items
      .filter((item) => `${item.item_name} ${item.item_code} ${item.barcode ?? ""}`.toLowerCase().includes(keyword))
      .slice(0, 120);
  }, [globalSearch, items, localSearch]);

  const selectedEmployee = employees.find((employee) => employee.employee_id === employeeId) ?? null;
  const selectedItem = items.find((item) => item.item_id === itemId) ?? null;
  const selectedPackage = packages.find((pkg) => pkg.package_id === packageId) ?? null;

  async function submit() {
    if (!selectedEmployee) {
      setError("직원을 먼저 선택해 주세요.");
      return;
    }
    if (usePackage && !selectedPackage) {
      setError("출하 패키지를 선택해 주세요.");
      return;
    }
    if (!usePackage && !selectedItem) {
      setError("품목을 먼저 선택해 주세요.");
      return;
    }
    const numericQty = Number(quantity || 0);
    if (!numericQty || numericQty <= 0) {
      setError("수량은 1 이상이어야 합니다.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const producedBy = `${selectedEmployee.name} (${department})`;
      if (usePackage && selectedPackage) {
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
        if (mode === "in") {
          await api.receiveInventory(payload);
        } else {
          await api.shipInventory(payload);
        }
      }
      await loadData();
      setReferenceNo("");
      setNotes("");
      setQuantity("1");
      onStatusChange(`${department} 부서 입출고 처리 완료`);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "부서입출고 처리를 완료하지 못했습니다.";
      setError(message);
      onStatusChange(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] gap-5 px-6 py-6">
        <section className="space-y-4 rounded-[28px] border p-5" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
              부서 선택
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DEPARTMENT_OPTIONS.map((entry) => (
                <button
                  key={entry}
                  onClick={() => {
                    setDepartment(entry);
                    setEmployeeId("");
                  }}
                  className="rounded-2xl border px-3 py-3 text-left"
                  style={{
                    background: department === entry ? "rgba(79,142,247,.16)" : LEGACY_COLORS.s2,
                    borderColor: department === entry ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                  }}
                >
                  <div className="mb-1 text-lg">{DEPARTMENT_ICONS[entry]}</div>
                  <div className="text-sm font-bold">{entry}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
              작업 방식
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setMode("in");
                  setUsePackage(false);
                }}
                className="rounded-2xl border px-3 py-3 text-sm font-semibold"
                style={{
                  background: mode === "in" ? "rgba(31,209,122,.16)" : LEGACY_COLORS.s2,
                  borderColor: mode === "in" ? LEGACY_COLORS.green : LEGACY_COLORS.border,
                  color: mode === "in" ? LEGACY_COLORS.green : LEGACY_COLORS.text,
                }}
              >
                부서 입고
              </button>
              <button
                onClick={() => setMode("out")}
                className="rounded-2xl border px-3 py-3 text-sm font-semibold"
                style={{
                  background: mode === "out" ? "rgba(242,95,92,.16)" : LEGACY_COLORS.s2,
                  borderColor: mode === "out" ? LEGACY_COLORS.red : LEGACY_COLORS.border,
                  color: mode === "out" ? LEGACY_COLORS.red : LEGACY_COLORS.text,
                }}
              >
                부서 출고
              </button>
            </div>
          </div>

          {mode === "out" ? (
            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                처리 대상
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setUsePackage(false)}
                  className="rounded-2xl border px-3 py-3 text-sm font-semibold"
                  style={{
                    background: !usePackage ? LEGACY_COLORS.blue : LEGACY_COLORS.s2,
                    borderColor: !usePackage ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                    color: !usePackage ? "#fff" : LEGACY_COLORS.text,
                  }}
                >
                  개별 품목
                </button>
                <button
                  onClick={() => setUsePackage(true)}
                  className="rounded-2xl border px-3 py-3 text-sm font-semibold"
                  style={{
                    background: usePackage ? LEGACY_COLORS.purple : LEGACY_COLORS.s2,
                    borderColor: usePackage ? LEGACY_COLORS.purple : LEGACY_COLORS.border,
                    color: usePackage ? "#fff" : LEGACY_COLORS.text,
                  }}
                >
                  출하 패키지
                </button>
              </div>
            </div>
          ) : null}

          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
              담당 직원
            </div>
            <div className="space-y-2">
              {visibleEmployees.map((employee) => (
                <button
                  key={employee.employee_id}
                  onClick={() => setEmployeeId(employee.employee_id)}
                  className="flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left"
                  style={{
                    background: employeeId === employee.employee_id ? "rgba(79,142,247,.16)" : LEGACY_COLORS.s2,
                    borderColor: employeeId === employee.employee_id ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                  }}
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full font-black text-white"
                    style={{ background: employeeColor(employee.department) }}
                  >
                    {firstEmployeeLetter(employee.name)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{employee.name}</div>
                    <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                      {normalizeDepartment(employee.department)} · {employee.role}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="min-h-0 rounded-[28px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
          <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: LEGACY_COLORS.border }}>
            <div>
              <div className="text-lg font-black">부서입출고 작업대</div>
              <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                부서별 담당자, 개별 품목, 출하 패키지를 한 화면에서 처리합니다.
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-2xl px-4 py-2" style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted2 }}>
              <Building2 className="h-4 w-4" />
              {department}
            </div>
          </div>

          {usePackage ? (
            <div className="h-[calc(100vh-220px)] overflow-auto px-5 py-5">
              <div className="grid grid-cols-2 gap-4">
                {packages.map((pkg) => (
                  <button
                    key={pkg.package_id}
                    onClick={() => setPackageId(pkg.package_id)}
                    className="rounded-3xl border px-4 py-4 text-left"
                    style={{
                      background: packageId === pkg.package_id ? "rgba(124,58,237,.16)" : LEGACY_COLORS.s2,
                      borderColor: packageId === pkg.package_id ? LEGACY_COLORS.purple : LEGACY_COLORS.border,
                    }}
                  >
                    <div className="text-sm font-bold">{pkg.name}</div>
                    <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                      {pkg.package_code} · {pkg.items.length}종 구성
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="border-b px-5 py-4" style={{ borderColor: LEGACY_COLORS.border }}>
                <input
                  value={localSearch}
                  onChange={(event) => setLocalSearch(event.target.value)}
                  placeholder="품목명, 코드, 바코드 검색"
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                  style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                />
              </div>

              <div className="h-[calc(100vh-296px)] overflow-auto">
                <table className="min-w-full text-left">
                  <thead className="sticky top-0 z-10" style={{ background: LEGACY_COLORS.s2 }}>
                    <tr className="text-xs uppercase tracking-[0.16em]" style={{ color: LEGACY_COLORS.muted2 }}>
                      <th className="px-5 py-3">품목</th>
                      <th className="px-5 py-3">바코드</th>
                      <th className="px-5 py-3 text-right">현재고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((item) => (
                      <tr
                        key={item.item_id}
                        onClick={() => {
                          setItemId(item.item_id);
                          setLocalSearch(buildItemSearchLabel(item));
                        }}
                        className="cursor-pointer border-b transition hover:bg-white/5"
                        style={{ borderColor: LEGACY_COLORS.border }}
                      >
                        <td className="px-5 py-4">
                          <div className="text-sm font-semibold">{item.item_name}</div>
                          <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                            {item.item_code}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                          {item.barcode || "-"}
                        </td>
                        <td className="px-5 py-4 text-right font-mono text-sm font-bold" style={{ color: LEGACY_COLORS.blue }}>
                          {formatNumber(item.quantity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>

      <DesktopRightPanel
        title="부서 처리 패널"
        subtitle="부서별 이동, 출하 패키지 출고, 참고 번호와 메모를 함께 기록합니다."
      >
        <div className="space-y-4">
          <section className="rounded-3xl border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: "rgba(79,142,247,.16)", color: LEGACY_COLORS.blue }}>
                <UserRound className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-bold">{selectedEmployee?.name || "직원 미선택"}</div>
                <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  {selectedEmployee ? normalizeDepartment(selectedEmployee.department) : "담당자를 먼저 선택해 주세요."}
                </div>
              </div>
            </div>

            <div className="rounded-2xl px-3 py-3" style={{ background: LEGACY_COLORS.s1 }}>
              <div className="mb-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                처리 대상
              </div>
              <div className="text-sm font-semibold">
                {usePackage ? selectedPackage?.name || "패키지 미선택" : selectedItem?.item_name || "품목 미선택"}
              </div>
              <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                {usePackage
                  ? selectedPackage ? `${selectedPackage.package_code} · ${selectedPackage.items.length}종 구성` : "출하 패키지를 먼저 선택해 주세요."
                  : selectedItem ? `${selectedItem.item_code} · ${selectedItem.unit}` : "가운데 목록에서 품목을 선택해 주세요."}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
              수량 / 메모
            </div>
            <input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              inputMode="numeric"
              className="mb-3 w-full rounded-2xl border px-4 py-3 text-center font-mono text-xl font-black outline-none"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            />
            <div className="mb-3 grid grid-cols-4 gap-2">
              {[-10, -1, 1, 10].map((delta) => (
                <button
                  key={delta}
                  onClick={() => setQuantity((current) => String(Math.max(1, Number(current || 0) + delta)))}
                  className="rounded-2xl px-3 py-2 text-sm font-bold"
                  style={{
                    background: delta < 0 ? "rgba(242,95,92,.14)" : "rgba(31,209,122,.14)",
                    color: delta < 0 ? LEGACY_COLORS.red : LEGACY_COLORS.green,
                  }}
                >
                  {delta > 0 ? `+${delta}` : delta}
                </button>
              ))}
            </div>
            <input
              value={referenceNo}
              onChange={(event) => setReferenceNo(event.target.value)}
              placeholder="참조번호"
              className="mb-3 w-full rounded-2xl border px-4 py-3 text-sm outline-none"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            />
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="메모"
              className="min-h-[96px] w-full rounded-2xl border px-4 py-3 text-sm outline-none"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            />
          </section>

          <section className="rounded-3xl border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
              처리 실행
            </div>
            {error ? (
              <div className="mb-3 rounded-2xl border px-3 py-2 text-sm" style={{ background: "rgba(242,95,92,.12)", borderColor: "rgba(242,95,92,.25)", color: LEGACY_COLORS.red }}>
                {error}
              </div>
            ) : null}
            <button
              onClick={() => void submit()}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold disabled:opacity-50"
              style={{ background: mode === "in" ? LEGACY_COLORS.green : LEGACY_COLORS.red, color: mode === "in" ? "#000" : "#fff" }}
            >
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
              {submitting ? "처리 중..." : usePackage ? "출하 패키지 실행" : mode === "in" ? "부서 입고 실행" : "부서 출고 실행"}
            </button>
          </section>
        </div>
      </DesktopRightPanel>
    </div>
  );
}
