"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type Department, type Employee, type Item, type ShipPackage } from "@/lib/api";
import { BottomSheet } from "./BottomSheet";
import type { ToastState } from "./Toast";

const DEPARTMENTS: Department[] = [
  "조립", "고압", "진공", "튜닝", "튜브", "AS", "연구", "영업", "출하", "기타",
];

export function DeptIOTab({ showToast }: { showToast: (t: ToastState) => void }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [loading, setLoading] = useState(true);

  const [dept, setDept] = useState<Department>("조립");
  const [mode, setMode] = useState<"in" | "out">("out");
  const [employeeId, setEmployeeId] = useState("");
  const [usePackage, setUsePackage] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [itemId, setItemId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [qty, setQty] = useState("1");
  const [refNo, setRefNo] = useState("");
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.getEmployees({ activeOnly: true }),
      api.getItems({ limit: 2000 }),
      api.getShipPackages(),
    ]).then(([emps, its, pkgs]) => {
      setEmployees(emps);
      setItems(its);
      setPackages(pkgs);
      setLoading(false);
    });
  }, []);

  const deptEmployees = useMemo(
    () => employees.filter((e) => e.department === dept),
    [employees, dept],
  );

  const filteredItems = useMemo(() => {
    const kw = itemSearch.trim().toLowerCase();
    if (!kw) return items.slice(0, 50);
    return items
      .filter(
        (i) =>
          i.item_name.toLowerCase().includes(kw) ||
          i.item_code.toLowerCase().includes(kw) ||
          (i.barcode ?? "").toLowerCase().includes(kw),
      )
      .slice(0, 50);
  }, [items, itemSearch]);

  const selectedEmployee = employees.find((e) => e.employee_id === employeeId);
  const selectedItem = items.find((i) => i.item_id === itemId);
  const selectedPackage = packages.find((p) => p.package_id === packageId);

  const resetForm = () => {
    setItemId(""); setItemSearch(""); setPackageId("");
    setQty("1"); setRefNo(""); setNote(""); setFormError(null);
  };

  const handleSubmit = () => {
    if (!employeeId) { setFormError("직원을 선택해 주세요."); return; }
    if (usePackage && !packageId) { setFormError("출하 패키지를 선택해 주세요."); return; }
    if (!usePackage && !itemId) { setFormError("품목을 선택해 주세요."); return; }
    if (!Number(qty) || Number(qty) <= 0) { setFormError("수량을 확인해 주세요."); return; }
    setFormError(null);
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    if (!selectedEmployee) return;
    try {
      setSubmitting(true);
      const producedBy = `${selectedEmployee.name} (${selectedEmployee.department})`;

      if (usePackage && packageId) {
        await api.shipPackage({
          package_id: packageId,
          quantity: Number(qty),
          reference_no: refNo || undefined,
          produced_by: producedBy,
          notes: note || undefined,
        });
        showToast({ message: `패키지 출고 완료: ${selectedPackage?.name ?? ""}`, type: "success" });
      } else {
        const payload = {
          item_id: itemId,
          quantity: Number(qty),
          reference_no: refNo || undefined,
          produced_by: producedBy,
          notes: note || undefined,
        };
        if (mode === "in") {
          await api.receiveInventory(payload);
          showToast({ message: `입고 완료: ${selectedItem?.item_name ?? ""}`, type: "success" });
        } else {
          await api.shipInventory(payload);
          showToast({ message: `출고 완료: ${selectedItem?.item_name ?? ""}`, type: "success" });
        }
      }
      setConfirmOpen(false);
      resetForm();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "처리 실패";
      setFormError(msg);
      setConfirmOpen(false);
      showToast({ message: msg, type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="px-4 py-6 text-sm text-slate-500">데이터 로딩 중...</p>;
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      {/* Dept selector */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-400">부서</label>
        <div className="flex flex-wrap gap-2">
          {DEPARTMENTS.map((d) => (
            <button
              key={d}
              onClick={() => { setDept(d); setEmployeeId(""); }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                dept === d
                  ? "border-blue-500 bg-blue-600 text-white"
                  : "border-slate-700 text-slate-400"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Mode */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-700 bg-slate-800/40 p-1">
        <button
          onClick={() => { setMode("in"); setUsePackage(false); resetForm(); }}
          className={`rounded-xl py-2 text-xs font-semibold ${mode === "in" ? "bg-emerald-600 text-white" : "text-slate-400"}`}
        >
          부서 입고
        </button>
        <button
          onClick={() => { setMode("out"); resetForm(); }}
          className={`rounded-xl py-2 text-xs font-semibold ${mode === "out" ? "bg-red-600 text-white" : "text-slate-400"}`}
        >
          부서 출고
        </button>
      </div>

      {/* Employee */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-400">
          담당 직원 <span className="text-red-400">*</span>
        </label>
        <select
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none"
        >
          <option value="">-- 직원 선택 --</option>
          {deptEmployees.length > 0 ? (
            deptEmployees.map((e) => (
              <option key={e.employee_id} value={e.employee_id}>{e.name}</option>
            ))
          ) : (
            employees.map((e) => (
              <option key={e.employee_id} value={e.employee_id}>
                {e.name} ({e.department})
              </option>
            ))
          )}
        </select>
      </div>

      {/* Package toggle (출고 mode only) */}
      {mode === "out" && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setUsePackage(false); resetForm(); }}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${!usePackage ? "border-blue-500 bg-blue-600 text-white" : "border-slate-700 text-slate-400"}`}
          >
            개별 품목
          </button>
          <button
            onClick={() => { setUsePackage(true); resetForm(); }}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${usePackage ? "border-purple-500 bg-purple-600 text-white" : "border-slate-700 text-slate-400"}`}
          >
            출하 패키지
          </button>
        </div>
      )}

      {/* Package select */}
      {usePackage ? (
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-400">
            출하 패키지 <span className="text-red-400">*</span>
          </label>
          <select
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none"
          >
            <option value="">-- 패키지 선택 --</option>
            {packages.map((p) => (
              <option key={p.package_id} value={p.package_id}>
                {p.package_code} · {p.name} ({p.items.length}종)
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-400">
            품목 <span className="text-red-400">*</span>
          </label>
          <input
            value={itemSearch}
            onChange={(e) => { setItemSearch(e.target.value); setItemId(""); }}
            placeholder="품목명, 코드, 바코드 검색"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          {itemSearch && !itemId && (
            <div className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-lg">
              {filteredItems.map((item) => (
                <button
                  key={item.item_id}
                  onClick={() => { setItemId(item.item_id); setItemSearch(`${item.item_code} · ${item.item_name}`); }}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-sm hover:bg-slate-800"
                >
                  <span className="text-slate-200">{item.item_name}</span>
                  <span className="font-mono text-xs text-cyan-300">
                    {Number(item.quantity).toLocaleString()} {item.unit}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quantity */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-400">수량</label>
        <div className="flex items-center gap-2">
          <button onClick={() => setQty((q) => String(Math.max(1, Number(q) - 1)))}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-slate-300">−</button>
          <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-center font-mono text-lg text-slate-100 outline-none" />
          <button onClick={() => setQty((q) => String(Number(q) + 1))}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-slate-300">+</button>
        </div>
      </div>

      <div className="space-y-2">
        <input value={refNo} onChange={(e) => setRefNo(e.target.value)}
          placeholder="참조번호 (선택)"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500" />
        <input value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="메모 (선택)"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500" />
      </div>

      {formError && (
        <p className="rounded-xl border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
          {formError}
        </p>
      )}

      <button onClick={handleSubmit}
        className="rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-500">
        {mode === "in" ? "입고" : usePackage ? "패키지 출고" : "출고"} 처리
      </button>

      {/* Confirm */}
      <BottomSheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title="처리 확인">
        <div className="space-y-3 px-5 pb-6 pt-3">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">부서</dt><dd className="text-slate-200">{dept}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">직원</dt><dd className="text-slate-200">{selectedEmployee?.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">품목</dt>
              <dd className="text-right text-slate-200">
                {usePackage ? selectedPackage?.name : selectedItem?.item_name}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">수량</dt>
              <dd className="font-mono text-cyan-300">{Number(qty).toLocaleString()}</dd>
            </div>
          </dl>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setConfirmOpen(false)}
              className="rounded-xl border border-slate-700 py-3 text-sm text-slate-300">취소</button>
            <button onClick={handleConfirm} disabled={submitting}
              className="rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-50">
              {submitting ? "처리 중..." : "확인"}
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
