"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, PackageCheck, Truck } from "lucide-react";

import AppHeader from "@/components/AppHeader";
import { api, type Department, type Employee, type Item, type ShipPackage } from "@/lib/api";

type WarehouseMode = "whin" | "wh2d" | "d2wh";
type DepartmentMode = "in" | "out";
type ShipmentMode = "package" | "custom";

const DEPARTMENT_OPTIONS: Array<{ value: Department; label: string }> = [
  { value: "議곕┰" as Department, label: "조립" },
  { value: "怨좎븬" as Department, label: "고압" },
  { value: "吏꾧났" as Department, label: "진공" },
  { value: "?쒕떇" as Department, label: "세척" },
  { value: "?쒕툕" as Department, label: "튜브" },
  { value: "AS", label: "AS" },
  { value: "?곌뎄" as Department, label: "연구" },
  { value: "?곸뾽" as Department, label: "영업" },
  { value: "異쒗븯" as Department, label: "출하" },
  { value: "湲고?" as Department, label: "기타" },
];

const SHIPPING_DEPARTMENT = "異쒗븯" as Department;

function departmentLabel(value: Department) {
  return DEPARTMENT_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function employeeLabel(employee: Employee) {
  return `${employee.employee_code} · ${employee.name} (${departmentLabel(employee.department)})`;
}

function itemLabel(item: Item) {
  return `${item.item_code} · ${item.item_name}`;
}

function filterItems(items: Item[], keyword: string) {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) =>
    [item.item_code, item.item_name, item.spec ?? "", item.barcode ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}

export default function OperationsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [warehouseMode, setWarehouseMode] = useState<WarehouseMode>("whin");
  const [warehouseDepartment, setWarehouseDepartment] = useState<Department>("議곕┰" as Department);
  const [warehouseEmployeeId, setWarehouseEmployeeId] = useState("");
  const [warehouseItemId, setWarehouseItemId] = useState("");
  const [warehouseItemSearch, setWarehouseItemSearch] = useState("");
  const [warehouseQty, setWarehouseQty] = useState("1");
  const [warehouseRef, setWarehouseRef] = useState("");
  const [warehouseNote, setWarehouseNote] = useState("");

  const [deptDepartment, setDeptDepartment] = useState<Department>("議곕┰" as Department);
  const [deptMode, setDeptMode] = useState<DepartmentMode>("in");
  const [deptShipmentMode, setDeptShipmentMode] = useState<ShipmentMode>("package");
  const [deptEmployeeId, setDeptEmployeeId] = useState("");
  const [deptItemId, setDeptItemId] = useState("");
  const [deptItemSearch, setDeptItemSearch] = useState("");
  const [deptPackageId, setDeptPackageId] = useState("");
  const [deptQty, setDeptQty] = useState("1");
  const [deptRef, setDeptRef] = useState("");
  const [deptNote, setDeptNote] = useState("");

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      api.getEmployees({ activeOnly: true }),
      api.getItems({ limit: 2000 }),
      api.getShipPackages(),
    ])
      .then(([employeeRows, itemRows, packageRows]) => {
        if (!cancelled) {
          setEmployees(employeeRows);
          setItems(itemRows);
          setPackages(packageRows);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "운영 데이터를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!(deptDepartment === SHIPPING_DEPARTMENT && deptMode === "out")) {
      setDeptShipmentMode("package");
      setDeptPackageId("");
    }
  }, [deptDepartment, deptMode]);

  const warehouseEmployees = useMemo(
    () => employees.filter((employee) => employee.department === warehouseDepartment),
    [employees, warehouseDepartment],
  );

  const departmentEmployees = useMemo(
    () => employees.filter((employee) => employee.department === deptDepartment),
    [employees, deptDepartment],
  );

  const filteredWarehouseItems = useMemo(
    () => filterItems(items, warehouseItemSearch),
    [items, warehouseItemSearch],
  );

  const filteredDepartmentItems = useMemo(
    () => filterItems(items, deptItemSearch),
    [items, deptItemSearch],
  );

  const selectedWarehouseItem = useMemo(
    () => items.find((item) => item.item_id === warehouseItemId) ?? null,
    [items, warehouseItemId],
  );

  const selectedDepartmentItem = useMemo(
    () => items.find((item) => item.item_id === deptItemId) ?? null,
    [items, deptItemId],
  );

  const selectedDeptPackage = useMemo(
    () => packages.find((pkg) => pkg.package_id === deptPackageId) ?? null,
    [deptPackageId, packages],
  );

  const warehouseSummary = useMemo(() => {
    if (!selectedWarehouseItem) return "품목을 선택하면 현재고와 처리 방향을 요약해드립니다.";
    const qty = Number(warehouseQty || 0);
    const current = Number(selectedWarehouseItem.quantity ?? 0);
    const next = warehouseMode === "wh2d" ? current - qty : current + qty;
    const modeLabel =
      warehouseMode === "whin"
        ? "창고 입고"
        : warehouseMode === "wh2d"
          ? "창고 → 부서 출고"
          : "부서 → 창고 반납";
    return `${modeLabel} · ${selectedWarehouseItem.item_name} · 현재 ${current.toLocaleString()} → 처리 후 ${next.toLocaleString()}`;
  }, [selectedWarehouseItem, warehouseMode, warehouseQty]);

  const departmentSummary = useMemo(() => {
    const qty = Number(deptQty || 0);
    if (deptDepartment === SHIPPING_DEPARTMENT && deptMode === "out" && deptShipmentMode === "package") {
      if (!selectedDeptPackage) return "출하 패키지를 선택하면 실행 요약을 보여드립니다.";
      return `출하 패키지 · ${selectedDeptPackage.name} · 수량 ${qty.toLocaleString()}`;
    }
    if (!selectedDepartmentItem) return "부서 처리 대상 품목을 선택하면 실행 요약을 보여드립니다.";
    const current = Number(selectedDepartmentItem.quantity ?? 0);
    const next = deptMode === "in" ? current + qty : current - qty;
    const modeLabel = deptMode === "in" ? "부서 입고" : "부서 출고";
    return `${departmentLabel(deptDepartment)} · ${modeLabel} · ${selectedDepartmentItem.item_name} · 현재 ${current.toLocaleString()} → 처리 후 ${next.toLocaleString()}`;
  }, [deptDepartment, deptMode, deptQty, deptShipmentMode, selectedDepartmentItem, selectedDeptPackage]);

  const runWarehouseAction = async () => {
    try {
      setError(null);
      setMessage(null);
      const qty = Number(warehouseQty);
      const employee = employees.find((row) => row.employee_id === warehouseEmployeeId);
      const operator = employee ? `${employee.employee_code} ${employee.name}` : undefined;

      if (!warehouseEmployeeId) {
        throw new Error("담당 직원을 먼저 선택해 주세요.");
      }
      if (!warehouseItemId || !qty || qty <= 0) {
        throw new Error("품목과 수량을 정확히 입력해 주세요.");
      }

      if (warehouseMode === "whin" || warehouseMode === "d2wh") {
        await api.receiveInventory({
          item_id: warehouseItemId,
          quantity: qty,
          reference_no: warehouseRef || undefined,
          produced_by: operator,
          location: warehouseMode === "d2wh" ? "창고" : warehouseDepartment,
          notes:
            warehouseMode === "whin"
              ? `[창고 입고] ${departmentLabel(warehouseDepartment)} · ${warehouseNote}`.trim()
              : `[부서 반납] ${departmentLabel(warehouseDepartment)} → 창고 · ${warehouseNote}`.trim(),
        });
      } else {
        await api.shipInventory({
          item_id: warehouseItemId,
          quantity: qty,
          reference_no: warehouseRef || undefined,
          produced_by: operator,
          location: warehouseDepartment,
          notes: `[창고 출고] 창고 → ${departmentLabel(warehouseDepartment)} · ${warehouseNote}`.trim(),
        });
      }

      setMessage("창고 입출고 처리가 완료되었습니다.");
      setWarehouseQty("1");
      setWarehouseRef("");
      setWarehouseNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "창고 입출고 처리에 실패했습니다.");
    }
  };

  const runDepartmentAction = async () => {
    try {
      setError(null);
      setMessage(null);
      const qty = Number(deptQty);
      const employee = employees.find((row) => row.employee_id === deptEmployeeId);
      const operator = employee ? `${employee.employee_code} ${employee.name}` : undefined;

      if (!deptEmployeeId) {
        throw new Error("담당 직원을 먼저 선택해 주세요.");
      }
      if (!qty || qty <= 0) {
        throw new Error("수량을 정확히 입력해 주세요.");
      }

      const usePackageShipment =
        deptDepartment === SHIPPING_DEPARTMENT && deptMode === "out" && deptShipmentMode === "package";

      if (usePackageShipment) {
        if (!deptPackageId) {
          throw new Error("출하 패키지를 선택해 주세요.");
        }

        await api.shipPackage({
          package_id: deptPackageId,
          quantity: qty,
          reference_no: deptRef || undefined,
          produced_by: operator,
          notes: deptNote || undefined,
        });
      } else {
        if (!deptItemId) {
          throw new Error("품목을 선택해 주세요.");
        }

        if (deptMode === "in") {
          await api.receiveInventory({
            item_id: deptItemId,
            quantity: qty,
            reference_no: deptRef || undefined,
            produced_by: operator,
            location: deptDepartment,
            notes: `[부서 입고] ${departmentLabel(deptDepartment)} · ${deptNote}`.trim(),
          });
        } else {
          await api.shipInventory({
            item_id: deptItemId,
            quantity: qty,
            reference_no: deptRef || undefined,
            produced_by: operator,
            location: deptDepartment,
            notes: `[부서 출고] ${departmentLabel(deptDepartment)} · ${deptNote}`.trim(),
          });
        }
      }

      setMessage("부서 입출고 처리가 완료되었습니다.");
      setDeptQty("1");
      setDeptRef("");
      setDeptNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "부서 입출고 처리에 실패했습니다.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AppHeader />

      <main className="mx-auto max-w-screen-2xl px-6 py-8">
        <section className="rounded-[28px] border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Operations Workspace
          </p>
          <h2 className="mt-3 text-4xl font-black tracking-tight">입출고 운영 화면</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            창고 이동, 부서 입출고, 패키지 출하를 한 화면에서 처리하는 운영 콘솔입니다.
            담당자 선택과 실행 요약을 함께 보여줘서 실수를 줄이는 데 집중했습니다.
          </p>
        </section>

        {(message || error) && (
          <div
            className={`mt-6 rounded-2xl px-4 py-3 text-sm ${
              error
                ? "border border-red-800/50 bg-red-950/30 text-red-300"
                : "border border-emerald-800/50 bg-emerald-950/30 text-emerald-300"
            }`}
          >
            {error || message}
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <section className="rounded-[24px] border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-blue-500/15 p-2 text-blue-300">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-100">창고 입출고</h3>
                <p className="text-sm text-slate-500">
                  창고 입고, 창고에서 부서로 이동, 부서 반납을 처리합니다.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
              {warehouseSummary}
            </div>

            <div className="mt-5 grid gap-3">
              <select value={warehouseMode} onChange={(event) => setWarehouseMode(event.target.value as WarehouseMode)} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
                <option value="whin">창고 입고</option>
                <option value="wh2d">창고 → 부서 출고</option>
                <option value="d2wh">부서 → 창고 반납</option>
              </select>
              <select value={warehouseDepartment} onChange={(event) => setWarehouseDepartment(event.target.value as Department)} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
                {DEPARTMENT_OPTIONS.map((department) => (
                  <option key={department.value} value={department.value}>{department.label}</option>
                ))}
              </select>
              <select value={warehouseEmployeeId} onChange={(event) => setWarehouseEmployeeId(event.target.value)} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
                <option value="">담당 직원 선택</option>
                {warehouseEmployees.map((employee) => (
                  <option key={employee.employee_id} value={employee.employee_id}>{employeeLabel(employee)}</option>
                ))}
              </select>
              <input value={warehouseItemSearch} onChange={(event) => setWarehouseItemSearch(event.target.value)} placeholder="품목 코드, 이름, 바코드 검색" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
              <select value={warehouseItemId} onChange={(event) => setWarehouseItemId(event.target.value)} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
                <option value="">처리할 품목 선택</option>
                {filteredWarehouseItems.map((item) => (
                  <option key={item.item_id} value={item.item_id}>{itemLabel(item)}</option>
                ))}
              </select>
              <input value={warehouseQty} onChange={(event) => setWarehouseQty(event.target.value)} placeholder="수량" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
              <input value={warehouseRef} onChange={(event) => setWarehouseRef(event.target.value)} placeholder="참조번호" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
              <textarea value={warehouseNote} onChange={(event) => setWarehouseNote(event.target.value)} placeholder="처리 사유 또는 메모" className="min-h-[96px] rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
              <button onClick={runWarehouseAction} disabled={loading} className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50">
                창고 입출고 실행
              </button>
            </div>
          </section>

          <section className="rounded-[24px] border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-500/15 p-2 text-emerald-300">
                <ArrowRightLeft className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-100">부서 입출고</h3>
                <p className="text-sm text-slate-500">
                  부서 입고, 부서 출고, 출하 패키지 출고를 단계형으로 처리합니다.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
              {departmentSummary}
            </div>

            <div className="mt-5 grid gap-3">
              <select value={deptDepartment} onChange={(event) => setDeptDepartment(event.target.value as Department)} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
                {DEPARTMENT_OPTIONS.map((department) => (
                  <option key={department.value} value={department.value}>{department.label}</option>
                ))}
              </select>
              <select value={deptMode} onChange={(event) => setDeptMode(event.target.value as DepartmentMode)} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
                <option value="in">부서 입고</option>
                <option value="out">부서 출고</option>
              </select>
              <select value={deptEmployeeId} onChange={(event) => setDeptEmployeeId(event.target.value)} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
                <option value="">담당 직원 선택</option>
                {departmentEmployees.map((employee) => (
                  <option key={employee.employee_id} value={employee.employee_id}>{employeeLabel(employee)}</option>
                ))}
              </select>

              {deptDepartment === SHIPPING_DEPARTMENT && deptMode === "out" && (
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setDeptShipmentMode("package")} className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${deptShipmentMode === "package" ? "border-blue-500 bg-blue-500/15 text-blue-200" : "border-slate-800 bg-slate-950 text-slate-400"}`}>
                    패키지 출하
                  </button>
                  <button type="button" onClick={() => setDeptShipmentMode("custom")} className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${deptShipmentMode === "custom" ? "border-blue-500 bg-blue-500/15 text-blue-200" : "border-slate-800 bg-slate-950 text-slate-400"}`}>
                    개별 품목 출하
                  </button>
                </div>
              )}

              {deptDepartment === SHIPPING_DEPARTMENT && deptMode === "out" && deptShipmentMode === "package" ? (
                <>
                  <select value={deptPackageId} onChange={(event) => setDeptPackageId(event.target.value)} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
                    <option value="">출하 패키지 선택</option>
                    {packages.map((pkg) => (
                      <option key={pkg.package_id} value={pkg.package_id}>{pkg.package_code} · {pkg.name}</option>
                    ))}
                  </select>
                  {selectedDeptPackage && (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-100">
                        <PackageCheck className="h-4 w-4 text-amber-300" />
                        패키지 구성
                      </div>
                      <div className="space-y-2 text-sm text-slate-400">
                        {selectedDeptPackage.items.map((pkgItem) => (
                          <div key={pkgItem.package_item_id} className="flex justify-between gap-4">
                            <span>{pkgItem.item_name}</span>
                            <span className="font-mono">{Number(pkgItem.quantity).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <input value={deptItemSearch} onChange={(event) => setDeptItemSearch(event.target.value)} placeholder="품목 코드, 이름, 바코드 검색" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
                  <select value={deptItemId} onChange={(event) => setDeptItemId(event.target.value)} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
                    <option value="">처리할 품목 선택</option>
                    {filteredDepartmentItems.map((item) => (
                      <option key={item.item_id} value={item.item_id}>{itemLabel(item)}</option>
                    ))}
                  </select>
                </>
              )}

              <input value={deptQty} onChange={(event) => setDeptQty(event.target.value)} placeholder="수량" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
              <input value={deptRef} onChange={(event) => setDeptRef(event.target.value)} placeholder="참조번호" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
              <textarea value={deptNote} onChange={(event) => setDeptNote(event.target.value)} placeholder="처리 사유 또는 메모" className="min-h-[96px] rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
              <button onClick={runDepartmentAction} disabled={loading} className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-500 disabled:opacity-50">
                부서 입출고 실행
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
