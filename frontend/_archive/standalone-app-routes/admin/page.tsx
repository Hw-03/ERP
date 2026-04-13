"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, KeyRound, Lock, Plus, Trash2, Users } from "lucide-react";

import AppHeader from "@/components/AppHeader";
import {
  api,
  type Department,
  type Employee,
  type EmployeeLevel,
  type Item,
  type ShipPackage,
} from "@/lib/api";

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

const LEVELS: EmployeeLevel[] = ["staff", "manager", "admin"];

export default function AdminPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinForm, setPinForm] = useState({
    current_pin: "",
    new_pin: "",
    confirm_pin: "",
  });

  const [employeeForm, setEmployeeForm] = useState({
    employee_code: "",
    name: "",
    role: "",
    phone: "",
    department: "조립" as Department,
    level: "staff" as EmployeeLevel,
  });

  const [packageForm, setPackageForm] = useState({
    package_code: "",
    name: "",
    notes: "",
  });
  const [packageSearch, setPackageSearch] = useState("");
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedItemQty, setSelectedItemQty] = useState("1");

  const loadAll = async () => {
    const [employeeRows, packageRows, itemRows] = await Promise.all([
      api.getEmployees({ activeOnly: false }),
      api.getShipPackages(),
      api.getItems({ limit: 2000 }),
    ]);
    setEmployees(employeeRows);
    setPackages(packageRows);
    setItems(itemRows);
  };

  useEffect(() => {
    if (!unlocked) return;
    loadAll().catch((err) => {
      setError(err instanceof Error ? err.message : "관리 데이터를 불러오지 못했습니다.");
    });
  }, [unlocked]);

  const selectedPackage = useMemo(
    () => packages.find((pkg) => pkg.package_id === selectedPackageId) ?? null,
    [packages, selectedPackageId],
  );

  const filteredItems = useMemo(() => {
    const keyword = packageSearch.trim().toLowerCase();
    return items.filter((item) =>
      !keyword ? true : [item.item_name, item.item_code].join(" ").toLowerCase().includes(keyword),
    );
  }, [items, packageSearch]);

  const handleUnlock = async () => {
    try {
      setAuthLoading(true);
      setAuthError(null);
      await api.verifyAdminPin(pinInput);
      setUnlocked(true);
      setPinInput("");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "관리자 인증에 실패했습니다.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handlePinChange = async () => {
    try {
      setError(null);
      if (pinForm.new_pin !== pinForm.confirm_pin) {
        throw new Error("새 비밀번호와 확인 값이 일치하지 않습니다.");
      }
      const response = await api.updateAdminPin({
        current_pin: pinForm.current_pin,
        new_pin: pinForm.new_pin,
      });
      setMessage(response.message);
      setPinForm({ current_pin: "", new_pin: "", confirm_pin: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "비밀번호 변경에 실패했습니다.");
    }
  };

  const handleEmployeeCreate = async () => {
    try {
      setError(null);
      await api.createEmployee({
        ...employeeForm,
        display_order: employees.length + 1,
        is_active: true,
      });
      setMessage("직원을 추가했습니다.");
      setEmployeeForm({
        employee_code: "",
        name: "",
        role: "",
        phone: "",
        department: "조립",
        level: "staff",
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "직원 추가에 실패했습니다.");
    }
  };

  const handleEmployeeToggle = async (employee: Employee) => {
    try {
      setError(null);
      await api.updateEmployee(employee.employee_id, { is_active: !employee.is_active });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "직원 상태 변경에 실패했습니다.");
    }
  };

  const handlePackageCreate = async () => {
    try {
      setError(null);
      const newPackage = await api.createShipPackage(packageForm);
      setMessage("출하 패키지를 생성했습니다.");
      setPackageForm({ package_code: "", name: "", notes: "" });
      await loadAll();
      setSelectedPackageId(newPackage.package_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "패키지 생성에 실패했습니다.");
    }
  };

  const handlePackageAddItem = async () => {
    if (!selectedPackageId || !selectedItemId) {
      setError("패키지와 품목을 선택해 주세요.");
      return;
    }
    try {
      setError(null);
      await api.addShipPackageItem(selectedPackageId, {
        item_id: selectedItemId,
        quantity: Number(selectedItemQty),
      });
      setMessage("패키지 구성품을 추가했습니다.");
      setSelectedItemId("");
      setSelectedItemQty("1");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "패키지 구성품 추가에 실패했습니다.");
    }
  };

  const handlePackageDelete = async (packageId: string) => {
    try {
      setError(null);
      await api.deleteShipPackage(packageId);
      setMessage("패키지를 삭제했습니다.");
      if (selectedPackageId === packageId) setSelectedPackageId("");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "패키지 삭제에 실패했습니다.");
    }
  };

  const handlePackageItemDelete = async (packageItemId: string) => {
    if (!selectedPackageId) return;
    try {
      setError(null);
      await api.deleteShipPackageItem(selectedPackageId, packageItemId);
      setMessage("패키지 구성품을 삭제했습니다.");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "구성품 삭제에 실패했습니다.");
    }
  };

  const handleExport = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <AppHeader />
        <main className="mx-auto flex min-h-[calc(100vh-96px)] max-w-screen-md items-center px-6 py-10">
          <section className="w-full rounded-[28px] border border-slate-800 bg-slate-900/70 p-8 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-blue-500/15 p-3 text-blue-300">
                <Lock className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Admin Access
                </p>
                <h2 className="mt-1 text-3xl font-black tracking-tight">관리자 인증</h2>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-400">
              기존 재고관리앱의 관리자 비밀번호 흐름을 현재 ERP에 이식했습니다. 기본 비밀번호는
              `0000`입니다.
            </p>
            <div className="mt-6 flex gap-3">
              <input
                type="password"
                inputMode="numeric"
                value={pinInput}
                onChange={(event) => setPinInput(event.target.value)}
                placeholder="관리자 비밀번호"
                className="flex-1 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
              <button
                onClick={handleUnlock}
                disabled={authLoading}
                className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
              >
                {authLoading ? "확인 중..." : "인증"}
              </button>
            </div>
            {authError && (
              <div className="mt-4 rounded-2xl border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
                {authError}
              </div>
            )}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AppHeader />

      <main className="mx-auto max-w-screen-2xl px-6 py-8">
        <section className="rounded-[28px] border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Administration
          </p>
          <h2 className="mt-3 text-4xl font-black tracking-tight">관리 화면</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            직원 마스터, 출하 패키지, 관리자 비밀번호, CSV 내보내기를 한곳에서 관리합니다.
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

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
          <section className="space-y-6">
            <div className="rounded-[24px] border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-blue-500/15 p-2 text-blue-300">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-100">직원 관리</h3>
                  <p className="text-sm text-slate-500">입출고 화면에서 사용하는 직원 마스터입니다.</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <input value={employeeForm.employee_code} onChange={(event) => setEmployeeForm((current) => ({ ...current, employee_code: event.target.value }))} placeholder="직원 코드" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
                <input value={employeeForm.name} onChange={(event) => setEmployeeForm((current) => ({ ...current, name: event.target.value }))} placeholder="이름" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
                <input value={employeeForm.role} onChange={(event) => setEmployeeForm((current) => ({ ...current, role: event.target.value }))} placeholder="직책" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
                <input value={employeeForm.phone} onChange={(event) => setEmployeeForm((current) => ({ ...current, phone: event.target.value }))} placeholder="전화번호" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
                <select value={employeeForm.department} onChange={(event) => setEmployeeForm((current) => ({ ...current, department: event.target.value as Department }))} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
                  {DEPARTMENTS.map((department) => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
                <select value={employeeForm.level} onChange={(event) => setEmployeeForm((current) => ({ ...current, level: event.target.value as EmployeeLevel }))} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
                  {LEVELS.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>

              <button onClick={handleEmployeeCreate} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500">
                <Plus className="h-4 w-4" />
                직원 추가
              </button>

              <div className="mt-5 space-y-3">
                {employees.map((employee) => (
                  <div key={employee.employee_id} className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                    <div>
                      <p className="font-medium text-slate-100">{employee.name} · {employee.role}</p>
                      <p className="mt-1 text-xs text-slate-500">{employee.employee_code} · {employee.department} · {employee.level}</p>
                    </div>
                    <button onClick={() => handleEmployeeToggle(employee)} className={`rounded-full px-3 py-1.5 text-xs ${employee.is_active ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>
                      {employee.is_active ? "활성" : "비활성"}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-amber-500/15 p-2 text-amber-300">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-100">관리자 비밀번호</h3>
                  <p className="text-sm text-slate-500">기본값은 0000이며, 여기서 변경할 수 있습니다.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3">
                <input type="password" value={pinForm.current_pin} onChange={(event) => setPinForm((current) => ({ ...current, current_pin: event.target.value }))} placeholder="현재 비밀번호" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
                <input type="password" value={pinForm.new_pin} onChange={(event) => setPinForm((current) => ({ ...current, new_pin: event.target.value }))} placeholder="새 비밀번호" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
                <input type="password" value={pinForm.confirm_pin} onChange={(event) => setPinForm((current) => ({ ...current, confirm_pin: event.target.value }))} placeholder="새 비밀번호 확인" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
                <button onClick={handlePinChange} className="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-400">
                  비밀번호 변경
                </button>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-500/15 p-2 text-emerald-300">
                  <Download className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-100">데이터 내보내기</h3>
                  <p className="text-sm text-slate-500">현재 DB 상태를 CSV로 내려받을 수 있습니다.</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button onClick={() => handleExport(api.getItemsExportUrl())} className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-500">
                  품목 재고 CSV
                </button>
                <button onClick={() => handleExport(api.getTransactionsExportUrl())} className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-600">
                  거래 이력 CSV
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-100">출하 패키지 관리</h3>

            <div className="mt-5 grid gap-3 md:grid-cols-[160px,1fr]">
              <input value={packageForm.package_code} onChange={(event) => setPackageForm((current) => ({ ...current, package_code: event.target.value }))} placeholder="패키지 코드" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
              <input value={packageForm.name} onChange={(event) => setPackageForm((current) => ({ ...current, name: event.target.value }))} placeholder="패키지 이름" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
              <textarea value={packageForm.notes} onChange={(event) => setPackageForm((current) => ({ ...current, notes: event.target.value }))} placeholder="메모" className="min-h-[88px] rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm md:col-span-2" />
            </div>

            <button onClick={handlePackageCreate} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-500">
              <Plus className="h-4 w-4" />
              패키지 생성
            </button>

            <div className="mt-5 grid gap-4 xl:grid-cols-[0.75fr,1.25fr]">
              <div className="space-y-3">
                {packages.map((pkg) => (
                  <div key={pkg.package_id} className={`rounded-2xl border px-4 py-3 ${selectedPackageId === pkg.package_id ? "border-blue-500 bg-blue-500/10" : "border-slate-800 bg-slate-950/60"}`}>
                    <button onClick={() => setSelectedPackageId(pkg.package_id)} className="w-full text-left">
                      <p className="font-medium text-slate-100">{pkg.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{pkg.package_code} · 구성품 {pkg.items.length}개</p>
                    </button>
                    <button onClick={() => handlePackageDelete(pkg.package_id)} className="mt-3 inline-flex items-center gap-1 rounded-full bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
                      <Trash2 className="h-3.5 w-3.5" />
                      삭제
                    </button>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                {selectedPackage ? (
                  <>
                    <p className="font-medium text-slate-100">{selectedPackage.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{selectedPackage.package_code}</p>

                    <div className="mt-4 grid gap-3 md:grid-cols-[1fr,120px,auto]">
                      <input value={packageSearch} onChange={(event) => setPackageSearch(event.target.value)} placeholder="품목 검색" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
                      <input value={selectedItemQty} onChange={(event) => setSelectedItemQty(event.target.value)} placeholder="수량" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm" />
                      <button onClick={handlePackageAddItem} className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500">
                        추가
                      </button>
                    </div>

                    <select value={selectedItemId} onChange={(event) => setSelectedItemId(event.target.value)} className="mt-3 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
                      <option value="">품목 선택</option>
                      {filteredItems.map((item) => (
                        <option key={item.item_id} value={item.item_id}>{item.item_code} · {item.item_name}</option>
                      ))}
                    </select>

                    <div className="mt-4 space-y-3">
                      {selectedPackage.items.map((pkgItem) => (
                        <div key={pkgItem.package_item_id} className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3">
                          <div>
                            <p className="font-medium text-slate-100">{pkgItem.item_name}</p>
                            <p className="mt-1 text-xs text-slate-500">{pkgItem.item_code} · {Number(pkgItem.quantity).toLocaleString()} {pkgItem.item_unit}</p>
                          </div>
                          <button onClick={() => handlePackageItemDelete(pkgItem.package_item_id)} className="rounded-xl p-2 text-red-300 transition hover:bg-red-500/10">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-[320px] items-center justify-center text-sm text-slate-500">
                    왼쪽에서 패키지를 선택해 주세요.
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
