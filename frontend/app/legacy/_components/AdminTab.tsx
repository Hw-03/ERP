"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type BOMEntry, type Employee, type Item, type ShipPackage } from "@/lib/api";
import { BottomSheet } from "./BottomSheet";
import { PinLock } from "./PinLock";
import type { ToastState } from "./Toast";
import {
  DEPARTMENT_LABELS,
  LEGACY_COLORS,
  buildItemSearchLabel,
  formatNumber,
  normalizeDepartment,
} from "./legacyUi";

type Section = "items" | "employees" | "bom" | "packages" | "settings";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "items", label: "상품" },
  { id: "employees", label: "직원" },
  { id: "bom", label: "BOM" },
  { id: "packages", label: "출하묶음" },
  { id: "settings", label: "설정" },
];

function SectionTabs({
  section,
  setSection,
  onLock,
}: {
  section: Section;
  setSection: (next: Section) => void;
  onLock: () => void;
}) {
  return (
    <div className="mb-3 flex gap-[7px] overflow-x-auto">
      {SECTIONS.map((entry) => (
        <button
          key={entry.id}
          onClick={() => setSection(entry.id)}
          className="shrink-0 rounded-full border px-4 py-[7px] text-xs font-bold transition-all hover:brightness-110"
          style={{
            background: section === entry.id ? LEGACY_COLORS.purple : LEGACY_COLORS.s2,
            borderColor: section === entry.id ? LEGACY_COLORS.purple : LEGACY_COLORS.border,
            color: section === entry.id ? "#fff" : LEGACY_COLORS.muted2,
          }}
        >
          {entry.label}
        </button>
      ))}
      <button
        onClick={onLock}
        className="ml-auto shrink-0 rounded-full border px-4 py-[7px] text-xs font-bold transition-all hover:brightness-110"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
      >
        잠금
      </button>
    </div>
  );
}

const CATEGORY_OPTIONS = [
  { value: "RM", label: "RM — 원자재" },
  { value: "TA", label: "TA — 튜브 조립" },
  { value: "HA", label: "HA — 고압 조립" },
  { value: "VA", label: "VA — 진공 조립" },
  { value: "BA", label: "BA — 최종 조립" },
  { value: "FG", label: "FG — 완제품" },
  { value: "UK", label: "UK — 미분류" },
];

const MODEL_SLOTS = [
  { slot: 1, label: "DX3000",   symbol: "3" },
  { slot: 2, label: "COCOON",   symbol: "7" },
  { slot: 3, label: "SOLO",     symbol: "8" },
  { slot: 4, label: "ADX4000W", symbol: "4" },
  { slot: 5, label: "ADX6000",  symbol: "6" },
];
const UNIT_OPTIONS = ["EA", "SET", "kg", "g", "m", "mm", "L", "box"];

const EMPTY_ADD_FORM = {
  item_name: "",
  category: "RM" as Item["category"],
  spec: "",
  unit: "EA",
  model_slots: [] as number[],
  option_code: "",
  legacy_item_type: "",
  supplier: "",
  min_stock: "",
  initial_quantity: "",
};

