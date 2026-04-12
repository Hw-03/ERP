"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type Employee, type Item } from "@/lib/api";
import { BottomSheet } from "./BottomSheet";
import type { ToastState } from "./Toast";

type WMode = "whin" | "wh2d" | "d2wh";

const MODE_LABELS: Record<WMode, string> = {
  whin: "창고 입고",
  wh2d: "창고→부서",
  d2wh: "부서→창고",
};

export function WarehouseIOTab({ showToast }: { showToast: (t: ToastState) => void }) {
  const [mode, setMode] = useState<WMode>("whin");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const [employeeId, setEmployeeId] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("1");
  const [refNo, setRefNo] = useState("");
  const [note, setNote] = useState("");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getEmployees({ activeOnly: true }), api.getItems({ limit: 2000 })]).then(
      ([emps, its]) => {
        setEmployees(emps);
        setItems(its);
        setLoading(false);
      },
    );
  }, []);

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

  const resetForm = () => {
    setItemId("");
    setItemSearch("");
    setQty("1");
    setRefNo("");
    setNote("");
    setFormError(null);
  };

  const handleSubmit = () => {
    if (!employeeId) { setFormError("직원을 선택해 주세요."); return; }
    if (!itemId) { setFormError("품목을 선택해 주세요."); return; }
    if (!Number(qty) || Number(qty) <= 0) { setFormError("수량을 확인해 주세요."); return; }
    setFormError(null);
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    if (!selectedEmployee || !itemId) return;
    try {
      setSubmitting(true);
      const producedBy = `${selectedEmployee.name} (${selectedEmployee.department})`;
      const payload = {
        item_id: itemId,
        quantity: Number(qty),
        reference_no: refNo || undefined,
        produced_by: producedBy,
        notes: note || undefined,
      };

      if (mode === "whin") {
        await api.receiveInventory(payload);
      } else if (mode === "wh2d") {
        await api.shipInventory(payload);
      } else {
        await api.receiveInventory(payload);
      }

      setConfirmOpen(false);
      resetForm();
      showToast({
        message: `${MODE_LABELS[mode]} 처리 완료: ${selectedItem?.item_name ?? ""} ${qty}${selectedItem?.unit ?? ""}`,
        type: "success",
      });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "처리 실패");
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="px-4 py-6 text-sm text-slate-500">데이터 로딩 중...</p>;
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      {/* Mode tabs */}
      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-700 bg-slate-800/40 p-1">
        {(["whin", "wh2d", "d2wh"] as WMode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); resetForm(); }}
            className={`rounded-xl py-2 text-xs font-semibold transition ${
              mode === m ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Employee select */}
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
          {employees.map((emp) => (
            <option key={emp.employee_id} value={emp.employee_id}>
              {emp.name} ({emp.department})
            </option>
          ))}
        </select>
      </div>

      {/* Item search */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-400">
          품목 검색 <span className="text-red-400">*</span>
        </label>
        <input
          value={itemSearch}
          onChange={(e) => { setItemSearch(e.target.value); setItemId(""); }}
          placeholder="품목명, 코드, 바코드 검색"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500"
        />
        {itemSearch && !itemId && (
          <div className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-lg">
            {filteredItems.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-500">검색 결과 없음</p>
            ) : (
              filteredItems.map((item) => (
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
              ))
            )}
          </div>
        )}
        {selectedItem && (
          <p className="mt-1 text-xs text-slate-500">
            현재고: <span className="font-mono text-cyan-300">{Number(selectedItem.quantity).toLocaleString()} {selectedItem.unit}</span>
          </p>
        )}
      </div>

      {/* Quantity */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-400">수량</label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setQty((q) => String(Math.max(1, Number(q) - 1)))}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300"
          >
            −
          </button>
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="numeric"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-center font-mono text-lg text-slate-100 outline-none"
          />
          <button
            onClick={() => setQty((q) => String(Number(q) + 1))}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300"
          >
            +
          </button>
        </div>
      </div>

      {/* Reference & notes */}
      <div className="space-y-2">
        <input
          value={refNo}
          onChange={(e) => setRefNo(e.target.value)}
          placeholder="참조번호 (선택)"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="메모 (선택)"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500"
        />
      </div>

      {formError && (
        <p className="rounded-xl border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
          {formError}
        </p>
      )}

      <button
        onClick={handleSubmit}
        className="rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
      >
        {MODE_LABELS[mode]} 처리
      </button>

      {/* Confirm sheet */}
      <BottomSheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title="처리 확인">
        <div className="space-y-3 px-5 pb-6 pt-3">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">유형</dt>
              <dd className="font-semibold text-blue-300">{MODE_LABELS[mode]}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">직원</dt>
              <dd className="text-slate-200">{selectedEmployee?.name} ({selectedEmployee?.department})</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">품목</dt>
              <dd className="text-right text-slate-200">{selectedItem?.item_name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">수량</dt>
              <dd className="font-mono text-cyan-300">{Number(qty).toLocaleString()} {selectedItem?.unit}</dd>
            </div>
            {refNo && (
              <div className="flex justify-between">
                <dt className="text-slate-400">참조번호</dt>
                <dd className="font-mono text-slate-300">{refNo}</dd>
              </div>
            )}
          </dl>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setConfirmOpen(false)}
              className="rounded-xl border border-slate-700 py-3 text-sm text-slate-300"
            >
              취소
            </button>
            <button
              onClick={handleConfirm}
              disabled={submitting}
              className="rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "처리 중..." : "확인"}
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
