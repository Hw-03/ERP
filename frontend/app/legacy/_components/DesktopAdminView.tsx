"use client";

import type { ElementType } from "react";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, DatabaseBackup, FileDown, KeyRound, PackagePlus, Search, Settings2, ShieldCheck, Users } from "lucide-react";
import { api, type BOMEntry, type Employee, type Item, type ShipPackage } from "@/lib/api";
import { DesktopRightPanel } from "./DesktopRightPanel";
import { PinLock } from "./PinLock";
import { DEPARTMENT_LABELS, LEGACY_COLORS, buildItemSearchLabel, formatNumber, normalizeDepartment } from "./legacyUi";

type AdminSection = "items" | "employees" | "bom" | "packages" | "settings";

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

const SECTIONS: { id: AdminSection; label: string; description: string; icon: ElementType }[] = [
  { id: "items", label: "품목", description: "품목 기본 정보 수정", icon: PackagePlus },
  { id: "employees", label: "직원", description: "직원 활성 상태 관리", icon: Users },
  { id: "bom", label: "BOM", description: "부모-자식 자재 구성", icon: Settings2 },
  { id: "packages", label: "출하묶음", description: "패키지 구성 관리", icon: ShieldCheck },
  { id: "settings", label: "설정", description: "PIN, CSV, 초기화", icon: KeyRound },
];