export function ItemsSection({ showToast }: { showToast: (toast: ToastState) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Item | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [editForm, setEditForm] = useState({
    item_name: "",
    spec: "",
    unit: "",
    barcode: "",
    legacy_part: "",
    legacy_item_type: "",
    legacy_model: "",
    supplier: "",
    min_stock: "",
  });

  useEffect(() => {
    void api.getItems({ limit: 2000 }).then(setItems);
  }, []);

  const visibleItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return items.slice(0, 120);
    return items.filter((item) => `${item.item_name} ${item.erp_code}`.toLowerCase().includes(keyword)).slice(0, 120);
  }, [items, search]);

  function openEdit(item: Item) {
    setSelected(item);
    setEditForm({
      item_name: item.item_name,
      spec: item.spec || "",
      unit: item.unit,
      barcode: item.barcode || "",
      legacy_part: item.legacy_part || "",
      legacy_item_type: item.legacy_item_type || "",
      legacy_model: item.legacy_model || "",
      supplier: item.supplier || "",
      min_stock: item.min_stock != null ? String(item.min_stock) : "",
    });
  }

  async function save() {
    if (!selected) return;
    try {
      const updated = await api.updateItem(selected.item_id, {
        item_name: editForm.item_name,
        spec: editForm.spec || undefined,
        unit: editForm.unit,
        barcode: editForm.barcode || undefined,
        legacy_part: editForm.legacy_part || undefined,
        legacy_item_type: editForm.legacy_item_type || undefined,
        legacy_model: editForm.legacy_model || undefined,
        supplier: editForm.supplier || undefined,
        min_stock: editForm.min_stock ? Number(editForm.min_stock) : undefined,
      });
      setItems((current) => current.map((item) => (item.item_id === selected.item_id ? { ...item, ...updated } : item)));
      setSelected(null);
      showToast({ message: "상품 정보를 저장했습니다.", type: "success" });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "저장하지 못했습니다.", type: "error" });
    }
  }

  async function addItem() {
    if (!addForm.item_name.trim()) {
      showToast({ message: "품목명을 입력하세요.", type: "error" });
      return;
    }
    try {
      const created = await api.createItem({
        item_name: addForm.item_name.trim(),
        category: addForm.category,
        spec: addForm.spec || undefined,
        unit: addForm.unit || "EA",
        model_slots: addForm.model_slots.length > 0 ? addForm.model_slots : undefined,
        option_code: addForm.option_code || undefined,
        legacy_item_type: addForm.legacy_item_type || undefined,
        supplier: addForm.supplier || undefined,
        min_stock: addForm.min_stock ? Number(addForm.min_stock) : undefined,
        initial_quantity: addForm.initial_quantity ? Number(addForm.initial_quantity) : undefined,
      });
      setItems((current) => [created, ...current]);
      setAddOpen(false);
      setAddForm(EMPTY_ADD_FORM);
      showToast({ message: `'${created.item_name}' 품목이 추가됐습니다. (${created.erp_code})`, type: "success" });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "품목 추가에 실패했습니다.", type: "error" });
    }
  }

  const inputStyle = { background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text };
  const labelStyle = { color: LEGACY_COLORS.muted2 };

  return (
    <>
      <button
        onClick={() => setAddOpen(true)}
        className="mb-3 w-full rounded-xl border border-dashed py-[13px] text-sm font-bold transition-colors hover:bg-white/[0.08]"
        style={{ borderColor: LEGACY_COLORS.green, color: LEGACY_COLORS.green }}
      >
        + 품목 추가
      </button>

      <div className="mb-2 flex items-center gap-2 rounded-[11px] border px-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
        <span>🔍</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="상품 검색" className="w-full bg-transparent py-[10px] text-sm outline-none" style={{ color: LEGACY_COLORS.text }} />
      </div>
      <div className="overflow-hidden rounded-[14px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        {visibleItems.length === 0 && (
          <div className="px-4 py-6 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>품목이 없습니다.</div>
        )}
        {visibleItems.map((item, index) => (
          <button key={item.item_id} onClick={() => openEdit(item)} className="flex w-full items-center justify-between px-[14px] py-3 text-left transition-colors hover:bg-white/[0.12]" style={{ borderBottom: index === visibleItems.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}>
            <div>
              <div className="text-sm font-semibold">{item.item_name}</div>
              <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                {item.erp_code} · {item.legacy_part || "-"} · {item.legacy_model || "공용"}
              </div>
            </div>
            <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.blue }}>
              편집
            </div>
          </button>
        ))}
      </div>

      {/* 품목 추가 BottomSheet */}
      <BottomSheet open={addOpen} onClose={() => { setAddOpen(false); setAddForm(EMPTY_ADD_FORM); }} title="새 품목 추가">
        <div className="space-y-3 px-5 pb-6">
          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={labelStyle}>품목명 *</div>
            <input
              value={addForm.item_name}
              onChange={(e) => setAddForm((f) => ({ ...f, item_name: e.target.value }))}
              placeholder="예: 텅스텐 필라멘트"
              className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none"
              style={inputStyle}
            />
          </div>

          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={labelStyle}>카테고리 *</div>
            <select
              value={addForm.category}
              onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value as Item["category"] }))}
              className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none"
              style={inputStyle}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={labelStyle}>현재 수량</div>
            <input
              type="number"
              min={0}
              value={addForm.initial_quantity}
              onChange={(e) => setAddForm((f) => ({ ...f, initial_quantity: e.target.value }))}
              placeholder="0"
              className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none"
              style={inputStyle}
            />
          </div>

          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={labelStyle}>규격</div>
            <input
              value={addForm.spec}
              onChange={(e) => setAddForm((f) => ({ ...f, spec: e.target.value }))}
              placeholder="예: Ø0.3 × L50"
              className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none"
              style={inputStyle}
            />
          </div>

          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={labelStyle}>단위</div>
            <select
              value={addForm.unit}
              onChange={(e) => setAddForm((f) => ({ ...f, unit: e.target.value }))}
              className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none"
              style={inputStyle}
            >
              {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={labelStyle}>사용 제품 (ERP 기호)</div>
            <div className="flex flex-wrap gap-2">
              {MODEL_SLOTS.map(({ slot, label, symbol }) => {
                const checked = addForm.model_slots.includes(slot);
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setAddForm((f) => ({
                      ...f,
                      model_slots: checked
                        ? f.model_slots.filter((s) => s !== slot)
                        : [...f.model_slots, slot].sort(),
                    }))}
                    className="rounded-full border px-3 py-1.5 text-xs font-bold transition-colors"
                    style={{
                      background: checked ? LEGACY_COLORS.purple : LEGACY_COLORS.s2,
                      borderColor: checked ? LEGACY_COLORS.purple : LEGACY_COLORS.border,
                      color: checked ? "#fff" : LEGACY_COLORS.muted2,
                    }}
                  >
                    {label} ({symbol})
                  </button>
                );
              })}
            </div>
            {addForm.model_slots.length > 0 && (
              <div className="mt-1 text-[11px]" style={{ color: LEGACY_COLORS.purple }}>
                ERP 기호: {MODEL_SLOTS.filter((m) => addForm.model_slots.includes(m.slot)).map((m) => m.symbol).sort().join("")}
              </div>
            )}
          </div>

          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={labelStyle}>옵션/스펙 코드</div>
            <input
              type="text"
              value={addForm.option_code}
              onChange={(e) => setAddForm((f) => ({ ...f, option_code: e.target.value.toUpperCase() }))}
              placeholder="예: BG (블랙 유광)"
              maxLength={10}
              className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none"
              style={inputStyle}
            />
          </div>

          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={labelStyle}>자재분류</div>
            <input
              value={addForm.legacy_item_type}
              onChange={(e) => setAddForm((f) => ({ ...f, legacy_item_type: e.target.value }))}
              placeholder="예: 필라멘트, 애자"
              className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none"
              style={inputStyle}
            />
          </div>

          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={labelStyle}>공급사</div>
            <input
              value={addForm.supplier}
              onChange={(e) => setAddForm((f) => ({ ...f, supplier: e.target.value }))}
              placeholder="예: 삼성특수금속"
              className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none"
              style={inputStyle}
            />
          </div>

          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={labelStyle}>안전재고</div>
            <input
              type="number"
              min={0}
              value={addForm.min_stock}
              onChange={(e) => setAddForm((f) => ({ ...f, min_stock: e.target.value }))}
              placeholder="0"
              className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none"
              style={inputStyle}
            />
          </div>

          <div className="pt-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
            품번은 카테고리 기반으로 자동 부여됩니다. (예: RM-00972)
          </div>

          <button
            onClick={() => void addItem()}
            className="w-full rounded-xl py-[13px] text-[15px] font-bold text-white transition-all hover:brightness-110"
            style={{ background: LEGACY_COLORS.green }}
          >
            추가
          </button>
        </div>
      </BottomSheet>

      {/* 품목 편집 BottomSheet */}
      <BottomSheet open={!!selected} onClose={() => setSelected(null)} title={selected?.item_name || "상품 편집"}>
        <div className="space-y-3 px-5 pb-6">
          {(
            [
              ["item_name", "품명"],
              ["spec", "사양"],
              ["unit", "단위"],
              ["barcode", "바코드"],
              ["legacy_part", "파트"],
              ["legacy_item_type", "분류"],
              ["legacy_model", "모델"],
              ["supplier", "공급처"],
              ["min_stock", "안전재고"],
            ] as [keyof typeof editForm, string][]
          ).map(([key, label]) => (
            <div key={key}>
              <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={labelStyle}>
                {label}
              </div>
              <input
                value={editForm[key]}
                onChange={(event) => setEditForm((current) => ({ ...current, [key]: event.target.value }))}
                className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none"
                style={inputStyle}
              />
            </div>
          ))}
          <button onClick={() => void save()} className="w-full rounded-xl py-[13px] text-[15px] font-bold text-white transition-all hover:brightness-110" style={{ background: LEGACY_COLORS.blue }}>
            저장
          </button>
        </div>
      </BottomSheet>
    </>
  );
}

