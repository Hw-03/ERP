"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Minus,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  PackageSearch,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";

import AppHeader from "@/components/AppHeader";
import { api, type Department, type Employee, type Item, type ShipPackage, type TransactionLog } from "@/lib/api";

const DEPARTMENTS: Department[] = ["조립", "고압", "진공", "튜닝", "튜브", "AS", "연구", "영업", "출하", "기타"];

type OpMode = "wh_in" | "wh_out" | "wh2dept" | "dept2wh" | "dept_in" | "dept_pkg";

const OP_MODES: {
  key: OpMode;
  label: string;
  sub: string;
  icon: React.ReactNode;
  color: string;
  border: string;
  bg: string;
  btnBg: string;
}[] = [
  { key: "wh_in",    label: "창고 입고",   sub: "외부 → 창고",      icon: <PackagePlus  className="h-6 w-6" />, color: "text-emerald-300", border: "border-emerald-500/30", bg: "bg-emerald-500/10", btnBg: "bg-emerald-600 hover:bg-emerald-500" },
  { key: "wh_out",   label: "창고 출고",   sub: "창고 → 외부",      icon: <PackageMinus className="h-6 w-6" />, color: "text-red-300",     border: "border-red-500/30",     bg: "bg-red-500/10",     btnBg: "bg-red-600 hover:bg-red-500" },
  { key: "wh2dept",  label: "창고→부서",   sub: "창고 → 부서 이동",  icon: <ArrowRight   className="h-6 w-6" />, color: "text-blue-300",    border: "border-blue-500/30",    bg: "bg-blue-500/10",    btnBg: "bg-blue-600 hover:bg-blue-500" },
  { key: "dept2wh",  label: "부서→창고",   sub: "부서 → 창고 반납",  icon: <ArrowLeft    className="h-6 w-6" />, color: "text-slate-300",   border: "border-slate-500/30",   bg: "bg-slate-500/10",   btnBg: "bg-slate-600 hover:bg-slate-500" },
  { key: "dept_in",  label: "부서 입고",   sub: "공정 내부 입고",    icon: <Boxes        className="h-6 w-6" />, color: "text-purple-300",  border: "border-purple-500/30",  bg: "bg-purple-500/10",  btnBg: "bg-purple-600 hover:bg-purple-500" },
  { key: "dept_pkg", label: "패키지 출하", sub: "묶음 출하 처리",    icon: <PackageCheck className="h-6 w-6" />, color: "text-orange-300",  border: "border-orange-500/30",  bg: "bg-orange-500/10",  btnBg: "bg-orange-600 hover:bg-orange-500" },
];

const TX_TYPE_LABELS: Record<string, string> = {
  RECEIVE: "입고", PRODUCE: "생산입고", SHIP: "출고", ADJUST: "조정", BACKFLUSH: "자동차감",
};
const TX_TYPE_COLOR: Record<string, string> = {
  RECEIVE: "text-emerald-300", PRODUCE: "text-emerald-300", SHIP: "text-red-300",
  ADJUST: "text-amber-300", BACKFLUSH: "text-orange-300",
};

type ToastState = { message: string; type: "success" | "error" } | null;