export function DesktopAdminView({
  globalSearch,
  onStatusChange,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [section, setSection] = useState<AdminSection>("items");
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<ShipPackage | null>(null);
  const [parentId, setParentId] = useState("");
  const [bomRows, setBomRows] = useState<BOMEntry[]>([]);
  const [message, setMessage] = useState("");
  const [pinForm, setPinForm] = useState({ current_pin: "", new_pin: "", confirm_pin: "" });
  const [resetPin, setResetPin] = useState("");
  const [itemSearch, setItemSearch] = useState("");

  async function loadData() {
    const [nextItems, nextEmployees, nextPackages] = await Promise.all([
      api.getItems({ limit: 2000, search: globalSearch.trim() || undefined }),
      api.getEmployees(),
      api.getShipPackages(),
    ]);
    setItems(nextItems);
    setEmployees(nextEmployees);
    setPackages(nextPackages);
    if (!parentId && nextItems[0]) setParentId(nextItems[0].item_id);
    onStatusChange(`관리자 데이터를 불러왔습니다. 품목 ${nextItems.length}건 / 직원 ${nextEmployees.length}명`);
  }

  useEffect(() => {
    if (!unlocked) return;
    void loadData().catch((nextError) => setMessage(nextError instanceof Error ? nextError.message : "관리자 데이터를 불러오지 못했습니다."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, globalSearch]);

  useEffect(() => {
    if (!parentId) return;
    void api.getBOM(parentId).then(setBomRows).catch(() => setBomRows([]));
  }, [parentId]);

  const visibleItems = useMemo(() => {
    const keyword = `${globalSearch} ${itemSearch}`.trim().toLowerCase();
    if (!keyword) return items.slice(0, 200);
    return items.filter((item) => `${item.item_name} ${item.item_code}`.toLowerCase().includes(keyword)).slice(0, 200);
  }, [globalSearch, itemSearch, items]);

  const quickItems = useMemo(() => items.slice(0, 40), [items]);

  async function addItem() {
    if (!addForm.item_name.trim()) {
      setMessage("품목명을 입력하세요.");
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
      setSelectedItem(created);
      setAddMode(false);
      setAddForm(EMPTY_ADD_FORM);
      onStatusChange(`'${created.item_name}' 품목이 추가됐습니다. (${created.item_code})`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "품목 추가에 실패했습니다.");
    }
  }

  async function saveItemField(field: keyof Pick<Item, "item_name" | "spec" | "barcode" | "legacy_model" | "supplier">, value: string) {
    if (!selectedItem) return;
    const updated = await api.updateItem(selectedItem.item_id, { [field]: value || undefined });
    setItems((current) => current.map((item) => (item.item_id === updated.item_id ? updated : item)));
    setSelectedItem(updated);
    onStatusChange(`${updated.item_name} 정보를 저장했습니다.`);
  }

  async function toggleEmployee(employee: Employee) {
    const updated = await api.updateEmployee(employee.employee_id, { is_active: !employee.is_active });
    setEmployees((current) => current.map((entry) => (entry.employee_id === employee.employee_id ? updated : entry)));
    setSelectedEmployee(updated);
    onStatusChange(`${updated.name} 직원 상태를 변경했습니다.`);
  }

  async function createSimplePackage() {
    const created = await api.createShipPackage({
      package_code: `PKG-${Date.now()}`,
      name: `출하묶음 ${packages.length + 1}`,
    });
    setPackages((current) => [...current, created]);
    setSelectedPackage(created);
    onStatusChange(`${created.name} 출하묶음을 생성했습니다.`);
  }

  async function addPackageItem(itemId: string) {
    if (!selectedPackage) return;
    const updated = await api.addShipPackageItem(selectedPackage.package_id, { item_id: itemId, quantity: 1 });
    setPackages((current) => current.map((entry) => (entry.package_id === updated.package_id ? updated : entry)));
    setSelectedPackage(updated);
    onStatusChange(`${updated.name}에 품목을 추가했습니다.`);
  }

  async function addBomRow(childId: string) {
    if (!parentId) return;
    const created = await api.createBOM({ parent_item_id: parentId, child_item_id: childId, quantity: 1, unit: "EA" });
    setBomRows((current) => [...current, created]);
    onStatusChange("BOM 항목을 추가했습니다.");
  }

  async function changePin() {
    if (pinForm.new_pin !== pinForm.confirm_pin) {
      setMessage("새 PIN과 확인 PIN이 일치하지 않습니다.");
      return;
    }
    await api.updateAdminPin({ current_pin: pinForm.current_pin, new_pin: pinForm.new_pin });
    setPinForm({ current_pin: "", new_pin: "", confirm_pin: "" });
    setMessage("관리자 PIN을 변경했습니다.");
    onStatusChange("관리자 PIN을 변경했습니다.");
  }

  async function resetDatabase() {
    await api.resetDatabase(resetPin);
    setResetPin("");
    await loadData();
    setMessage("시드 기준으로 데이터를 다시 적재했습니다.");
    onStatusChange("시드 기준으로 데이터를 다시 적재했습니다.");
  }

  if (!unlocked) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6">
        <div className="w-full max-w-[460px] rounded-[32px] border p-6" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, boxShadow: "var(--c-card-shadow)" }}>
          <PinLock onUnlocked={() => setUnlocked(true)} />
        </div>
      </div>
    );
  }

  const activeSection = SECTIONS.find((entry) => entry.id === section);

  return (
    <div className="flex min-h-0 flex-1 gap-4 px-6">
      <div className="grid min-h-0 flex-1 gap-4" style={{ gridTemplateColumns: `${navCollapsed ? "64px" : "220px"} minmax(0,1fr)`, transition: "grid-template-columns 0.2s ease" }}>

        {/* ── 섹션 메뉴 사이드바 ── */}
        <section className="card flex min-h-0 flex-col overflow-hidden">
          {!navCollapsed && (
            <div className="mb-3 shrink-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: LEGACY_COLORS.muted2 }}>
                Admin Menu
              </div>
              <div className="mt-1 text-xl font-black">운영 관리</div>
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            {SECTIONS.map((entry) => {
              const Icon = entry.icon;
              const active = section === entry.id;
              return (
                <button
                  key={entry.id}
                  onClick={() => setSection(entry.id)}
                  className={`flex w-full items-center rounded-[20px] border text-left transition-colors hover:bg-white/[0.12] ${navCollapsed ? "justify-center px-0 py-3" : "gap-3 px-3 py-3"}`}
                  style={{
                    background: active ? "rgba(142,125,255,.16)" : LEGACY_COLORS.s2,
                    borderColor: active ? LEGACY_COLORS.purple : LEGACY_COLORS.border,
                  }}
                  title={navCollapsed ? entry.label : undefined}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px]" style={{ background: active ? LEGACY_COLORS.purple : LEGACY_COLORS.s1, color: active ? "#fff" : LEGACY_COLORS.muted2 }}>
                    <Icon className="h-4 w-4" />
                  </div>
                  {!navCollapsed && (
                    <div className="min-w-0">
                      <div className="text-sm font-bold truncate">{entry.label}</div>
                      <div className="mt-0.5 text-[11px] leading-4 truncate" style={{ color: LEGACY_COLORS.muted2 }}>{entry.description}</div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-3 shrink-0 space-y-2">
            <button
              onClick={() => setNavCollapsed((v) => !v)}
              className="flex w-full items-center justify-center rounded-[16px] border py-2.5 text-[11px] font-semibold transition-colors hover:bg-white/10"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
              title={navCollapsed ? "메뉴 펼치기" : "메뉴 접기"}
            >
              {navCollapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-3.5 w-3.5 mr-1" /><span>접기</span></>}
            </button>
            <button
              onClick={() => setUnlocked(false)}
              className={`w-full rounded-[16px] border py-2.5 text-[11px] font-semibold transition-colors hover:bg-white/10 ${navCollapsed ? "px-0" : "px-3"}`}
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
              title={navCollapsed ? "관리자 잠금" : undefined}
            >
              {navCollapsed ? "🔒" : "관리자 잠금"}
            </button>
          </div>
        </section>

        {/* ── 워크스페이스 (헤더 고정 + 내용 독립 스크롤) ── */}
        <section className="card flex min-h-0 flex-col overflow-hidden">
          {/* 고정 헤더 */}
          <div className="mb-4 shrink-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: LEGACY_COLORS.muted2 }}>
              Workspace
            </div>
            <div className="mt-1 text-2xl font-black">{activeSection?.label} 관리</div>
            <div className="mt-2 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
              {activeSection?.description}
            </div>
            {message ? <div className="mt-3 text-sm" style={{ color: LEGACY_COLORS.red }}>{message}</div> : null}
          </div>

          {/* 섹션별 스크롤 콘텐츠 */}
          <div className="min-h-0 flex-1 overflow-hidden">

            {/* ── 품목 관리 ── */}
            {section === "items" ? (
              <div className="grid h-full gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
                {/* 품목 목록 (독립 스크롤) */}
                <div className="flex min-h-0 flex-col rounded-[28px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                    <div className="flex items-center gap-2 rounded-[14px] border px-3 py-2" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                      <Search className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
                      <input
                        value={itemSearch}
                        onChange={(e) => setItemSearch(e.target.value)}
                        placeholder="품목명, 코드 검색"
                        className="w-full bg-transparent text-sm outline-none"
                        style={{ color: LEGACY_COLORS.text }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>{formatNumber(visibleItems.length)}건</span>
                      <button
                        onClick={() => { setAddMode(true); setSelectedItem(null); }}
                        className="rounded-full px-3 py-1 text-[11px] font-bold"
                        style={{ background: "rgba(67,211,157,.18)", color: LEGACY_COLORS.green }}
                      >
                        + 품목 추가
                      </button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {visibleItems.map((item, index) => (
                      <button
                        key={item.item_id}
                        onClick={() => setSelectedItem(item)}
                        className="block w-full px-4 py-4 text-left"
                        style={{
                          borderBottom: index === visibleItems.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                          background: selectedItem?.item_id === item.item_id ? "rgba(142,125,255,.10)" : "transparent",
                        }}
                      >
                        <div className="text-sm font-semibold">{item.item_name}</div>
                        <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{item.item_code}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 품목 추가 / 편집 패널 (독립 스크롤) */}
                <div className="overflow-y-auto rounded-[28px] border p-5" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  {addMode ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="text-base font-bold">새 품목 추가</div>
                        <button onClick={() => { setAddMode(false); setAddForm(EMPTY_ADD_FORM); }} className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>취소</button>
                      </div>
                      {[
                        { key: "item_name", label: "품목명 *", type: "text", placeholder: "예: 텅스텐 필라멘트" },
                        { key: "spec", label: "규격", type: "text", placeholder: "예: Ø0.3 × L50" },
                        { key: "initial_quantity", label: "현재 수량", type: "number", placeholder: "0" },
                        { key: "legacy_item_type", label: "자재분류", type: "text", placeholder: "예: 필라멘트, 애자" },
                        { key: "supplier", label: "공급사", type: "text", placeholder: "예: 삼성특수금속" },
                        { key: "min_stock", label: "안전재고", type: "number", placeholder: "0" },
                      ].map(({ key, label, type, placeholder }) => (
                        <div key={key}>
                          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>{label}</div>
                          <input
                            type={type}
                            min={type === "number" ? 0 : undefined}
                            value={(addForm as unknown as Record<string, string>)[key]}
                            onChange={(e) => setAddForm((f) => ({ ...f, [key]: e.target.value }))}
                            placeholder={placeholder}
                            className="w-full rounded-[18px] border px-4 py-3 text-sm outline-none"
                            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                          />
                        </div>
                      ))}
                      <div>
                        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>카테고리 *</div>
                        <select
                          value={addForm.category}
                          onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value as Item["category"] }))}
                          className="w-full rounded-[18px] border px-4 py-3 text-sm outline-none"
                          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                        >
                          {CATEGORY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>단위</div>
                        <select
                          value={addForm.unit}
                          onChange={(e) => setAddForm((f) => ({ ...f, unit: e.target.value }))}
                          className="w-full rounded-[18px] border px-4 py-3 text-sm outline-none"
                          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                        >
                          {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                      <div>
                        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                          사용 제품 <span style={{ color: LEGACY_COLORS.muted2, fontWeight: 400 }}>(ERP 기호)</span>
                        </div>
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
                                  background: checked ? LEGACY_COLORS.purple : LEGACY_COLORS.s1,
                                  borderColor: checked ? LEGACY_COLORS.purple : LEGACY_COLORS.border,
                                  color: checked ? "#fff" : LEGACY_COLORS.muted2,
                                }}
                              >
                                {label} <span style={{ opacity: 0.7 }}>({symbol})</span>
                              </button>
                            );
                          })}
                        </div>
                        {addForm.model_slots.length > 0 && (
                          <div className="mt-1.5 text-[11px]" style={{ color: LEGACY_COLORS.purple }}>
                            ERP 기호: {MODEL_SLOTS.filter((m) => addForm.model_slots.includes(m.slot)).map((m) => m.symbol).sort().join("")}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>옵션/스펙 코드</div>
                        <input
                          type="text"
                          value={addForm.option_code}
                          onChange={(e) => setAddForm((f) => ({ ...f, option_code: e.target.value.toUpperCase() }))}
                          placeholder="예: BG (블랙 유광), WM (화이트 무광)"
                          maxLength={10}
                          className="w-full rounded-[18px] border px-4 py-3 text-sm outline-none"
                          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                        />
                      </div>
                      <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>품번은 카테고리 기반으로 자동 부여됩니다. (예: RM-00972)</div>
                      <button
                        onClick={() => void addItem()}
                        className="w-full rounded-[18px] py-3 text-sm font-bold text-white"
                        style={{ background: LEGACY_COLORS.green }}
                      >
                        추가
                      </button>
                    </div>
                  ) : selectedItem ? (
                    <div className="space-y-4">
                      <div className="mb-2 text-base font-bold">{selectedItem.item_name}</div>
                      {selectedItem.erp_code && (
                        <div className="rounded-[14px] border px-4 py-3" style={{ background: "rgba(142,125,255,.08)", borderColor: LEGACY_COLORS.purple }}>
                          <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: LEGACY_COLORS.purple }}>ERP 코드</div>
                          <div className="mt-1 font-mono text-base font-bold" style={{ color: LEGACY_COLORS.text }}>{selectedItem.erp_code}</div>
                          {selectedItem.model_slots.length > 0 && (
                            <div className="mt-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                              {MODEL_SLOTS.filter((m) => selectedItem.model_slots.includes(m.slot)).map((m) => m.label).join(" · ")}
                            </div>
                          )}
                        </div>
                      )}
                      {([
                        ["item_name", selectedItem.item_name, "품목명"],
                        ["spec", selectedItem.spec || "", "사양"],
                        ["barcode", selectedItem.barcode || "", "바코드"],
                        ["legacy_model", selectedItem.legacy_model || "", "모델"],
                        ["supplier", selectedItem.supplier || "", "공급처"],
                      ] as [keyof Pick<Item, "item_name" | "spec" | "barcode" | "legacy_model" | "supplier">, string, string][]).map(([field, value, label]) => (
                        <div key={field}>
                          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>{label}</div>
                          <input
                            defaultValue={value}
                            onBlur={(event) => void saveItemField(field, event.target.value)}
                            className="w-full rounded-[18px] border px-4 py-3 text-sm outline-none"
                            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                      <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>왼쪽 목록에서 품목을 선택하면<br />정보를 수정할 수 있습니다.</div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* ── 직원 관리 ── */}
            {section === "employees" ? (
              <div className="grid h-full gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="overflow-y-auto rounded-[28px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  {employees.map((employee, index) => (
                    <button
                      key={employee.employee_id}
                      onClick={() => setSelectedEmployee(employee)}
                      className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-white/[0.12]"
                      style={{
                        borderBottom: index === employees.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                        background: selectedEmployee?.employee_id === employee.employee_id ? "rgba(142,125,255,.10)" : "transparent",
                      }}
                    >
                      <div>
                        <div className="text-sm font-semibold">{employee.name}</div>
                        <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                          {employee.employee_code} / {normalizeDepartment(employee.department)}
                        </div>
                      </div>
                      <span
                        className="inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold"
                        style={{
                          background: employee.is_active ? "rgba(67,211,157,.16)" : "rgba(255,123,123,.14)",
                          color: employee.is_active ? LEGACY_COLORS.green : LEGACY_COLORS.red,
                        }}
                      >
                        {employee.is_active ? "활성" : "비활성"}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="overflow-y-auto rounded-[28px] border p-5" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  {selectedEmployee ? (
                    <>
                      <div className="text-xl font-black">{selectedEmployee.name}</div>
                      <div className="mt-1 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                        {selectedEmployee.role} / {normalizeDepartment(selectedEmployee.department)}
                      </div>
                      <button
                        onClick={() => void toggleEmployee(selectedEmployee)}
                        className="mt-5 w-full rounded-[18px] px-4 py-3 text-sm font-bold text-white"
                        style={{ background: selectedEmployee.is_active ? LEGACY_COLORS.red : LEGACY_COLORS.green }}
                      >
                        {selectedEmployee.is_active ? "비활성으로 전환" : "활성으로 전환"}
                      </button>
                    </>
                  ) : (
                    <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>직원을 선택하면 활성 상태를 바꿀 수 있습니다.</div>
                  )}
                </div>
              </div>
            ) : null}

            {/* ── BOM 관리 ── */}
            {section === "bom" ? (
              <div className="grid h-full gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
                <div className="overflow-y-auto rounded-[28px] border p-5" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>상위 품목 선택</div>
                  <select
                    value={parentId}
                    onChange={(event) => setParentId(event.target.value)}
                    className="mb-4 w-full rounded-[18px] border px-4 py-3 text-sm outline-none"
                    style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                  >
                    {items.map((item) => (
                      <option key={item.item_id} value={item.item_id}>
                        {item.item_code} / {item.item_name}
                      </option>
                    ))}
                  </select>
                  <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>하위 자재 추가</div>
                  <div className="space-y-2">
                    {quickItems.map((item) => (
                      <button
                        key={item.item_id}
                        onClick={() => void addBomRow(item.item_id)}
                        className="block w-full rounded-[18px] border px-4 py-3 text-left text-sm"
                        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
                      >
                        {buildItemSearchLabel(item)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-y-auto rounded-[28px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  {bomRows.length === 0 ? (
                    <div className="p-5 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>BOM 항목이 없습니다. 왼쪽에서 자재를 추가하세요.</div>
                  ) : (
                    <>
                      <div className="grid grid-cols-[1fr_80px_80px_60px] border-b px-4 py-2 text-[10px] font-bold uppercase tracking-[0.15em]" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                        <span>자재명</span>
                        <span className="text-right">소요수량</span>
                        <span className="text-right">현재고</span>
                        <span className="text-right">가능</span>
                      </div>
                    {bomRows.map((row, index) => {
                      const childItem = items.find((item) => item.item_id === row.child_item_id);
                      const stock = Number(childItem?.quantity ?? 0);
                      const capacity = row.quantity > 0 ? Math.floor(stock / row.quantity) : 0;
                      return (
                      <div
                        key={row.bom_id}
                        className="grid grid-cols-[1fr_80px_80px_60px] items-center px-4 py-3"
                        style={{ borderBottom: index === bomRows.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}
                      >
                        <div>
                          <div className="text-sm font-semibold">{childItem?.item_name || row.child_item_id}</div>
                          <div className="mt-0.5 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>{childItem?.item_code}</div>
                        </div>
                        <div className="text-right font-mono text-sm">{formatNumber(row.quantity)} {row.unit}</div>
                        <div className="text-right font-mono text-sm" style={{ color: stock > 0 ? LEGACY_COLORS.green : LEGACY_COLORS.red }}>{formatNumber(stock)}</div>
                        <div className="flex items-center justify-end gap-2">
                          <span className="font-mono text-sm font-bold" style={{ color: capacity > 0 ? LEGACY_COLORS.cyan : LEGACY_COLORS.muted2 }}>{formatNumber(capacity)}</span>
                          <button
                            onClick={() => void api.deleteBOM(row.bom_id).then(() => setBomRows((current) => current.filter((entry) => entry.bom_id !== row.bom_id)))}
                            className="text-xs font-semibold"
                            style={{ color: LEGACY_COLORS.red }}
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    );
                    })}
                    </>
                  )}
                </div>
              </div>
            ) : null}

            {/* ── 출하묶음 ── */}
            {section === "packages" ? (
              <div className="grid h-full gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
                <div className="flex min-h-0 flex-col gap-3">
                  <button
                    onClick={() => void createSimplePackage()}
                    className="w-full shrink-0 rounded-[18px] px-4 py-3 text-sm font-bold text-white"
                    style={{ background: LEGACY_COLORS.blue }}
                  >
                    새 출하묶음 생성
                  </button>
                  <div className="overflow-y-auto rounded-[28px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                    {packages.map((pkg, index) => (
                      <button
                        key={pkg.package_id}
                        onClick={() => setSelectedPackage(pkg)}
                        className="block w-full px-4 py-4 text-left"
                        style={{
                          borderBottom: index === packages.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                          background: selectedPackage?.package_id === pkg.package_id ? "rgba(142,125,255,.10)" : "transparent",
                        }}
                      >
                        <div className="text-sm font-semibold">{pkg.name}</div>
                        <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{pkg.package_code} / {pkg.items.length}종</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-y-auto rounded-[28px] border p-5" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  {selectedPackage ? (
                    <>
                      <div className="text-xl font-black">{selectedPackage.name}</div>
                      <div className="mt-1 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>{selectedPackage.package_code}</div>
                      <div className="mt-4 space-y-2">
                        {selectedPackage.items.map((item) => (
                          <div key={item.package_item_id} className="rounded-[18px] border px-4 py-3" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                            <div className="text-sm font-semibold">{item.item_name}</div>
                            <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{formatNumber(item.quantity)} {item.item_unit}</div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 space-y-2">
                        {quickItems.map((item) => (
                          <button
                            key={item.item_id}
                            onClick={() => void addPackageItem(item.item_id)}
                            className="block w-full rounded-[18px] border px-4 py-3 text-left text-sm"
                            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
                          >
                            {buildItemSearchLabel(item)}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>왼쪽 목록에서 출하묶음을 선택해 주세요.</div>
                  )}
                </div>
              </div>
            ) : null}

            {/* ── 설정 ── */}
            {section === "settings" ? (
              <div className="overflow-y-auto">
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-[28px] border p-5" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                    <div className="mb-4 flex items-center gap-2 text-sm font-bold">
                      <KeyRound className="h-4 w-4" /> 관리자 PIN 변경
                    </div>
                    {(Object.entries(pinForm) as [keyof typeof pinForm, string][]).map(([key, value]) => (
                      <input
                        key={key}
                        type="password"
                        value={value}
                        onChange={(event) => setPinForm((current) => ({ ...current, [key]: event.target.value }))}
                        placeholder={key === "current_pin" ? "현재 PIN" : key === "new_pin" ? "새 PIN" : "새 PIN 확인"}
                        className="mb-3 w-full rounded-[18px] border px-4 py-3 text-sm outline-none"
                        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                      />
                    ))}
                    <button
                      onClick={() => void changePin()}
                      className="w-full rounded-[18px] px-4 py-3 text-sm font-bold text-white"
                      style={{ background: LEGACY_COLORS.blue }}
                    >
                      PIN 저장
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[28px] border p-5" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                      <div className="mb-4 flex items-center gap-2 text-sm font-bold">
                        <FileDown className="h-4 w-4" /> 엑셀 내보내기
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <a href={api.getItemsExportUrl()} download className="rounded-[18px] border px-4 py-3 text-center text-sm font-semibold" style={{ borderColor: LEGACY_COLORS.border }}>
                          품목 엑셀
                        </a>
                        <a href={api.getTransactionsExportUrl()} download className="rounded-[18px] border px-4 py-3 text-center text-sm font-semibold" style={{ borderColor: LEGACY_COLORS.border }}>
                          거래 엑셀
                        </a>
                      </div>
                    </div>

                    <div className="rounded-[28px] border p-5" style={{ background: "rgba(255,123,123,.08)", borderColor: "rgba(255,123,123,.24)" }}>
                      <div className="mb-4 flex items-center gap-2 text-sm font-bold" style={{ color: LEGACY_COLORS.red }}>
                        <DatabaseBackup className="h-4 w-4" /> 안전 초기화
                      </div>
                      <input
                        type="password"
                        value={resetPin}
                        onChange={(event) => setResetPin(event.target.value)}
                        placeholder="관리자 PIN"
                        className="mb-3 w-full rounded-[18px] border px-4 py-3 text-sm outline-none"
                        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                      />
                      <button
                        onClick={() => void resetDatabase()}
                        className="w-full rounded-[18px] px-4 py-3 text-sm font-bold text-white"
                        style={{ background: LEGACY_COLORS.red }}
                      >
                        시드 기준으로 다시 적재
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <DesktopRightPanel title="관리 요약" subtitle="현재 작업 중인 관리자 영역의 핵심 수치를 요약합니다.">
        <div className="space-y-4">
          <div className="rounded-[28px] border p-5 text-sm leading-6" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            {section === "items" && "품목 섹션에서는 이름, 바코드, 공급처, 모델 정보를 바로 수정할 수 있습니다."}
            {section === "employees" && "직원 섹션에서는 직원의 운영 상태를 빠르게 전환할 수 있습니다."}
            {section === "bom" && "BOM 섹션에서는 상위 품목을 기준으로 하위 자재를 추가하거나 제거할 수 있습니다."}
            {section === "packages" && "출하묶음 섹션에서는 패키지를 만들고 구성 품목을 빠르게 추가할 수 있습니다."}
            {section === "settings" && "설정 섹션에서는 관리자 PIN 변경, CSV 내보내기, 초기화를 관리합니다."}
          </div>
          <div className="rounded-[28px] border p-5" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: LEGACY_COLORS.muted2 }}>
              현재 상태
            </div>
            <div className="space-y-2 text-sm">
              <div>품목 {formatNumber(items.length)}건</div>
              <div>직원 {formatNumber(employees.length)}명</div>
              <div>출하묶음 {formatNumber(packages.length)}건</div>
              <div>BOM {formatNumber(bomRows.length)}건</div>
              <div>부서 {formatNumber(Object.keys(DEPARTMENT_LABELS).length)}개</div>
            </div>
          </div>
        </div>
      </DesktopRightPanel>
    </div>
  );
}