export function EmployeesSection({ showToast }: { showToast: (toast: ToastState) => void }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    employee_code: "",
    name: "",
    role: "",
    department: "議곕┰",
    phone: "",
  });

  useEffect(() => {
    void api.getEmployees().then(setEmployees);
  }, []);

  async function addEmployee() {
    try {
      const next = await api.createEmployee({
        employee_code: form.employee_code,
        name: form.name,
        role: form.role,
        department: form.department as Employee["department"],
        phone: form.phone || undefined,
        display_order: employees.length + 1,
      });
      setEmployees((current) => [...current, next]);
      setAddOpen(false);
      setForm({ employee_code: "", name: "", role: "", department: "議곕┰", phone: "" });
      showToast({ message: "직원을 추가했습니다.", type: "success" });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "직원을 추가하지 못했습니다.", type: "error" });
    }
  }

  async function toggleActive(employee: Employee) {
    const updated = await api.updateEmployee(employee.employee_id, { is_active: !employee.is_active });
    setEmployees((current) => current.map((entry) => (entry.employee_id === employee.employee_id ? updated : entry)));
  }

  async function move(employee: Employee, delta: number) {
    const updated = await api.updateEmployee(employee.employee_id, { display_order: employee.display_order + delta });
    setEmployees((current) =>
      current
        .map((entry) => (entry.employee_id === employee.employee_id ? updated : entry))
        .sort((a, b) => a.display_order - b.display_order),
    );
  }

  return (
    <>
      <button
        onClick={() => setAddOpen(true)}
        className="mb-3 w-full rounded-xl border border-dashed py-[13px] text-sm font-bold"
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
      >
        + 직원 추가
      </button>
      <div className="overflow-hidden rounded-[14px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        {employees
          .slice()
          .sort((a, b) => a.display_order - b.display_order)
          .map((employee, index, list) => (
            <div key={employee.employee_id} className="flex items-center gap-3 px-[14px] py-3" style={{ borderBottom: index === list.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}>
              <div className="flex flex-col gap-0.5">
                <button onClick={() => void move(employee, -1)} className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>▲</button>
                <button onClick={() => void move(employee, 1)} className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>▼</button>
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-semibold ${employee.is_active ? "" : "line-through"}`}>{employee.name}</div>
                <div className="truncate text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  {employee.employee_code} · {normalizeDepartment(employee.department)} · {employee.role}
                </div>
              </div>
              <button
                onClick={() => void toggleActive(employee)}
                className="inline-flex shrink-0 rounded-full px-[11px] py-1 text-[10px] font-bold transition-colors"
                style={{
                  background: employee.is_active ? "rgba(67,211,157,.16)" : "rgba(255,123,123,.14)",
                  color: employee.is_active ? LEGACY_COLORS.green : LEGACY_COLORS.red,
                  border: `1px solid ${employee.is_active ? "rgba(67,211,157,.3)" : "rgba(255,123,123,.3)"}`,
                }}
              >
                {employee.is_active ? "활성" : "비활성"}
              </button>
            </div>
          ))}
      </div>

      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)} title="직원 추가">
        <div className="space-y-3 px-5 pb-6">
          {(
            [
              ["employee_code", "직원 코드"],
              ["name", "이름"],
              ["role", "역할"],
              ["phone", "연락처"],
            ] as [keyof typeof form, string][]
          ).map(([key, label]) => (
            <div key={key}>
              <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>
                {label}
              </div>
              <input value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} />
            </div>
          ))}
          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>
              부서
            </div>
            <select value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
              {Object.keys(DEPARTMENT_LABELS).map((value) => (
                <option key={value} value={value}>
                  {DEPARTMENT_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <button onClick={() => void addEmployee()} className="w-full rounded-xl py-[13px] text-[15px] font-bold text-white" style={{ background: LEGACY_COLORS.blue }}>
            추가
          </button>
        </div>
      </BottomSheet>
    </>
  );
}

export function BomSection({ showToast }: { showToast: (toast: ToastState) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [parentId, setParentId] = useState("");
  const [bomRows, setBomRows] = useState<BOMEntry[]>([]);
  const [childSearch, setChildSearch] = useState("");
  const [childId, setChildId] = useState("");
  const [quantity, setQuantity] = useState("1");

  useEffect(() => {
    void api.getItems({ limit: 2000 }).then((nextItems) => {
      setItems(nextItems);
      if (nextItems[0]) setParentId(nextItems[0].item_id);
    });
  }, []);

  useEffect(() => {
    if (!parentId) return;
    void api.getBOM(parentId).then(setBomRows).catch(() => setBomRows([]));
  }, [parentId]);

  const filteredChildren = useMemo(() => {
    const keyword = childSearch.trim().toLowerCase();
    if (!keyword) return items.slice(0, 30);
    return items.filter((item) => `${item.item_name} ${item.erp_code}`.toLowerCase().includes(keyword)).slice(0, 30);
  }, [childSearch, items]);

  async function addRow() {
    if (!parentId || !childId || !Number(quantity)) return;
    try {
      const created = await api.createBOM({
        parent_item_id: parentId,
        child_item_id: childId,
        quantity: Number(quantity),
        unit: "EA",
      });
      setBomRows((current) => [...current, created]);
      setChildId("");
      setChildSearch("");
      setQuantity("1");
      showToast({ message: "BOM 항목을 추가했습니다.", type: "success" });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "BOM 항목을 추가하지 못했습니다.", type: "error" });
    }
  }

  async function removeRow(bomId: string) {
    await api.deleteBOM(bomId);
    setBomRows((current) => current.filter((row) => row.bom_id !== bomId));
  }

  return (
    <div>
      <div className="mb-3">
        <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>
          상위 품목
        </div>
        <select value={parentId} onChange={(event) => setParentId(event.target.value)} className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
          {items.map((item) => (
            <option key={item.item_id} value={item.item_id}>
              {item.erp_code} · {item.item_name}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-3 rounded-[14px] border px-[14px] py-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
        <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>
          하위 품목 추가
        </div>
        <input value={childSearch} onChange={(event) => { setChildSearch(event.target.value); setChildId(""); }} placeholder="하위 품목 검색" className="mb-2 w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} />
        {childSearch && !childId ? (
          <div className="mb-2 max-h-36 overflow-y-auto rounded-[11px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
            {filteredChildren.map((item, index) => (
              <button key={item.item_id} onClick={() => { setChildId(item.item_id); setChildSearch(buildItemSearchLabel(item)); }} className="block w-full px-[14px] py-2 text-left text-sm" style={{ borderBottom: index === filteredChildren.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}>
                {item.item_name}
              </button>
            ))}
          </div>
        ) : null}
        <div className="mb-2 grid grid-cols-[1fr_100px] gap-2">
          <input value={quantity} onChange={(event) => setQuantity(event.target.value)} className="rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} />
          <button onClick={() => void addRow()} className="rounded-xl py-[13px] text-sm font-bold text-white" style={{ background: LEGACY_COLORS.blue }}>
            추가
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-[14px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        {bomRows.length === 0 ? (
          <div className="px-[14px] py-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
            등록된 BOM이 없습니다.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_56px_56px_52px] border-b px-[14px] py-2 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
              <span>자재명</span>
              <span className="text-right">소요</span>
              <span className="text-right">현재고</span>
              <span className="text-right">가능</span>
            </div>
            {bomRows.map((row, index) => {
              const childItem = items.find((item) => item.item_id === row.child_item_id);
              const stock = Number(childItem?.quantity ?? 0);
              const capacity = row.quantity > 0 ? Math.floor(stock / row.quantity) : 0;
              return (
                <div key={row.bom_id} className="grid grid-cols-[1fr_56px_56px_52px] items-center px-[14px] py-3" style={{ borderBottom: index === bomRows.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{childItem?.item_name || row.child_item_id}</div>
                    <div className="flex items-center gap-1.5 text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                      <span>{childItem?.erp_code}</span>
                      <button onClick={() => void removeRow(row.bom_id)} className="font-bold" style={{ color: LEGACY_COLORS.red }}>삭제</button>
                    </div>
                  </div>
                  <div className="text-right font-mono text-xs">{formatNumber(row.quantity)}</div>
                  <div className="text-right font-mono text-xs font-bold" style={{ color: stock > 0 ? LEGACY_COLORS.green : LEGACY_COLORS.red }}>{formatNumber(stock)}</div>
                  <div className="text-right font-mono text-xs font-bold" style={{ color: capacity > 0 ? LEGACY_COLORS.cyan : LEGACY_COLORS.muted2 }}>{formatNumber(capacity)}</div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

export function PackagesSection({ showToast }: { showToast: (toast: ToastState) => void }) {
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<ShipPackage | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ package_code: "", name: "", notes: "" });
  const [itemSearch, setItemSearch] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");

  useEffect(() => {
    Promise.all([api.getShipPackages(), api.getItems({ limit: 2000 })]).then(([nextPackages, nextItems]) => {
      setPackages(nextPackages);
      setItems(nextItems);
    });
  }, []);

  const filteredItems = useMemo(() => {
    const keyword = itemSearch.trim().toLowerCase();
    if (!keyword) return items.slice(0, 30);
    return items.filter((item) => `${item.item_name} ${item.erp_code}`.toLowerCase().includes(keyword)).slice(0, 30);
  }, [itemSearch, items]);

  async function createPackage() {
    try {
      const created = await api.createShipPackage(createForm);
      setPackages((current) => [...current, created]);
      setCreateOpen(false);
      setCreateForm({ package_code: "", name: "", notes: "" });
      showToast({ message: "출하 묶음을 생성했습니다.", type: "success" });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "출하 묶음을 생성하지 못했습니다.", type: "error" });
    }
  }

  async function addItem() {
    if (!selectedPackage || !itemId || !Number(quantity)) return;
    const updated = await api.addShipPackageItem(selectedPackage.package_id, { item_id: itemId, quantity: Number(quantity) });
    setPackages((current) => current.map((entry) => (entry.package_id === updated.package_id ? updated : entry)));
    setSelectedPackage(updated);
    setItemSearch("");
    setItemId("");
    setQuantity("1");
  }

  async function removeItem(packageItemId: string) {
    if (!selectedPackage) return;
    const updated = await api.deleteShipPackageItem(selectedPackage.package_id, packageItemId);
    setPackages((current) => current.map((entry) => (entry.package_id === updated.package_id ? updated : entry)));
    setSelectedPackage(updated);
  }

  async function removePackage(packageId: string) {
    await api.deleteShipPackage(packageId);
    setPackages((current) => current.filter((entry) => entry.package_id !== packageId));
    if (selectedPackage?.package_id === packageId) setSelectedPackage(null);
  }

  return (
    <>
      <button
        onClick={() => setCreateOpen(true)}
        className="mb-3 w-full rounded-xl border border-dashed py-[13px] text-sm font-bold"
        style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
      >
        + 출하묶음 생성
      </button>
      <div className="overflow-hidden rounded-[14px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        {packages.map((pkg, index) => (
          <div key={pkg.package_id} className="flex items-center justify-between gap-3 px-[14px] py-3" style={{ borderBottom: index === packages.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{pkg.name}</div>
              <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                {pkg.package_code} · {pkg.items.length}종
              </div>
            </div>
            <button onClick={() => setSelectedPackage(pkg)} className="text-xs font-bold" style={{ color: LEGACY_COLORS.blue }}>편집</button>
            <button onClick={() => void removePackage(pkg.package_id)} className="text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>삭제</button>
          </div>
        ))}
      </div>

      <BottomSheet open={createOpen} onClose={() => setCreateOpen(false)} title="출하묶음 생성">
        <div className="space-y-3 px-5 pb-6">
          {(
            [
              ["package_code", "묶음 코드"],
              ["name", "이름"],
              ["notes", "비고"],
            ] as [keyof typeof createForm, string][]
          ).map(([key, label]) => (
            <div key={key}>
              <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>{label}</div>
              <input value={createForm[key]} onChange={(event) => setCreateForm((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} />
            </div>
          ))}
          <button onClick={() => void createPackage()} className="w-full rounded-xl py-[13px] text-[15px] font-bold text-white" style={{ background: LEGACY_COLORS.blue }}>생성</button>
        </div>
      </BottomSheet>

      <BottomSheet open={!!selectedPackage} onClose={() => setSelectedPackage(null)} title={selectedPackage?.name || "출하묶음"}>
        <div className="space-y-3 px-5 pb-6">
          {selectedPackage?.items.map((item) => (
            <div key={item.package_item_id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2" style={{ background: LEGACY_COLORS.s2 }}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{item.item_name}</div>
                <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  {formatNumber(item.quantity)} {item.item_unit}
                </div>
              </div>
              <button onClick={() => void removeItem(item.package_item_id)} className="text-xs font-bold" style={{ color: LEGACY_COLORS.red }}>삭제</button>
            </div>
          ))}
          <div>
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>품목 추가</div>
            <input value={itemSearch} onChange={(event) => { setItemSearch(event.target.value); setItemId(""); }} placeholder="품목 검색" className="mb-2 w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} />
            {itemSearch && !itemId ? (
              <div className="mb-2 max-h-36 overflow-y-auto rounded-[11px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                {filteredItems.map((item, index) => (
                  <button key={item.item_id} onClick={() => { setItemId(item.item_id); setItemSearch(buildItemSearchLabel(item)); }} className="block w-full px-[14px] py-2 text-left text-sm" style={{ borderBottom: index === filteredItems.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}>
                    {item.item_name}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="grid grid-cols-[1fr_100px] gap-2">
              <input value={quantity} onChange={(event) => setQuantity(event.target.value)} className="rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} />
              <button onClick={() => void addItem()} className="rounded-xl py-[13px] text-sm font-bold text-white" style={{ background: LEGACY_COLORS.blue }}>추가</button>
            </div>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}

export function SettingsSection({ showToast }: { showToast: (toast: ToastState) => void }) {
  const [pinForm, setPinForm] = useState({ current_pin: "", new_pin: "", confirm_pin: "" });
  const [resetPin, setResetPin] = useState("");

  async function changePin() {
    if (pinForm.new_pin !== pinForm.confirm_pin) {
      showToast({ message: "새 PIN이 서로 다릅니다.", type: "error" });
      return;
    }
    await api.updateAdminPin({ current_pin: pinForm.current_pin, new_pin: pinForm.new_pin });
    setPinForm({ current_pin: "", new_pin: "", confirm_pin: "" });
    showToast({ message: "관리자 PIN을 변경했습니다.", type: "success" });
  }

  async function reset() {
    await api.resetDatabase(resetPin);
    setResetPin("");
    showToast({ message: "데이터를 초기화했습니다.", type: "success" });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border px-[14px] py-4" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        <div className="mb-3 text-xs font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>PIN 변경</div>
        {(
          [
            ["current_pin", "현재 PIN"],
            ["new_pin", "새 PIN"],
            ["confirm_pin", "새 PIN 확인"],
          ] as [keyof typeof pinForm, string][]
        ).map(([key, label]) => (
          <div key={key} className="mb-3">
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>{label}</div>
            <input type="password" value={pinForm[key]} onChange={(event) => setPinForm((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} />
          </div>
        ))}
        <button onClick={() => void changePin()} className="w-full rounded-xl py-[13px] text-[15px] font-bold text-white" style={{ background: LEGACY_COLORS.blue }}>변경</button>
      </div>

      <div className="rounded-[14px] border px-[14px] py-4" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        <div className="mb-3 text-xs font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>엑셀 내보내기</div>
        <div className="grid grid-cols-2 gap-2">
          <a href={api.getItemsExportUrl()} download className="rounded-xl border py-[13px] text-center text-sm font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
            품목 엑셀
          </a>
          <a href={api.getTransactionsExportUrl()} download className="rounded-xl border py-[13px] text-center text-sm font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
            거래 엑셀
          </a>
        </div>
      </div>

      <div className="rounded-[14px] border px-[14px] py-4" style={{ background: "rgba(242,95,92,.08)", borderColor: "rgba(242,95,92,.25)" }}>
        <div className="mb-3 text-xs font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.red }}>안전 초기화</div>
        <div className="mb-3 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          관리자 PIN 확인 후 시드 데이터를 다시 적재합니다.
        </div>
        <input type="password" value={resetPin} onChange={(event) => setResetPin(event.target.value)} placeholder="관리자 PIN" className="mb-3 w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} />
        <button onClick={() => void reset()} className="w-full rounded-xl py-[13px] text-[15px] font-bold text-white" style={{ background: LEGACY_COLORS.red }}>초기화</button>
      </div>
    </div>
  );
}

export function AdminTab({ showToast }: { showToast: (toast: ToastState) => void }) {
  const [unlocked, setUnlocked] = useState(false);
  const [section, setSection] = useState<Section>("items");

  if (!unlocked) {
    return <PinLock onUnlocked={() => setUnlocked(true)} />;
  }

  return (
    <div className="pb-4">
      <SectionTabs section={section} setSection={setSection} onLock={() => setUnlocked(false)} />
      {section === "items" && <ItemsSection showToast={showToast} />}
      {section === "employees" && <EmployeesSection showToast={showToast} />}
      {section === "bom" && <BomSection showToast={showToast} />}
      {section === "packages" && <PackagesSection showToast={showToast} />}
      {section === "settings" && <SettingsSection showToast={showToast} />}
    </div>
  );
}