export default function OperationsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems]         = useState<Item[]>([]);
  const [packages, setPackages]   = useState<ShipPackage[]>([]);
  const [recentTx, setRecentTx]   = useState<TransactionLog[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState<ToastState>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [opMode,        setOpMode]        = useState<OpMode>("wh_in");
  const [dept,          setDept]          = useState<Department>("조립");
  const [employeeId,    setEmployeeId]    = useState("");
  const [itemSearch,    setItemSearch]    = useState("");
  const [selectedItem,  setSelectedItem]  = useState<Item | null>(null);
  const [qty,           setQty]           = useState("1");
  const [ref,           setRef]           = useState("");
  const [note,          setNote]          = useState("");
  const [packageId,     setPackageId]     = useState("");

  const deferredSearch = useDeferredValue(itemSearch);

  useEffect(() => {
    Promise.all([
      api.getEmployees({ activeOnly: true }),
      api.getItems({ limit: 2000 }),
      api.getShipPackages(),
      api.getTransactions({ limit: 20 }),
    ])
      .then(([emps, its, pkgs, txs]) => {
        setEmployees(emps);
        setItems(its);
        setPackages(pkgs);
        setRecentTx(txs);
      })
      .catch(() => {/* non-fatal */})
      .finally(() => setLoading(false));
    return () => { if (toastRef.current) clearTimeout(toastRef.current); };
  }, []);

  useEffect(() => { setEmployeeId(""); }, [dept]);
  useEffect(() => { setSelectedItem(null); setItemSearch(""); setQty("1"); }, [opMode]);

  const deptEmployees = useMemo(
    () => employees.filter((e) => e.department === dept),
    [employees, dept],
  );

  const filteredItems = useMemo(() => {
    const kw = deferredSearch.trim().toLowerCase();
    if (!kw) return items.slice(0, 60);
    return items
      .filter((i) => [i.item_code, i.item_name, i.spec ?? ""].join(" ").toLowerCase().includes(kw))
      .slice(0, 60);
  }, [items, deferredSearch]);

  const selectedPackage = useMemo(
    () => packages.find((p) => p.package_id === packageId) ?? null,
    [packages, packageId],
  );

  const todayTx = useMemo(() => {
    const today = new Date().toDateString();
    return recentTx.filter((t) => new Date(t.created_at).toDateString() === today);
  }, [recentTx]);

  const expectedQty = useMemo(() => {
    if (!selectedItem) return null;
    const current = Number(selectedItem.quantity);
    const n = Number(qty) || 0;
    if (opMode === "wh_in" || opMode === "dept2wh" || opMode === "dept_in") return current + n;
    if (opMode === "wh_out" || opMode === "wh2dept") return current - n;
    return null;
  }, [selectedItem, qty, opMode]);

  const showToast = (message: string, type: "success" | "error") => {
    if (toastRef.current) clearTimeout(toastRef.current);
    setToast({ message, type });
    toastRef.current = setTimeout(() => setToast(null), 3000);
  };

  const bumpQty = (d: number) => setQty((v) => String(Math.max(1, (Number(v) || 0) + d)));

  const currentMeta = OP_MODES.find((m) => m.key === opMode)!;
  const isItemMode  = opMode !== "dept_pkg";

  const runOp = async () => {
    if (saving) return;
    const n = Number(qty);
    if (!n || n <= 0) { showToast("수량을 1 이상으로 입력해 주세요.", "error"); return; }
    if (isItemMode && !selectedItem) { showToast("품목을 선택해 주세요.", "error"); return; }
    if (!isItemMode && !packageId)   { showToast("패키지를 선택해 주세요.", "error"); return; }

    const employee = employees.find((e) => e.employee_id === employeeId);
    const operator = employee ? `${employee.employee_code} ${employee.name}` : undefined;

    try {
      setSaving(true);
      switch (opMode) {
        case "wh_in":
          await api.receiveInventory({ item_id: selectedItem!.item_id, quantity: n, reference_no: ref || undefined, produced_by: operator, location: "창고", notes: `[창고 입고] ${note}`.trim() });
          break;
        case "wh_out":
          await api.shipInventory({ item_id: selectedItem!.item_id, quantity: n, reference_no: ref || undefined, produced_by: operator, location: "창고", notes: `[창고 출고] 창고 → ${dept} ${note}`.trim() });
          break;
        case "wh2dept":
          await api.shipInventory({ item_id: selectedItem!.item_id, quantity: n, reference_no: ref || undefined, produced_by: operator, location: dept, notes: `[창고→부서] 창고 → ${dept} ${note}`.trim() });
          break;
        case "dept2wh":
          await api.receiveInventory({ item_id: selectedItem!.item_id, quantity: n, reference_no: ref || undefined, produced_by: operator, location: "창고", notes: `[부서 반납] ${dept} → 창고 ${note}`.trim() });
          break;
        case "dept_in":
          await api.receiveInventory({ item_id: selectedItem!.item_id, quantity: n, reference_no: ref || undefined, produced_by: operator, location: dept, notes: `[부서 입고] ${dept} ${note}`.trim() });
          break;
        case "dept_pkg":
          await api.shipPackage({ package_id: packageId, quantity: n, reference_no: ref || undefined, produced_by: operator, notes: note || undefined });
          break;
      }

      const freshTx = await api.getTransactions({ limit: 20 });
      setRecentTx(freshTx);

      if (selectedItem) {
        const fresh = await api.getItem(selectedItem.item_id);
        setItems((prev) => prev.map((i) => i.item_id === fresh.item_id ? fresh : i));
        setSelectedItem(fresh);
      }

      showToast(`${currentMeta.label} 처리가 완료되었습니다.`, "success");
      setQty("1"); setRef(""); setNote("");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AppHeader />

      <main className="mx-auto max-w-screen-2xl px-6 pb-8">
        <div className="grid h-[calc(100vh-64px)] grid-cols-[minmax(480px,1.3fr)_minmax(360px,1fr)] gap-4 pt-4">

          {/* ── LEFT: 작업 설정 패널 ── */}
          <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/70">
            <div className="border-b border-slate-800 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Operations</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-50">입출고 처리</h2>
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">

              {/* STEP 1 — 작업 유형 */}
              <div>
                <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">1</span>
                  작업 유형 선택
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {OP_MODES.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setOpMode(m.key)}
                      className={`flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-center transition ${
                        opMode === m.key
                          ? `${m.border} ${m.bg} ${m.color}`
                          : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                      }`}
                    >
                      <span className={opMode === m.key ? m.color : "text-slate-600"}>{m.icon}</span>
                      <span className="text-xs font-semibold leading-tight">{m.label}</span>
                      <span className="text-[10px] text-slate-500">{m.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* STEP 2 — 부서 / 직원 or 패키지 */}
              <div>
                <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">2</span>
                  {opMode === "dept_pkg" ? "패키지 선택" : "부서 · 담당자 선택"}
                </p>

                {opMode === "dept_pkg" ? (
                  <div className="space-y-3">
                    <select
                      value={packageId}
                      onChange={(e) => setPackageId(e.target.value)}
                      className="w-full rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-blue-500"
                    >
                      <option value="">출하 패키지를 선택하세요</option>
                      {packages.map((p) => (
                        <option key={p.package_id} value={p.package_id}>{p.package_code} · {p.name}</option>
                      ))}
                    </select>
                    {selectedPackage && (
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                        <p className="mb-2 text-xs font-semibold text-slate-400">패키지 구성품</p>
                        <div className="space-y-1.5">
                          {selectedPackage.items.map((pi) => (
                            <div key={pi.package_item_id} className="flex justify-between text-sm">
                              <span className="text-slate-300">{pi.item_name}</span>
                              <span className="font-mono text-slate-400">×{Number(pi.quantity).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {DEPARTMENTS.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDept(d)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            dept === d
                              ? "border-blue-400 bg-blue-500/15 text-blue-200"
                              : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    <select
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      className="w-full rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-blue-500"
                    >
                      <option value="">담당자 선택 (선택 사항)</option>
                      {deptEmployees.map((e) => (
                        <option key={e.employee_id} value={e.employee_id}>{e.employee_code} · {e.name}</option>
                      ))}
                      {deptEmployees.length === 0 && <option disabled>이 부서에 등록된 직원이 없습니다</option>}
                    </select>
                  </div>
                )}
              </div>

              {/* STEP 3 — 품목 검색 (item mode only) */}
              {isItemMode && (
                <div>
                  <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">3</span>
                    품목 검색 · 선택
                  </p>
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      value={itemSearch}
                      onChange={(e) => { setItemSearch(e.target.value); setSelectedItem(null); }}
                      placeholder="코드, 품목명, 사양으로 검색..."
                      className="w-full rounded-2xl border border-slate-800 bg-slate-900/80 py-3 pl-10 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-blue-500"
                    />
                  </label>
                  <div className="mt-2 max-h-[220px] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/60">
                    {loading ? (
                      <p className="px-4 py-3 text-sm text-slate-500">로딩 중...</p>
                    ) : filteredItems.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-slate-500">검색 결과가 없습니다.</p>
                    ) : (
                      filteredItems.map((item) => {
                        const itemQty = Number(item.quantity);
                        const isSelected = selectedItem?.item_id === item.item_id;
                        return (
                          <button
                            key={item.item_id}
                            type="button"
                            onClick={() => setSelectedItem(item)}
                            className={`flex w-full items-center justify-between border-b border-slate-800/60 px-4 py-2.5 text-left transition last:border-0 ${
                              isSelected
                                ? "border-l-2 border-l-blue-500 bg-blue-900/30"
                                : "border-l-2 border-l-transparent hover:bg-slate-800/60"
                            }`}
                          >
                            <div className="min-w-0">
                              <span className="font-mono text-xs text-blue-300">{item.item_code}</span>
                              <span className="ml-2 text-sm text-slate-200">{item.item_name}</span>
                            </div>
                            <span className={`ml-3 shrink-0 font-mono text-sm ${itemQty <= 0 ? "text-red-300" : "text-slate-300"}`}>
                              {itemQty.toLocaleString()} <span className="text-xs text-slate-500">{item.unit || "EA"}</span>
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* STEP 4 — 수량 + 메모 */}
              <div>
                <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
                    {isItemMode ? "4" : "3"}
                  </span>
                  수량 · 메모
                </p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => bumpQty(-1)} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-slate-200 transition hover:border-slate-500">
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      className="h-14 flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-4 text-center text-2xl font-semibold text-slate-50 outline-none transition focus:border-blue-500"
                      inputMode="numeric"
                    />
                    <button type="button" onClick={() => bumpQty(1)} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-slate-200 transition hover:border-slate-500">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <input
                    value={ref}
                    onChange={(e) => setRef(e.target.value)}
                    placeholder="참조 번호 (선택)"
                    className="w-full rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-blue-500"
                  />
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="메모 (선택)"
                    className="w-full rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ── RIGHT: 실행 확인 패널 ── */}
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/70">
            <div className="border-b border-slate-800 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Confirm &amp; Execute</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-50">실행 확인</h2>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {/* Empty state */}
              {isItemMode && !selectedItem && (
                <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-800/60 text-slate-600">
                    <PackageSearch className="h-9 w-9" />
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-slate-300">품목을 선택해 주세요</h3>
                  <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500">
                    STEP 3에서 품목을 검색 후 클릭하면 상세 정보와 처리 후 예상 재고가 표시됩니다.
                  </p>
                </div>
              )}

              {/* Confirm content */}
              {(selectedItem || !isItemMode) && (
                <div className="space-y-4 px-5 py-5">
                  {/* Item info card */}
                  {selectedItem && (
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4">
                      <p className="font-mono text-xs font-semibold text-blue-300">{selectedItem.item_code}</p>
                      <h3 className="mt-1 text-lg font-bold text-slate-50">{selectedItem.item_name}</h3>
                      {selectedItem.spec && <p className="mt-1 text-sm text-slate-400">{selectedItem.spec}</p>}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">현재고</p>
                          <p className="mt-1 font-mono text-xl font-semibold text-slate-50">
                            {Number(selectedItem.quantity).toLocaleString()}
                            <span className="ml-1 text-sm text-slate-500">{selectedItem.unit || "EA"}</span>
                          </p>
                        </div>
                        <div className={`rounded-xl border px-3 py-2 ${
                          expectedQty !== null && expectedQty < 0
                            ? "border-red-500/30 bg-red-500/10"
                            : "border-slate-800 bg-slate-950/60"
                        }`}>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">처리 후 예상</p>
                          <p className={`mt-1 font-mono text-xl font-semibold ${
                            expectedQty !== null && expectedQty < 0 ? "text-red-300" : "text-slate-50"
                          }`}>
                            {expectedQty !== null ? expectedQty.toLocaleString() : "—"}
                            <span className="ml-1 text-sm text-slate-500">{selectedItem.unit || "EA"}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Op type badge */}
                  <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${currentMeta.border} ${currentMeta.bg}`}>
                    <span className={currentMeta.color}>{currentMeta.icon}</span>
                    <div>
                      <p className={`text-sm font-bold ${currentMeta.color}`}>{currentMeta.label}</p>
                      <p className="text-xs text-slate-400">{currentMeta.sub}</p>
                    </div>
                  </div>

                  {/* Execution summary */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm">
                    <p className="font-semibold text-slate-100">실행 요약</p>
                    <div className="mt-2 space-y-1 text-slate-400">
                      <p>작업: <span className="text-slate-200">{currentMeta.label}</span></p>
                      {selectedItem && <p>품목: <span className="text-slate-200">{selectedItem.item_name}</span></p>}
                      {!isItemMode && selectedPackage && <p>패키지: <span className="text-slate-200">{selectedPackage.name}</span></p>}
                      {opMode !== "wh_in" && opMode !== "wh_out" && <p>부서: <span className="text-slate-200">{dept}</span></p>}
                      <p>수량: <span className="font-mono text-slate-200">{Number(qty) || 0}</span></p>
                      {ref && <p>참조: <span className="text-slate-200">{ref}</span></p>}
                      {note && <p>메모: <span className="text-slate-200">{note}</span></p>}
                    </div>
                  </div>

                  {/* Execute button */}
                  <button
                    type="button"
                    onClick={() => void runOp()}
                    disabled={saving}
                    className={`w-full rounded-2xl px-4 py-4 text-base font-bold text-white transition disabled:opacity-50 ${currentMeta.btnBg}`}
                  >
                    {saving ? "처리 중..." : `${currentMeta.label} 실행`}
                  </button>
                </div>
              )}
            </div>

            {/* Today stats + recent tx */}
            <div className="border-t border-slate-800 px-5 py-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">오늘 처리 현황</p>
                <button
                  type="button"
                  onClick={() => void api.getTransactions({ limit: 20 }).then(setRecentTx)}
                  className="text-slate-600 hover:text-slate-400"
                  title="새로고침"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mb-3 flex gap-4 text-sm">
                <span className="text-emerald-300">입고 {todayTx.filter((t) => t.quantity_change > 0).length}건</span>
                <span className="text-red-300">출고 {todayTx.filter((t) => t.quantity_change < 0).length}건</span>
              </div>
              <div className="max-h-[180px] space-y-1.5 overflow-y-auto">
                {recentTx.slice(0, 8).map((tx) => (
                  <div key={tx.log_id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className={`shrink-0 font-semibold ${TX_TYPE_COLOR[tx.transaction_type] ?? "text-slate-300"}`}>
                        {TX_TYPE_LABELS[tx.transaction_type]}
                      </span>
                      <span className="truncate text-slate-400">{tx.item_name}</span>
                    </div>
                    <span className={`ml-2 shrink-0 font-mono ${tx.quantity_change >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                      {tx.quantity_change >= 0 ? "+" : ""}{Number(tx.quantity_change).toLocaleString()}
                    </span>
                  </div>
                ))}
                {recentTx.length === 0 && <p className="text-xs text-slate-600">최근 처리 내역이 없습니다.</p>}
              </div>
            </div>
          </aside>
        </div>
      </main>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className={`rounded-2xl border px-5 py-4 shadow-2xl ${
            toast.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-50"
              : "border-red-500/30 bg-red-500/15 text-red-50"
          }`}>
            <p className="text-sm font-semibold">{toast.message}</p>
          </div>
        </div>
      )}
    </div>
  );
}
