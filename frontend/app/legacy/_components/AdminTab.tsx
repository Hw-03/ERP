"use client";

import { useEffect, useState } from "react";
import { api, type Employee, type Item, type ShipPackage } from "@/lib/api";
import { BottomSheet } from "./BottomSheet";
import { PinLock } from "./PinLock";
import type { ToastState } from "./Toast";

type Section = "items" | "employees" | "packages" | "settings";

// ─── Items sub-section ─────────────────��──────────────────────────────────────

function ItemsSection({ showToast }: { showToast: (t: ToastState) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    item_name: "", spec: "", unit: "",
    barcode: "", legacy_file_type: "", legacy_part: "",
    legacy_item_type: "", legacy_model: "", supplier: "",
    min_stock: "",
  });

  useEffect(() => {
    api.getItems({ limit: 2000 }).then((data) => {
      setItems(data);
      setLoading(false);
    });
  }, []);

  const displayed = items.filter((i) => {
    const kw = search.trim().toLowerCase();
    if (!kw) return true;
    return (
      i.item_name.toLowerCase().includes(kw) ||
      i.item_code.toLowerCase().includes(kw)
    );
  }).slice(0, 100);

  const openEdit = (item: Item) => {
    setEditItem(item);
    setForm({
      item_name: item.item_name,
      spec: item.spec ?? "",
      unit: item.unit,
      barcode: item.barcode ?? "",
      legacy_file_type: item.legacy_file_type ?? "",
      legacy_part: item.legacy_part ?? "",
      legacy_item_type: item.legacy_item_type ?? "",
      legacy_model: item.legacy_model ?? "",
      supplier: item.supplier ?? "",
      min_stock: item.min_stock != null ? String(item.min_stock) : "",
    });
  };

  const handleSave = async () => {
    if (!editItem) return;
    try {
      setSaving(true);
      const updated = await api.updateItem(editItem.item_id, {
        item_name: form.item_name || undefined,
        spec: form.spec || undefined,
        unit: form.unit || undefined,
        barcode: form.barcode || undefined,
        legacy_file_type: form.legacy_file_type || undefined,
        legacy_part: form.legacy_part || undefined,
        legacy_item_type: form.legacy_item_type || undefined,
        legacy_model: form.legacy_model || undefined,
        supplier: form.supplier || undefined,
        min_stock: form.min_stock ? (form.min_stock as unknown as undefined) : undefined,
      } as Parameters<typeof api.updateItem>[1]);
      setItems((prev) => prev.map((i) => (i.item_id === editItem.item_id ? { ...i, ...updated } : i)));
      setEditItem(null);
      showToast({ message: "품목이 수정되었습니다.", type: "success" });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "수정 실패", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 mx-4 mt-3 mb-2">
        <span className="text-slate-500">🔍</span>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="품목 검색" className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500" />
      </div>
      {loading ? (
        <p className="px-4 py-4 text-sm text-slate-500">로딩 중...</p>
      ) : (
        <div className="divide-y divide-slate-800/60">
          {displayed.map((item) => (
            <button key={item.item_id} onClick={() => openEdit(item)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-800/40">
              <div>
                <p className="text-sm font-medium text-slate-100">{item.item_name}</p>
                <p className="text-[11px] text-slate-500">
                  {item.item_code} · {item.legacy_part ?? "-"} · {item.legacy_model ?? "-"}
                </p>
              </div>
              <span className="text-xs text-blue-400">편집 ›</span>
            </button>
          ))}
        </div>
      )}

      <BottomSheet open={!!editItem} onClose={() => setEditItem(null)} title={editItem?.item_name ?? ""}>
        <div className="space-y-3 px-5 pb-6 pt-3">
          {(
            [
              ["item_name", "품목명"], ["spec", "사양"], ["unit", "단위"],
              ["barcode", "바코드"], ["legacy_file_type", "파일 타입"],
              ["legacy_part", "파트"], ["legacy_item_type", "품목 유형"],
              ["legacy_model", "모델"], ["supplier", "공급사"], ["min_stock", "안전재고"],
            ] as [keyof typeof form, string][]
          ).map(([key, label]) => (
            <div key={key}>
              <label className="mb-1 block text-xs font-semibold text-slate-400">{label}</label>
              <input
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none"
              />
            </div>
          ))}
          <button onClick={handleSave} disabled={saving}
            className="mt-2 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

// ─── Employees sub-section ───────────────────────────���────────────────────────

function EmployeesSection({ showToast }: { showToast: (t: ToastState) => void }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    employee_code: "", name: "", role: "", department: "조립", phone: "",
  });

  useEffect(() => {
    api.getEmployees().then((data) => { setEmployees(data); setLoading(false); });
  }, []);

  const handleAdd = async () => {
    try {
      const emp = await api.createEmployee({
        employee_code: form.employee_code,
        name: form.name,
        role: form.role,
        phone: form.phone || undefined,
        department: form.department as Employee["department"],
        display_order: employees.length + 1,
      });
      setEmployees((prev) => [...prev, emp]);
      setAddOpen(false);
      setForm({ employee_code: "", name: "", role: "", department: "조립", phone: "" });
      showToast({ message: "직원이 추가되었습니다.", type: "success" });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "추가 실패", type: "error" });
    }
  };

  const toggleActive = async (emp: Employee) => {
    try {
      const updated = await api.updateEmployee(emp.employee_id, { is_active: !emp.is_active });
      setEmployees((prev) => prev.map((e) => (e.employee_id === emp.employee_id ? updated : e)));
    } catch {
      showToast({ message: "변경 실패", type: "error" });
    }
  };

  const moveOrder = async (emp: Employee, delta: number) => {
    const newOrder = emp.display_order + delta;
    try {
      const updated = await api.updateEmployee(emp.employee_id, { display_order: newOrder });
      setEmployees((prev) =>
        prev.map((e) => (e.employee_id === emp.employee_id ? updated : e))
          .sort((a, b) => a.display_order - b.display_order),
      );
    } catch {
      showToast({ message: "순서 변경 실패", type: "error" });
    }
  };

  if (loading) return <p className="px-4 py-4 text-sm text-slate-500">로딩 중...</p>;

  return (
    <div>
      <div className="px-4 pt-3 pb-2">
        <button onClick={() => setAddOpen(true)}
          className="w-full rounded-xl border border-dashed border-slate-600 py-2.5 text-sm text-slate-400 hover:bg-slate-800/40">
          + 직원 추가
        </button>
      </div>
      <div className="divide-y divide-slate-800/60">
        {employees.sort((a, b) => a.display_order - b.display_order).map((emp) => (
          <div key={emp.employee_id} className="flex items-center gap-2 px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <button onClick={() => moveOrder(emp, -1)} className="text-[10px] text-slate-500">▲</button>
              <button onClick={() => moveOrder(emp, 1)} className="text-[10px] text-slate-500">▼</button>
            </div>
            <div className="flex-1">
              <p className={`text-sm font-medium ${emp.is_active ? "text-slate-100" : "text-slate-500 line-through"}`}>
                {emp.name}
              </p>
              <p className="text-[11px] text-slate-500">{emp.employee_code} · {emp.department} · {emp.role}</p>
            </div>
            <button onClick={() => toggleActive(emp)}
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${emp.is_active ? "bg-emerald-600/20 text-emerald-400" : "bg-slate-700 text-slate-500"}`}>
              {emp.is_active ? "활성" : "비활성"}
            </button>
          </div>
        ))}
      </div>

      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)} title="직원 추가">
        <div className="space-y-3 px-5 pb-6 pt-3">
          {(
            [
              ["employee_code", "직원 코드"], ["name", "이름"],
              ["role", "역할"], ["phone", "연락처"],
            ] as [keyof typeof form, string][]
          ).map(([key, label]) => (
            <div key={key}>
              <label className="mb-1 block text-xs font-semibold text-slate-400">{label}</label>
              <input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none" />
            </div>
          ))}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">부서</label>
            <select value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none">
              {["조립","고압","진공","튜닝","튜브","AS","연구","영업","출하","기타"].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <button onClick={handleAdd}
            className="mt-2 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white">추가</button>
        </div>
      </BottomSheet>
    </div>
  );
}

// ─── Packages sub-section ───────────────────────────────��─────────────────────

function PackagesSection({ showToast }: { showToast: (t: ToastState) => void }) {
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editPkg, setEditPkg] = useState<ShipPackage | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [form, setForm] = useState({ package_code: "", name: "", notes: "" });
  const [addItemSearch, setAddItemSearch] = useState("");
  const [addItemId, setAddItemId] = useState("");
  const [addItemQty, setAddItemQty] = useState("1");

  useEffect(() => {
    Promise.all([api.getShipPackages(), api.getItems({ limit: 2000 })]).then(([pkgs, its]) => {
      setPackages(pkgs);
      setAllItems(its);
      setLoading(false);
    });
  }, []);

  const handleCreate = async () => {
    try {
      const pkg = await api.createShipPackage({ package_code: form.package_code, name: form.name, notes: form.notes || undefined });
      setPackages((prev) => [...prev, pkg]);
      setAddOpen(false);
      setForm({ package_code: "", name: "", notes: "" });
      showToast({ message: "패키지가 생성되었습니다.", type: "success" });
    } catch (e) { showToast({ message: e instanceof Error ? e.message : "생성 실패", type: "error" }); }
  };

  const handleDeletePkg = async (pkgId: string) => {
    try {
      await api.deleteShipPackage(pkgId);
      setPackages((prev) => prev.filter((p) => p.package_id !== pkgId));
      if (editPkg?.package_id === pkgId) setEditPkg(null);
      showToast({ message: "패키지가 삭제되었습니다.", type: "success" });
    } catch (e) { showToast({ message: e instanceof Error ? e.message : "삭제 실패", type: "error" }); }
  };

  const handleAddItem = async () => {
    if (!editPkg || !addItemId) return;
    try {
      const updated = await api.addShipPackageItem(editPkg.package_id, { item_id: addItemId, quantity: Number(addItemQty) });
      setPackages((prev) => prev.map((p) => (p.package_id === editPkg.package_id ? updated : p)));
      setEditPkg(updated);
      setAddItemOpen(false);
      setAddItemSearch(""); setAddItemId(""); setAddItemQty("1");
    } catch (e) { showToast({ message: e instanceof Error ? e.message : "추가 실패", type: "error" }); }
  };

  const handleRemoveItem = async (pkgItemId: string) => {
    if (!editPkg) return;
    try {
      const updated = await api.deleteShipPackageItem(editPkg.package_id, pkgItemId);
      setPackages((prev) => prev.map((p) => (p.package_id === editPkg.package_id ? updated : p)));
      setEditPkg(updated);
    } catch (e) { showToast({ message: e instanceof Error ? e.message : "삭제 실패", type: "error" }); }
  };

  const filteredAddItems = allItems
    .filter((i) => {
      const kw = addItemSearch.toLowerCase();
      return !kw || i.item_name.toLowerCase().includes(kw) || i.item_code.toLowerCase().includes(kw);
    })
    .slice(0, 30);

  if (loading) return <p className="px-4 py-4 text-sm text-slate-500">로딩 중...</p>;

  return (
    <div>
      <div className="px-4 pt-3 pb-2">
        <button onClick={() => setAddOpen(true)}
          className="w-full rounded-xl border border-dashed border-slate-600 py-2.5 text-sm text-slate-400 hover:bg-slate-800/40">
          + 패키지 생성
        </button>
      </div>
      <div className="divide-y divide-slate-800/60">
        {packages.map((pkg) => (
          <div key={pkg.package_id} className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-100">{pkg.name}</p>
                <p className="text-[11px] text-slate-500">{pkg.package_code} · {pkg.items.length}종</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditPkg(pkg)} className="text-xs text-blue-400">편집</button>
                <button onClick={() => handleDeletePkg(pkg.package_id)} className="text-xs text-red-400">삭제</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create package */}
      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)} title="패키지 생성">
        <div className="space-y-3 px-5 pb-6 pt-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">패키지 코드</label>
            <input value={form.package_code} onChange={(e) => setForm((f) => ({ ...f, package_code: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">이름</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">메모</label>
            <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none" />
          </div>
          <button onClick={handleCreate}
            className="mt-2 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white">생성</button>
        </div>
      </BottomSheet>

      {/* Edit package items */}
      <BottomSheet open={!!editPkg} onClose={() => setEditPkg(null)} title={editPkg?.name ?? ""}>
        <div className="px-5 pb-6 pt-3">
          <div className="mb-3 space-y-1">
            {editPkg?.items.map((pi) => (
              <div key={pi.package_item_id} className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/40 px-3 py-2">
                <span className="text-sm text-slate-200">{pi.item_name}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-cyan-300">{Number(pi.quantity).toLocaleString()} {pi.item_unit}</span>
                  <button onClick={() => handleRemoveItem(pi.package_item_id)} className="text-xs text-red-400">✕</button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setAddItemOpen(true)}
            className="w-full rounded-xl border border-dashed border-slate-600 py-2.5 text-sm text-slate-400">
            + 품목 추가
          </button>
        </div>
      </BottomSheet>

      {/* Add item to package */}
      <BottomSheet open={addItemOpen} onClose={() => setAddItemOpen(false)} title="품목 추가">
        <div className="space-y-3 px-5 pb-6 pt-3">
          <input value={addItemSearch} onChange={(e) => { setAddItemSearch(e.target.value); setAddItemId(""); }}
            placeholder="품목 검색"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500" />
          {addItemSearch && !addItemId && (
            <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900">
              {filteredAddItems.map((i) => (
                <button key={i.item_id} onClick={() => { setAddItemId(i.item_id); setAddItemSearch(`${i.item_code} · ${i.item_name}`); }}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-slate-800">
                  <span className="text-slate-200">{i.item_name}</span>
                  <span className="font-mono text-xs text-cyan-300">{Number(i.quantity).toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">수량</label>
            <input value={addItemQty} onChange={(e) => setAddItemQty(e.target.value)} inputMode="numeric"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-center font-mono text-slate-100 outline-none" />
          </div>
          <button onClick={handleAddItem} className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white">추가</button>
        </div>
      </BottomSheet>
    </div>
  );
}

// ─── Settings sub-section ─────────────────────────────────────────────────────

function SettingsSection({ showToast }: { showToast: (t: ToastState) => void }) {
  const [pinForm, setPinForm] = useState({ current_pin: "", new_pin: "", confirm_pin: "" });
  const [pinError, setPinError] = useState<string | null>(null);
  const [resetPin, setResetPin] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handlePinChange = async () => {
    if (pinForm.new_pin !== pinForm.confirm_pin) { setPinError("새 비밀번호가 일치하지 않습니다."); return; }
    if (pinForm.new_pin.length < 4) { setPinError("4자리 이상 입력해 주세요."); return; }
    try {
      await api.updateAdminPin({ current_pin: pinForm.current_pin, new_pin: pinForm.new_pin });
      setPinForm({ current_pin: "", new_pin: "", confirm_pin: "" });
      setPinError(null);
      showToast({ message: "비밀번호가 변경되었습니다.", type: "success" });
    } catch (e) {
      setPinError(e instanceof Error ? e.message : "변경 실패");
    }
  };

  const handleReset = async () => {
    try {
      setResetting(true);
      await api.resetDatabase(resetPin);
      setResetConfirm(false);
      setResetPin("");
      showToast({ message: "데이터베이스 초기화 완료", type: "success" });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : "초기화 실패", type: "error" });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-4 px-4 py-4">
      {/* PIN change */}
      <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">비밀번호 변경</p>
        <div className="space-y-2">
          {(
            [
              ["current_pin", "현재 비밀번호"],
              ["new_pin", "새 비밀번호"],
              ["confirm_pin", "새 비밀번호 확인"],
            ] as [keyof typeof pinForm, string][]
          ).map(([key, label]) => (
            <div key={key}>
              <label className="mb-1 block text-xs text-slate-400">{label}</label>
              <input type="password" value={pinForm[key]}
                onChange={(e) => setPinForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none" />
            </div>
          ))}
        </div>
        {pinError && <p className="mt-2 text-xs text-red-400">{pinError}</p>}
        <button onClick={handlePinChange}
          className="mt-3 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white">변경</button>
      </div>

      {/* CSV export */}
      <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">데이터 내보내기</p>
        <div className="flex gap-2">
          <a href={api.getItemsExportUrl()} download
            className="flex-1 rounded-xl border border-slate-600 py-2.5 text-center text-xs text-slate-300 hover:bg-slate-800">
            품목 CSV
          </a>
          <a href={api.getTransactionsExportUrl()} download
            className="flex-1 rounded-xl border border-slate-600 py-2.5 text-center text-xs text-slate-300 hover:bg-slate-800">
            거래 CSV
          </a>
        </div>
      </div>

      {/* Reset */}
      <div className="rounded-2xl border border-red-900/40 bg-red-950/20 p-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-red-400">전체 초기화</p>
        <p className="mb-3 text-xs text-slate-500">시드 데이터를 재적재합니다. 현재 재고와 거래 이력이 삭제됩니다.</p>
        <button onClick={() => setResetConfirm(true)}
          className="w-full rounded-xl border border-red-700/50 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-950/40">
          데이터 초기화
        </button>
      </div>

      <BottomSheet open={resetConfirm} onClose={() => setResetConfirm(false)} title="전체 초기화 확인">
        <div className="space-y-3 px-5 pb-6 pt-3">
          <p className="text-sm text-slate-300">
            이 작업은 되돌릴 수 없습니다. 계속하려면 관리자 PIN을 입력하세요.
          </p>
          <input type="password" value={resetPin} onChange={(e) => setResetPin(e.target.value)}
            placeholder="관리자 PIN"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500" />
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setResetConfirm(false)}
              className="rounded-xl border border-slate-700 py-3 text-sm text-slate-300">취소</button>
            <button onClick={handleReset} disabled={resetting}
              className="rounded-xl bg-red-600 py-3 text-sm font-semibold text-white disabled:opacity-50">
              {resetting ? "초기화 중..." : "초기화"}
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

// ─── Main AdminTab ──────────────────────────────────────────────���──────────────

const SECTIONS: { id: Section; label: string }[] = [
  { id: "items", label: "상품" },
  { id: "employees", label: "직원" },
  { id: "packages", label: "출하묶음" },
  { id: "settings", label: "설정" },
];

export function AdminTab({ showToast }: { showToast: (t: ToastState) => void }) {
  const [unlocked, setUnlocked] = useState(false);
  const [section, setSection] = useState<Section>("items");

  if (!unlocked) {
    return <PinLock onUnlocked={() => setUnlocked(true)} />;
  }

  return (
    <div className="flex flex-col">
      {/* Section tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-800 bg-slate-900/60 px-4 py-2 scrollbar-hide">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              section === s.id
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {s.label}
          </button>
        ))}
        <button
          onClick={() => setUnlocked(false)}
          className="ml-auto shrink-0 rounded-full px-3 py-1.5 text-[10px] text-slate-500 hover:text-slate-300"
        >
          🔒 잠금
        </button>
      </div>

      {section === "items" && <ItemsSection showToast={showToast} />}
      {section === "employees" && <EmployeesSection showToast={showToast} />}
      {section === "packages" && <PackagesSection showToast={showToast} />}
      {section === "settings" && <SettingsSection showToast={showToast} />}
    </div>
  );
}
