"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, PackageCheck, Truck } from "lucide-react";

import AppHeader from "@/components/AppHeader";
import { api, type Department, type Employee, type Item, type ShipPackage } from "@/lib/api";

const DEPARTMENTS: Department[] = [
  "조립",
  "고압",
  "진공",
  "튜닝",
  "튜브",
  "AS",
  "연구",
  "영업",
  "출하",
  "기타",
];

type WarehouseMode = "whin" | "wh2d" | "d2wh";
type DepartmentMode = "in" | "out";

function employeeLabel(employee: Employee) {
  return `${employee.employee_code} · ${employee.name} (${employee.department})`;
}

function itemLabel(item: Item) {
  return `${item.item_code} · ${item.item_name}`;
}

export default function OperationsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [warehouseMode, setWarehouseMode] = useState<WarehouseMode>("whin");
  const [warehouseDepartment, setWarehouseDepartment] = useState<Department>("조립");
  const [warehouseEmployeeId, setWarehouseEmployeeId] = useState("");
  const [warehouseItemId, setWarehouseItemId] = useState("");
  const [warehouseQty, setWarehouseQty] = useState("1");
  const [warehouseRef, setWarehouseRef] = useState("");
  const [warehouseNote, setWarehouseNote] = useState("");

  const [deptDepartment, setDeptDepartment] = useState<Department>("조립");
  const [deptMode, setDeptMode] = useState<DepartmentMode>("in");
  const [deptEmployeeId, setDeptEmployeeId] = useState("");
  const [deptItemId, setDeptItemId] = useState("");
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

  const filteredEmployees = useMemo(
    () => employees.filter((employee) => employee.department === warehouseDepartment),
    [employees, warehouseDepartment],
  );

  const deptEmployees = useMemo(
    () => employees.filter((employee) => employee.department === deptDepartment),
    [employees, deptDepartment],
  );

  const selectedDeptPackage = useMemo(
    () => packages.find((pkg) => pkg.package_id === deptPackageId) ?? null,
    [deptPackageId, packages],
  );

  const runWarehouseAction = async () => {
    try {
      setError(null);
      setMessage(null);
      const qty = Number(warehouseQty);
      const employee = employees.find((row) => row.employee_id === warehouseEmployeeId);
      const operator = employee ? `${employee.employee_code} ${employee.name}` : undefined;

      if (!warehouseItemId || !qty || qty <= 0) {
        throw new Error("품목과 수량을 정확히 선택해 주세요.");
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
              ? `[창고 입고] ${warehouseDepartment} · ${warehouseNote}`.trim()
              : `[부서 반납] ${warehouseDepartment} → 창고 · ${warehouseNote}`.trim(),
        });
      } else {
        await api.shipInventory({
          item_id: warehouseItemId,
          quantity: qty,
          reference_no: warehouseRef || undefined,
          produced_by: operator,
          location: warehouseDepartment,
          notes: `[창고 출고] 창고 → ${warehouseDepartment} · ${warehouseNote}`.trim(),
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

      if (!qty || qty <= 0) {
        throw new Error("수량을 정확히 입력해 주세요.");
      }

      if (deptDepartment === "출하" && deptMode === "out" && deptPackageId) {
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
            notes: `[부서 입고] ${deptDepartment} · ${deptNote}`.trim(),
          });
        } else {
          await api.shipInventory({
            item_id: deptItemId,
            quantity: qty,
            reference_no: deptRef || undefined,
            produced_by: operator,
            location: deptDepartment,
            notes: `[부서 출고] ${deptDepartment} · ${deptNote}`.trim(),
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
            Operations
          </p>
          <h2 className="mt-3 text-4xl font-black tracking-tight">입출고 운영 화면</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            기존 재고관리앱의 창고 입출고, 부서 입출고, 직원 선택, 출하 패키지 흐름을 현재 ERP 구조에 맞춰 재구성했습니다.
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
                <p className="text-sm text-slate-500">창고 기준 이동과 반납을 처리합니다.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              <select value={warehouseMode} onChange={(event) => setWarehouseMode(event.target.value as WarehouseMode)} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
                <option value="whin">창고 입고</option>
                <option value="wh2d">창고 → 부서 출고</option>
                <option value="d2wh">부서 → 창고 반납</option>
              </select>
              <select value={warehouseDepartment} onChange={(event) => setWarehouseDepartment(event.target.value as Department)} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
                {DEPARTMENTS.map((department) => (
                  <option key={department} value={department}>{department}</option>
                ))}
              </select>
              <select value={warehouseEmployeeId} onChange={(event) => setWarehouseEmployeeId(event.target.value)} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
                <option value="">직원 선택</option>
                {filteredEmployees.map((employee) => (
                  <option key={employee.employee_id} value={employee.employee_id}>{employeeLabel(employee)}</option>
                ))}
              </select>
              <select value={warehouseItemId} onChange={(event) => setWarehouseItemId(event.target.value)} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
                <option value="">품목 선택</option>
                {items.map((item) => (
                  <option key={item.item_id} value={item.item_id}>{itemLabel(item)}</option>
                ))}
              </select>
              <input value={warehouseQty} onChange={(event) => setWarehouseQty(event.target.value)} placeholder="수량" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
              <input value={warehouseRef} onChange={(event) => setWarehouseRef(event.target.value)} placeholder="참조 번호" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
              <textarea value={warehouseNote} onChange={(event) => setWarehouseNote(event.target.value)} placeholder="메모" className="min-h-[96px] rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
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
                <p className="text-sm text-slate-500">직원 선택과 출하 패키지 처리를 포함합니다.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              <select value={deptDepartment} onChange={(event) => setDeptDepartment(event.target.value as Department)} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
                {DEPARTMENTS.map((department) => (
                  <option key={department} value={department}>{department}</option>
                ))}
              </select>
              <select value={deptMode} onChange={(event) => setDeptMode(event.target.value as DepartmentMode)} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
                <option value="in">부서 입고</option>
                <option value="out">부서 출고</option>
              </select>
              <select value={deptEmployeeId} onChange={(event) => setDeptEmployeeId(event.target.value)} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
                <option value="">직원 선택</option>
                {deptEmployees.map((employee) => (
                  <option key={employee.employee_id} value={employee.employee_id}>{employeeLabel(employee)}</option>
                ))}
              </select>

              {deptDepartment === "출하" && deptMode === "out" ? (
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
                <select value={deptItemId} onChange={(event) => setDeptItemId(event.target.value)} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
                  <option value="">품목 선택</option>
                  {items.map((item) => (
                    <option key={item.item_id} value={item.item_id}>{itemLabel(item)}</option>
                  ))}
                </select>
              )}

              <input value={deptQty} onChange={(event) => setDeptQty(event.target.value)} placeholder="수량" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
              <input value={deptRef} onChange={(event) => setDeptRef(event.target.value)} placeholder="참조 번호" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
              <textarea value={deptNote} onChange={(event) => setDeptNote(event.target.value)} placeholder="메모" className="min-h-[96px] rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
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
