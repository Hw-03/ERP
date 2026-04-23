"use client";

import type { ElementType } from "react";
import { useEffect, useMemo, useState } from "react";
import { Check, DatabaseBackup, FileDown, KeyRound, Layers, PackagePlus, Search, Settings2, ShieldCheck, Trash2, Users, X } from "lucide-react";
import { api, type BOMDetailEntry, type BOMEntry, type Employee, type Item, type ProductModel, type ShipPackage } from "@/lib/api";
import { DesktopRightPanel } from "./DesktopRightPanel";
import { PinLock } from "./PinLock";
import { DEPARTMENT_LABELS, LEGACY_COLORS, buildItemSearchLabel, formatNumber, normalizeDepartment } from "./legacyUi";

type AdminSection = "items" | "employees" | "models" | "bom" | "packages" | "export" | "settings";

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

const PKG_CATEGORY_OPTIONS = [
  { value: "ALL", label: "전체" },
  { value: "RM",  label: "RM"  },
  { value: "?A",  label: "?A"  },
  { value: "?F",  label: "?F"  },
  { value: "FG",  label: "FG"  },
];

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
  { id: "models", label: "모델", description: "제품 모델 추가/삭제", icon: Layers },
  { id: "items", label: "품목", description: "품목 기본 정보 수정", icon: PackagePlus },
  { id: "employees", label: "직원", description: "직원 활성 상태 관리", icon: Users },
  { id: "bom", label: "BOM", description: "부모-자식 자재 구성", icon: Settings2 },
  { id: "packages", label: "출하묶음", description: "패키지 구성 관리", icon: ShieldCheck },
  { id: "export", label: "내보내기", description: "엑셀 데이터 내보내기", icon: FileDown },
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

  const [items, setItems] = useState<Item[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [productModels, setProductModels] = useState<ProductModel[]>([]);
  const [modelAddName, setModelAddName] = useState("");
  const [modelAddSymbol, setModelAddSymbol] = useState("");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [empAddMode, setEmpAddMode] = useState(false);
  const [empAddForm, setEmpAddForm] = useState({ employee_code: "", name: "", role: "", phone: "", department: "조립" });
  const [selectedPackage, setSelectedPackage] = useState<ShipPackage | null>(null);
  const [parentId, setParentId] = useState("");
  const [bomRows, setBomRows] = useState<BOMEntry[]>([]);
  const [bomParentSearch, setBomParentSearch] = useState("");
  const [bomParentCat, setBomParentCat] = useState("ALL");
  const [bomChildSearch, setBomChildSearch] = useState("");
  const [editingBomId, setEditingBomId] = useState<string | null>(null);
  const [editingQty, setEditingQty] = useState("");
  const [allBomRows, setAllBomRows] = useState<BOMDetailEntry[]>([]);
  const [pendingChildId, setPendingChildId] = useState<string | null>(null);
  const [pendingChildQty, setPendingChildQty] = useState("1");
  const [bomChildCat, setBomChildCat] = useState("ALL");
  const [message, setMessage] = useState("");
  const [pinForm, setPinForm] = useState({ current_pin: "", new_pin: "", confirm_pin: "" });
  const [resetPin, setResetPin] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [pkgRenaming, setPkgRenaming] = useState(false);
  const [pkgNameDraft, setPkgNameDraft] = useState("");
  const [pkgItemSearch, setPkgItemSearch] = useState("");
  const [pkgItemQtyMap, setPkgItemQtyMap] = useState<Record<string, number>>({});
  const [pkgItemCategory, setPkgItemCategory] = useState("ALL");

  async function loadData() {
    setMessage("");
    const [nextItems, nextEmployees, nextPackages, nextModels] = await Promise.all([
      api.getItems({ limit: 2000, search: globalSearch.trim() || undefined }),
      api.getEmployees(),
      api.getShipPackages(),
      api.getModels(),
    ]);
    setItems(nextItems);
    setEmployees(nextEmployees);
    setPackages(nextPackages);
    setProductModels(nextModels);
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

  function refreshAllBom() {
    void api.getAllBOM().then(setAllBomRows).catch(() => setAllBomRows([]));
  }

  useEffect(() => {
    if (!unlocked) return;
    refreshAllBom();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  const visibleItems = useMemo(() => {
    const keyword = `${globalSearch} ${itemSearch}`.trim().toLowerCase();
    if (!keyword) return items.slice(0, 200);
    return items.filter((item) => `${item.item_name} ${item.erp_code}`.toLowerCase().includes(keyword)).slice(0, 200);
  }, [globalSearch, itemSearch, items]);

  const filteredPkgItems = useMemo(() => {
    const kw = pkgItemSearch.trim().toLowerCase();
    const A_SET = new Set(["TA", "HA", "VA", "BA"]);
    const F_SET = new Set(["TF", "HF", "VF", "AF"]);
    return items
      .filter((i) => {
        if (pkgItemCategory === "ALL") return true;
        if (pkgItemCategory === "?A") return A_SET.has(i.category);
        if (pkgItemCategory === "?F") return F_SET.has(i.category);
        return i.category === pkgItemCategory;
      })
      .filter((i) => !kw || `${i.item_name} ${i.erp_code ?? ""}`.toLowerCase().includes(kw))
      .slice(0, 40);
  }, [items, pkgItemSearch, pkgItemCategory]);

  const BOM_PARENT_CATS = ["ALL", "BA", "HA", "VA", "TA", "AF", "TF", "FG"];
  const BOM_CHILD_CATS = ["ALL", "RM", "?A", "?F"];
  const A_CATS = new Set(["TA", "HA", "VA", "BA"]);
  const F_CATS = new Set(["TF", "HF", "VF", "AF"]);

  const bomParentItems = useMemo(() => {
    let pool = items.filter((i) => i.category !== "RM");
    if (bomParentCat !== "ALL") pool = pool.filter((i) => i.category === bomParentCat);
    const kw = bomParentSearch.trim().toLowerCase();
    if (kw) pool = pool.filter((i) => `${i.item_name} ${i.erp_code ?? ""}`.toLowerCase().includes(kw));
    return pool.slice(0, 100);
  }, [items, bomParentSearch, bomParentCat]);

  const bomChildItems = useMemo(() => {
    const kw = bomChildSearch.trim().toLowerCase();
    const existingIds = new Set(bomRows.map((r) => r.child_item_id));
    return items
      .filter((i) => i.item_id !== parentId)
      .filter((i) => {
        if (bomChildCat === "RM") return i.category === "RM";
        if (bomChildCat === "?A") return A_CATS.has(i.category);
        if (bomChildCat === "?F") return F_CATS.has(i.category);
        return true;
      })
      .filter((i) => !kw || `${i.item_name} ${i.erp_code ?? ""}`.toLowerCase().includes(kw))
      .slice(0, 60)
      .map((i) => ({ ...i, alreadyIn: existingIds.has(i.item_id) }));
  }, [items, parentId, bomChildSearch, bomChildCat, bomRows]);

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
      onStatusChange(`'${created.item_name}' 품목이 추가됐습니다. (${created.erp_code})`);
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

  async function addEmployee() {
    if (!empAddForm.employee_code.trim() || !empAddForm.name.trim()) {
      setMessage("직원코드와 이름은 필수입니다.");
      return;
    }
    try {
      const created = await api.createEmployee({
        employee_code: empAddForm.employee_code.trim(),
        name: empAddForm.name.trim(),
        role: empAddForm.role.trim(),
        department: empAddForm.department as Employee["department"],
        phone: empAddForm.phone.trim() || undefined,
        display_order: employees.length + 1,
      });
      setEmployees((current) => [...current, created]);
      setEmpAddMode(false);
      setEmpAddForm({ employee_code: "", name: "", role: "", phone: "", department: "조립" });
      setSelectedEmployee(created);
      onStatusChange(`'${created.name}' 직원을 추가했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "직원 추가에 실패했습니다.");
    }
  }

  async function toggleEmployee(employee: Employee) {
    const updated = await api.updateEmployee(employee.employee_id, { is_active: !employee.is_active });
    setEmployees((current) => current.map((entry) => (entry.employee_id === employee.employee_id ? updated : entry)));
    setSelectedEmployee(updated);
    onStatusChange(`${updated.name} 직원 상태를 변경했습니다.`);
  }

  async function createSimplePackage() {
    try {
      const created = await api.createShipPackage({
        package_code: `PKG-${Date.now()}`,
        name: `출하묶음 ${packages.length + 1}`,
      });
      const newPkg = { ...created, items: [] as ShipPackage["items"] };
      setPackages((current) => [...current, newPkg]);
      setSelectedPackage(newPkg);
      onStatusChange(`${created.name} 출하묶음을 생성했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "출하묶음 생성에 실패했습니다.");
    }
  }

  async function addPackageItem(itemId: string) {
    if (!selectedPackage) return;
    const qty = pkgItemQtyMap[itemId] ?? 1;
    const updated = await api.addShipPackageItem(selectedPackage.package_id, { item_id: itemId, quantity: qty });
    setPackages((current) => current.map((entry) => (entry.package_id === updated.package_id ? updated : entry)));
    setSelectedPackage(updated);
    onStatusChange(`${updated.name}에 품목을 추가했습니다.`);
  }

  async function renamePackage() {
    if (!selectedPackage || !pkgNameDraft.trim()) return;
    try {
      const updated = await api.updateShipPackage(selectedPackage.package_id, { name: pkgNameDraft.trim() });
      const newPkg = { ...updated, items: selectedPackage.items };
      setPackages((current) => current.map((entry) => (entry.package_id === newPkg.package_id ? newPkg : entry)));
      setSelectedPackage(newPkg);
      setPkgRenaming(false);
      onStatusChange(`출하묶음 이름을 '${newPkg.name}'으로 변경했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "이름 변경에 실패했습니다.");
    }
  }

  async function removePackageItem(packageItemId: string) {
    if (!selectedPackage) return;
    try {
      const updated = await api.deleteShipPackageItem(selectedPackage.package_id, packageItemId);
      setPackages((current) => current.map((entry) => (entry.package_id === updated.package_id ? updated : entry)));
      setSelectedPackage(updated);
      onStatusChange("품목을 출하묶음에서 제거했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "품목 제거에 실패했습니다.");
    }
  }

  async function deletePackage(packageId: string) {
    try {
      await api.deleteShipPackage(packageId);
      setPackages((current) => current.filter((entry) => entry.package_id !== packageId));
      if (selectedPackage?.package_id === packageId) setSelectedPackage(null);
      onStatusChange("출하묶음을 삭제했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "출하묶음 삭제에 실패했습니다.");
    }
  }

  async function addBomRowDirect(childId: string, qty: number) {
    if (!parentId) return;
    try {
      const created = await api.createBOM({ parent_item_id: parentId, child_item_id: childId, quantity: qty, unit: "EA" });
      setBomRows((current) => [...current, created]);
      setPendingChildId(null);
      setPendingChildQty("1");
      refreshAllBom();
      onStatusChange("BOM 항목을 추가했습니다.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "추가에 실패했습니다.");
    }
  }

  async function saveBomQty(row: BOMEntry) {
    const qty = parseFloat(editingQty);
    setEditingBomId(null);
    if (!qty || qty === row.quantity) return;
    try {
      const updated = await api.updateBOM(row.bom_id, { quantity: qty });
      setBomRows((current) => current.map((r) => (r.bom_id === updated.bom_id ? updated : r)));
      onStatusChange("수량을 변경했습니다.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "수량 변경에 실패했습니다.");
    }
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

  const SETTINGS_ENTRY = { id: "settings" as AdminSection, label: "설정", description: "PIN, CSV, 초기화", icon: KeyRound };
  const activeSection = SECTIONS.find((entry) => entry.id === section) ?? (section === "settings" ? SETTINGS_ENTRY : undefined);

  return (
    <div className="flex min-h-0 flex-1 gap-4 pl-0 pr-4">
      <div className="grid min-h-0 flex-1 gap-4" style={{ gridTemplateColumns: "220px minmax(0,1fr)", transition: "grid-template-columns 0.2s ease" }}>

        {/* ── 섹션 메뉴 사이드바 ── */}
        <section className="card flex min-h-0 flex-col overflow-hidden">
          <div className="mb-3 shrink-0">
            <div className="text-sm font-bold uppercase tracking-[0.22em]" style={{ color: LEGACY_COLORS.muted2 }}>
              Admin Menu
            </div>
            <div className="mt-1 text-xl font-black">운영 관리</div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            {SECTIONS.map((entry) => {
              const Icon = entry.icon;
              const active = section === entry.id;
              return (
                <button
                  key={entry.id}
                  onClick={() => setSection(entry.id)}
                  className="flex w-full items-center gap-3 rounded-[20px] border px-3 py-3 text-left transition-colors hover:bg-white/[0.12]"
                  style={{
                    background: active ? "rgba(142,125,255,.16)" : LEGACY_COLORS.s2,
                    borderColor: active ? LEGACY_COLORS.purple : LEGACY_COLORS.border,
                  }}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px]" style={{ background: active ? LEGACY_COLORS.purple : LEGACY_COLORS.s1, color: active ? "#fff" : LEGACY_COLORS.muted2 }}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-base font-bold truncate">{entry.label}</div>
                    <div className="mt-0.5 text-xs leading-4 truncate" style={{ color: LEGACY_COLORS.muted2 }}>{entry.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-3 shrink-0 flex flex-col gap-2">
            <button
              onClick={() => setSection("settings")}
              className="flex w-full items-center gap-3 rounded-[20px] border px-3 py-3 text-left transition-colors hover:bg-white/[0.12]"
              style={{
                background: section === "settings" ? "rgba(142,125,255,.16)" : LEGACY_COLORS.s2,
                borderColor: section === "settings" ? LEGACY_COLORS.purple : LEGACY_COLORS.border,
              }}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px]" style={{ background: section === "settings" ? LEGACY_COLORS.purple : LEGACY_COLORS.s1, color: section === "settings" ? "#fff" : LEGACY_COLORS.muted2 }}>
                <KeyRound className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-bold truncate">설정</div>
                <div className="mt-0.5 text-xs leading-4 truncate" style={{ color: LEGACY_COLORS.muted2 }}>PIN, CSV, 초기화</div>
              </div>
            </button>
            <button
              onClick={() => setUnlocked(false)}
              className="w-full rounded-[16px] border px-3 py-2.5 text-xs font-semibold transition-colors hover:bg-white/10"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
            >
              관리자 잠금
            </button>
          </div>
        </section>

        {/* ── 워크스페이스 (헤더 고정 + 내용 독립 스크롤) ── */}
        <section className="card flex min-h-0 flex-col overflow-hidden">
          {/* 고정 헤더 */}
          <div className="mb-4 shrink-0">
            <div className="text-sm font-bold uppercase tracking-[0.22em]" style={{ color: LEGACY_COLORS.muted2 }}>
              Workspace
            </div>
            <div className="mt-1 text-2xl font-black">{activeSection?.label} 관리</div>
            <div className="mt-2 text-base" style={{ color: LEGACY_COLORS.muted2 }}>
              {activeSection?.description}
            </div>
            {message ? <div className="mt-3 text-base" style={{ color: LEGACY_COLORS.red }}>{message}</div> : null}
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
                        className="w-full bg-transparent text-base outline-none"
                        style={{ color: LEGACY_COLORS.text }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{formatNumber(visibleItems.length)}건</span>
                      <button
                        onClick={() => { setAddMode(true); setSelectedItem(null); }}
                        className="rounded-full px-3 py-1 text-xs font-bold"
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
                        <div className="text-base font-semibold">{item.item_name}</div>
                        <div className="mt-1 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>{item.erp_code}</div>
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
                        <button onClick={() => { setAddMode(false); setAddForm(EMPTY_ADD_FORM); }} className="flex items-center justify-center rounded-full p-1 hover:bg-red-500/10" style={{ color: LEGACY_COLORS.red }}><X className="h-4 w-4" /></button>
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
                          <div className="mb-2 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>{label}</div>
                          <input
                            type={type}
                            min={type === "number" ? 0 : undefined}
                            value={(addForm as unknown as Record<string, string>)[key]}
                            onChange={(e) => setAddForm((f) => ({ ...f, [key]: e.target.value }))}
                            placeholder={placeholder}
                            className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
                            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                          />
                        </div>
                      ))}
                      <div>
                        <div className="mb-2 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>카테고리 *</div>
                        <select
                          value={addForm.category}
                          onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value as Item["category"] }))}
                          className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
                          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                        >
                          {CATEGORY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <div className="mb-2 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>단위</div>
                        <select
                          value={addForm.unit}
                          onChange={(e) => setAddForm((f) => ({ ...f, unit: e.target.value }))}
                          className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
                          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                        >
                          {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                      <div>
                        <div className="mb-2 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
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
                                className="rounded-full border px-3 py-1.5 text-sm font-bold transition-colors"
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
                          <div className="mt-1.5 text-xs" style={{ color: LEGACY_COLORS.purple }}>
                            ERP 기호: {MODEL_SLOTS.filter((m) => addForm.model_slots.includes(m.slot)).map((m) => m.symbol).sort().join("")}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="mb-2 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>옵션/스펙 코드</div>
                        <input
                          type="text"
                          value={addForm.option_code}
                          onChange={(e) => setAddForm((f) => ({ ...f, option_code: e.target.value.toUpperCase() }))}
                          placeholder="예: BG (블랙 유광), WM (화이트 무광)"
                          maxLength={10}
                          className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
                          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                        />
                      </div>
                      <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>품번은 카테고리 기반으로 자동 부여됩니다. (예: RM-00972)</div>
                      <button
                        onClick={() => void addItem()}
                        className="w-full rounded-[18px] py-3 text-base font-bold text-white"
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
                          <div className="text-sm font-bold uppercase tracking-[0.2em]" style={{ color: LEGACY_COLORS.purple }}>ERP 코드</div>
                          <div className="mt-1 font-mono text-base font-bold" style={{ color: LEGACY_COLORS.text }}>{selectedItem.erp_code}</div>
                          {selectedItem.model_slots.length > 0 && (
                            <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
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
                          <div className="mb-2 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>{label}</div>
                          <input
                            defaultValue={value}
                            onBlur={(event) => void saveItemField(field, event.target.value)}
                            className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
                            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                      <div className="text-base" style={{ color: LEGACY_COLORS.muted2 }}>왼쪽 목록에서 품목을 선택하면<br />정보를 수정할 수 있습니다.</div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* ── 직원 관리 ── */}
            {section === "employees" ? (
              <div className="grid h-full gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="flex flex-col overflow-hidden rounded-[28px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                    <button
                      onClick={() => { setEmpAddMode(true); setSelectedEmployee(null); }}
                      className="w-full rounded-[14px] border border-dashed py-2.5 text-base font-bold"
                      style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
                    >
                      + 직원 추가
                    </button>
                  </div>
                  <div className="overflow-y-auto">
                    {employees.map((employee, index) => (
                      <button
                        key={employee.employee_id}
                        onClick={() => { setSelectedEmployee(employee); setEmpAddMode(false); }}
                        className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-white/[0.12]"
                        style={{
                          borderBottom: index === employees.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                          background: selectedEmployee?.employee_id === employee.employee_id ? "rgba(142,125,255,.10)" : "transparent",
                        }}
                      >
                        <div>
                          <div className="text-base font-semibold">{employee.name}</div>
                          <div className="mt-1 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                            {employee.employee_code} / {normalizeDepartment(employee.department)}
                          </div>
                        </div>
                        <span
                          className="inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-bold"
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
                </div>

                <div className="overflow-y-auto rounded-[28px] border p-5" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  {empAddMode ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="text-base font-bold">직원 추가</div>
                        <button onClick={() => { setEmpAddMode(false); setEmpAddForm({ employee_code: "", name: "", role: "", phone: "", department: "조립" }); }} className="flex items-center justify-center rounded-full p-1 hover:bg-red-500/10" style={{ color: LEGACY_COLORS.red }}><X className="h-4 w-4" /></button>
                      </div>
                      {([
                        { key: "employee_code", label: "직원 코드 *", placeholder: "예: E27" },
                        { key: "name", label: "이름 *", placeholder: "예: 홍길동" },
                        { key: "role", label: "역할", placeholder: "예: 조립/사원" },
                        { key: "phone", label: "연락처", placeholder: "예: 010-0000-0000" },
                      ] as { key: keyof typeof empAddForm; label: string; placeholder: string }[]).map(({ key, label, placeholder }) => (
                        <div key={key}>
                          <div className="mb-2 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>{label}</div>
                          <input
                            type="text"
                            value={empAddForm[key]}
                            onChange={(e) => setEmpAddForm((f) => ({ ...f, [key]: e.target.value }))}
                            placeholder={placeholder}
                            className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
                            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                          />
                        </div>
                      ))}
                      <div>
                        <div className="mb-2 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>부서</div>
                        <select
                          value={empAddForm.department}
                          onChange={(e) => setEmpAddForm((f) => ({ ...f, department: e.target.value }))}
                          className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
                          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                        >
                          {Object.keys(DEPARTMENT_LABELS).map((value) => (
                            <option key={value} value={value}>{DEPARTMENT_LABELS[value]}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={() => void addEmployee()}
                        className="w-full rounded-[18px] px-4 py-3 text-base font-bold text-white"
                        style={{ background: LEGACY_COLORS.blue }}
                      >
                        추가
                      </button>
                    </div>
                  ) : selectedEmployee ? (
                    <>
                      <div className="text-xl font-black">{selectedEmployee.name}</div>
                      <div className="mt-1 text-base" style={{ color: LEGACY_COLORS.muted2 }}>
                        {selectedEmployee.role} / {normalizeDepartment(selectedEmployee.department)}
                      </div>
                      <button
                        onClick={() => void toggleEmployee(selectedEmployee)}
                        className="mt-5 w-full rounded-[18px] px-4 py-3 text-base font-bold text-white"
                        style={{ background: selectedEmployee.is_active ? LEGACY_COLORS.red : LEGACY_COLORS.green }}
                      >
                        {selectedEmployee.is_active ? "비활성으로 전환" : "활성으로 전환"}
                      </button>
                    </>
                  ) : (
                    <div className="text-base" style={{ color: LEGACY_COLORS.muted2 }}>직원을 선택하면 활성 상태를 바꿀 수 있습니다.</div>
                  )}
                </div>
              </div>
            ) : null}

            {/* ── BOM 관리 ── */}
            {section === "bom" ? (
              <div className="grid h-full gap-3" style={{ gridTemplateColumns: "300px minmax(0,1fr)" }}>

                {/* 좌측: 상위 품목 선택 */}
                <div className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                    <div className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>상위 품목 선택</div>
                    <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>RM 제외 · {bomParentItems.length}건 표시</div>
                  </div>
                  <div className="shrink-0 px-3 pt-3">
                    <input
                      value={bomParentSearch}
                      onChange={(e) => setBomParentSearch(e.target.value)}
                      placeholder="품목명 / ERP 코드 검색"
                      className="mb-2 w-full rounded-[12px] border px-3 py-1.5 text-sm outline-none"
                      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                    />
                    <div className="mb-2 flex flex-wrap gap-1">
                      {BOM_PARENT_CATS.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setBomParentCat(cat)}
                          className="rounded-full px-2 py-0.5 text-xs font-bold"
                          style={{
                            background: bomParentCat === cat ? LEGACY_COLORS.blue : LEGACY_COLORS.s1,
                            color: bomParentCat === cat ? "#fff" : LEGACY_COLORS.muted2,
                            border: `1px solid ${LEGACY_COLORS.border}`,
                          }}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="min-h-0 overflow-y-auto">
                    {bomParentItems.map((item, index) => (
                      <button
                        key={item.item_id}
                        onClick={() => { setParentId(item.item_id); setPendingChildId(null); setBomChildSearch(""); setBomChildCat("ALL"); }}
                        className="block w-full px-3 py-2.5 text-left transition-colors"
                        style={{
                          background: parentId === item.item_id ? "rgba(79,142,247,.14)" : "transparent",
                          borderBottom: index === bomParentItems.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 rounded px-1 py-0.5 font-mono text-xs font-bold" style={{ background: "rgba(79,142,247,.12)", color: LEGACY_COLORS.blue }}>{item.category}</span>
                          <div className="truncate text-sm font-medium" style={{ color: parentId === item.item_id ? LEGACY_COLORS.blue : LEGACY_COLORS.text }}>{item.item_name}</div>
                        </div>
                        <div className="mt-0.5 font-mono text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{item.erp_code}</div>
                      </button>
                    ))}
                    {bomParentItems.length === 0 && (
                      <div className="px-4 py-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>결과 없음</div>
                    )}
                  </div>
                </div>

                {/* 우측: BOM 상세 */}
                <div className="flex min-h-0 flex-col gap-3">

                  {/* 하위 품목 추가 카드 */}
                  <div className="shrink-0 overflow-hidden rounded-[28px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                    {!parentId ? (
                      <div className="px-5 py-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>← 좌측에서 상위 품목을 선택하세요</div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                          <div>
                            <span className="mr-2 rounded px-1.5 py-0.5 font-mono text-xs font-bold" style={{ background: "rgba(79,142,247,.12)", color: LEGACY_COLORS.blue }}>
                              {items.find((i) => i.item_id === parentId)?.category}
                            </span>
                            <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>{items.find((i) => i.item_id === parentId)?.item_name ?? "-"}</span>
                            <span className="ml-2 font-mono text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{items.find((i) => i.item_id === parentId)?.erp_code}</span>
                          </div>
                          <span className="text-xs font-medium" style={{ color: LEGACY_COLORS.muted2 }}>하위 {bomRows.length}개</span>
                        </div>
                        <div className="px-4 pb-3 pt-3">
                          <div className="text-sm font-bold uppercase tracking-[0.15em] mb-2" style={{ color: LEGACY_COLORS.muted2 }}>하위 품목 추가</div>
                          <div className="flex items-center gap-2 mb-2">
                            <input
                              value={bomChildSearch}
                              onChange={(e) => { setBomChildSearch(e.target.value); setPendingChildId(null); }}
                              placeholder="품목명 / ERP 코드"
                              className="flex-1 rounded-[12px] border px-3 py-1.5 text-sm outline-none"
                              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                            />
                            <div className="flex gap-1 shrink-0">
                              {BOM_CHILD_CATS.map((cat) => (
                                <button
                                  key={cat}
                                  onClick={() => setBomChildCat(cat)}
                                  className="rounded-full px-2 py-1 text-xs font-bold"
                                  style={{
                                    background: bomChildCat === cat ? LEGACY_COLORS.blue : LEGACY_COLORS.s1,
                                    color: bomChildCat === cat ? "#fff" : LEGACY_COLORS.muted2,
                                    border: `1px solid ${LEGACY_COLORS.border}`,
                                  }}
                                >
                                  {cat}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="max-h-44 overflow-y-auto rounded-[16px] border" style={{ borderColor: LEGACY_COLORS.border }}>
                            {bomChildItems.length === 0 ? (
                              <div className="px-4 py-3 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>결과 없음</div>
                            ) : (
                              bomChildItems.map((item, index) => (
                                <div key={item.item_id} style={{ borderBottom: index === bomChildItems.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}>
                                  <button
                                    disabled={item.alreadyIn}
                                    onClick={() => { if (!item.alreadyIn) setPendingChildId(pendingChildId === item.item_id ? null : item.item_id); }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left"
                                    style={{
                                      background: pendingChildId === item.item_id ? "rgba(79,142,247,.10)" : "transparent",
                                      opacity: item.alreadyIn ? 0.45 : 1,
                                    }}
                                  >
                                    <span className="shrink-0 rounded px-1 py-0.5 font-mono text-xs font-bold" style={{ background: "rgba(79,142,247,.10)", color: LEGACY_COLORS.blue }}>{item.category}</span>
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-sm" style={{ color: LEGACY_COLORS.text }}>{item.item_name}</div>
                                      <div className="font-mono text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{item.erp_code}</div>
                                    </div>
                                    {item.alreadyIn && <span className="shrink-0 rounded-full px-1.5 py-0.5 text-xs font-bold" style={{ background: "rgba(31,209,122,.15)", color: LEGACY_COLORS.green }}>추가됨</span>}
                                  </button>
                                  {pendingChildId === item.item_id && (
                                    <div className="flex items-center gap-2 bg-blue-500/5 px-3 py-2">
                                      <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>소요량</span>
                                      <input
                                        autoFocus
                                        type="number"
                                        min="0.001"
                                        step="1"
                                        value={pendingChildQty}
                                        onChange={(e) => setPendingChildQty(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") void addBomRowDirect(item.item_id, parseFloat(pendingChildQty) || 1); }}
                                        className="w-20 rounded-[10px] border px-2 py-1 text-right text-sm font-mono outline-none"
                                        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.blue, color: LEGACY_COLORS.text }}
                                      />
                                      <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>EA</span>
                                      <button
                                        onClick={() => void addBomRowDirect(item.item_id, parseFloat(pendingChildQty) || 1)}
                                        className="ml-auto rounded-[10px] px-3 py-1 text-xs font-bold text-white"
                                        style={{ background: LEGACY_COLORS.blue }}
                                      >
                                        추가
                                      </button>
                                      <button
                                        onClick={() => setPendingChildId(null)}
                                        className="rounded-[10px] px-2 py-1 text-xs"
                                        style={{ color: LEGACY_COLORS.muted2 }}
                                      >
                                        취소
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* BOM 목록 테이블 */}
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                    {parentId ? (
                      <>
                        <div className="shrink-0 border-b px-5 py-3 text-sm font-bold uppercase tracking-[0.18em]" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                          구성 자재 목록
                        </div>
                        {bomRows.length === 0 ? (
                          <div className="p-5 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>등록된 BOM 항목이 없습니다.</div>
                        ) : (
                          <div className="min-h-0 overflow-y-auto">
                            <div className="grid items-center border-b px-5 py-2 text-sm font-bold uppercase tracking-[0.15em]"
                              style={{ gridTemplateColumns: "36px 1fr 120px 100px 80px 80px 40px", borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                              <span>구분</span>
                              <span>자재명</span>
                              <span className="text-right">ERP 코드</span>
                              <span className="text-right">소요량</span>
                              <span className="text-right">재고</span>
                              <span className="text-right">가능수량</span>
                              <span />
                            </div>
                            {bomRows.map((row, index) => {
                              const childItem = items.find((item) => item.item_id === row.child_item_id);
                              const stock = Number(childItem?.quantity ?? 0);
                              const capacity = row.quantity > 0 ? Math.floor(stock / Number(row.quantity)) : 0;
                              return (
                                <div
                                  key={row.bom_id}
                                  className="grid items-center px-5 py-3"
                                  style={{ gridTemplateColumns: "36px 1fr 120px 100px 80px 80px 40px", borderBottom: index === bomRows.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}
                                >
                                  <span className="rounded px-1 py-0.5 font-mono text-xs font-bold w-fit" style={{ background: "rgba(79,142,247,.10)", color: LEGACY_COLORS.blue }}>{childItem?.category}</span>
                                  <div>
                                    <div className="truncate text-sm font-medium" style={{ color: LEGACY_COLORS.text }}>{childItem?.item_name || row.child_item_id}</div>
                                  </div>
                                  <div className="text-right font-mono text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{childItem?.erp_code ?? "-"}</div>
                                  <div className="flex items-center justify-end gap-1">
                                    {editingBomId === row.bom_id ? (
                                      <input
                                        autoFocus
                                        type="number"
                                        value={editingQty}
                                        onChange={(e) => setEditingQty(e.target.value)}
                                        onBlur={() => void saveBomQty(row)}
                                        onKeyDown={(e) => e.key === "Enter" && void saveBomQty(row)}
                                        className="w-14 rounded border bg-transparent px-1 text-right font-mono text-sm outline-none"
                                        style={{ borderColor: LEGACY_COLORS.blue, color: LEGACY_COLORS.text }}
                                      />
                                    ) : (
                                      <span
                                        title="클릭하여 수량 편집"
                                        onClick={() => { setEditingBomId(row.bom_id); setEditingQty(String(row.quantity)); }}
                                        className="cursor-pointer font-mono text-sm hover:underline"
                                        style={{ color: LEGACY_COLORS.text }}
                                      >
                                        ×{formatNumber(row.quantity)}
                                      </span>
                                    )}
                                    <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{row.unit}</span>
                                  </div>
                                  <div className="text-right font-mono text-sm" style={{ color: stock > 0 ? LEGACY_COLORS.text : LEGACY_COLORS.red }}>{formatNumber(stock)}</div>
                                  <div className="text-right font-mono text-sm font-bold" style={{ color: capacity > 0 ? LEGACY_COLORS.cyan : LEGACY_COLORS.muted2 }}>{formatNumber(capacity)}</div>
                                  <div className="flex justify-end">
                                    <button
                                      onClick={() => void api.deleteBOM(row.bom_id).then(() => { setBomRows((current) => current.filter((e) => e.bom_id !== row.bom_id)); refreshAllBom(); })}
                                      className="flex items-center justify-center rounded-full p-1 hover:bg-red-500/10"
                                      style={{ color: LEGACY_COLORS.red }}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex shrink-0 items-center justify-between border-b px-5 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
                          <span className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>전체 BOM 현황</span>
                          <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{allBomRows.length}개 관계</span>
                        </div>
                        {allBomRows.length === 0 ? (
                          <div className="p-5 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>등록된 BOM이 없습니다.</div>
                        ) : (
                          <div className="min-h-0 overflow-y-auto">
                            <div className="grid grid-cols-[80px_1fr_1fr_80px] border-b px-5 py-2 text-sm font-bold uppercase tracking-[0.15em]" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                              <span>구분</span>
                              <span>상위 품목</span>
                              <span>하위 품목</span>
                              <span className="text-right">수량</span>
                            </div>
                            {allBomRows.map((row, index) => (
                              <div
                                key={row.bom_id}
                                className="grid grid-cols-[80px_1fr_1fr_80px] items-center px-5 py-2.5"
                                style={{ borderBottom: index === allBomRows.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}
                              >
                                <div className="flex gap-1">
                                  <span className="rounded px-1 py-0.5 font-mono text-xs font-bold" style={{ background: "rgba(79,142,247,.10)", color: LEGACY_COLORS.blue }}>
                                    {row.parent_erp_code?.split("-")[1] ?? "?"}
                                  </span>
                                </div>
                                <div>
                                  <div className="truncate text-sm">{row.parent_item_name}</div>
                                  <div className="font-mono text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{row.parent_erp_code}</div>
                                </div>
                                <div>
                                  <div className="truncate text-sm">{row.child_item_name}</div>
                                  <div className="font-mono text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{row.child_erp_code}</div>
                                </div>
                                <div className="text-right font-mono text-sm" style={{ color: LEGACY_COLORS.text }}>
                                  ×{formatNumber(row.quantity)}<span className="ml-0.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{row.unit}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {/* ── 출하묶음 ── */}
            {section === "packages" ? (
              <div className="grid h-full gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
                {/* 좌측: 묶음 목록 */}
                <div className="flex min-h-0 flex-col gap-3">
                  <button
                    onClick={() => void createSimplePackage()}
                    className="w-full shrink-0 rounded-[18px] px-4 py-3 text-sm font-bold text-white"
                    style={{ background: LEGACY_COLORS.blue }}
                  >
                    새 출하묶음 생성
                  </button>
                  <div className="min-h-0 overflow-y-auto rounded-[28px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                    {packages.length === 0 && (
                      <div className="px-4 py-6 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>출하묶음이 없습니다.</div>
                    )}
                    {packages.map((pkg, index) => (
                      <div
                        key={pkg.package_id}
                        className="flex items-center gap-2 px-4 py-3"
                        style={{
                          borderBottom: index === packages.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                          background: selectedPackage?.package_id === pkg.package_id ? "rgba(142,125,255,.10)" : "transparent",
                        }}
                      >
                        <button
                          onClick={() => { setSelectedPackage(pkg); setPkgRenaming(false); }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="truncate text-sm font-semibold">{pkg.name}</div>
                          <div className="mt-0.5 font-mono text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{pkg.package_code} · {pkg.items.length}종</div>
                        </button>
                        <button
                          onClick={() => { if (window.confirm(`'${pkg.name}' 묶음을 삭제할까요?`)) void deletePackage(pkg.package_id); }}
                          className="shrink-0 rounded-full p-1.5 transition-colors hover:bg-red-500/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.red }} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 우측: 묶음 상세 */}
                <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
                  {selectedPackage ? (
                    <>
                      {/* 묶음 이름 */}
                      <div className="rounded-[28px] border p-5" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                        {pkgRenaming ? (
                          <div className="flex items-center gap-2">
                            <input
                              autoFocus
                              value={pkgNameDraft}
                              onChange={(e) => setPkgNameDraft(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") void renamePackage(); if (e.key === "Escape") setPkgRenaming(false); }}
                              className="flex-1 rounded-[14px] border px-3 py-2 text-base font-bold outline-none"
                              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.purple, color: LEGACY_COLORS.text }}
                            />
                            <button onClick={() => void renamePackage()} className="rounded-[14px] px-3 py-2 text-sm font-bold text-white" style={{ background: LEGACY_COLORS.purple }}>
                              <Check className="h-4 w-4" />
                            </button>
                            <button onClick={() => setPkgRenaming(false)} className="rounded-[14px] px-3 py-2 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="text-xl font-black">{selectedPackage.name}</div>
                              <div className="mt-0.5 font-mono text-sm" style={{ color: LEGACY_COLORS.muted2 }}>{selectedPackage.package_code}</div>
                            </div>
                            <button
                              onClick={() => { setPkgNameDraft(selectedPackage.name); setPkgRenaming(true); }}
                              className="rounded-[14px] border px-3 py-1.5 text-xs font-bold transition-colors hover:bg-white/10"
                              style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
                            >
                              이름 변경
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 현재 구성 품목 */}
                      <div className="rounded-[28px] border p-5" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                        <div className="mb-3 text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>구성 품목 ({selectedPackage.items.length}종)</div>
                        {selectedPackage.items.length === 0 ? (
                          <div className="py-3 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>아직 품목이 없습니다.</div>
                        ) : (
                          <div className="space-y-2">
                            {selectedPackage.items.map((item) => (
                              <div key={item.package_item_id} className="flex items-center gap-3 rounded-[18px] border px-4 py-3" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-semibold">{item.item_name}</div>
                                  <div className="mt-0.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{formatNumber(item.quantity)} {item.item_unit}</div>
                                </div>
                                <button
                                  onClick={() => void removePackageItem(item.package_item_id)}
                                  className="shrink-0 rounded-full p-1.5 transition-colors hover:bg-red-500/20"
                                >
                                  <X className="h-3.5 w-3.5" style={{ color: LEGACY_COLORS.red }} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 품목 추가 */}
                      <div className="rounded-[28px] border p-5" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                        <div className="mb-3 text-sm font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>품목 추가</div>
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {PKG_CATEGORY_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => setPkgItemCategory(opt.value)}
                              className="rounded-full border px-2.5 py-1 font-mono text-xs font-semibold transition-all"
                              style={{
                                background: pkgItemCategory === opt.value ? `${LEGACY_COLORS.cyan}22` : LEGACY_COLORS.s1,
                                borderColor: pkgItemCategory === opt.value ? LEGACY_COLORS.cyan : LEGACY_COLORS.border,
                                color: pkgItemCategory === opt.value ? LEGACY_COLORS.cyan : LEGACY_COLORS.muted2,
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        <div className="mb-3 flex items-center gap-2 rounded-[14px] border px-3 py-2" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
                          <input
                            value={pkgItemSearch}
                            onChange={(e) => setPkgItemSearch(e.target.value)}
                            placeholder="품목명·코드 검색"
                            className="flex-1 bg-transparent text-sm outline-none"
                            style={{ color: LEGACY_COLORS.text }}
                          />
                          {pkgItemSearch && <button onClick={() => setPkgItemSearch("")} style={{ color: LEGACY_COLORS.muted2 }}>✕</button>}
                        </div>
                        <div className="space-y-2">
                          {filteredPkgItems.map((item) => (
                            <div key={item.item_id} className="flex items-center gap-2 rounded-[18px] border px-3 py-2.5" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                              <div className="min-w-0 flex-1 text-sm">{buildItemSearchLabel(item)}</div>
                              <input
                                type="number"
                                min="1"
                                value={pkgItemQtyMap[item.item_id] ?? 1}
                                onChange={(e) => setPkgItemQtyMap((prev) => ({ ...prev, [item.item_id]: Math.max(1, Number(e.target.value)) }))}
                                className="w-14 rounded-[10px] border px-2 py-1 text-center text-sm font-mono outline-none"
                                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                              />
                              <button
                                onClick={() => void addPackageItem(item.item_id)}
                                className="shrink-0 rounded-[10px] px-3 py-1.5 text-xs font-bold text-white"
                                style={{ background: LEGACY_COLORS.blue }}
                              >
                                추가
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-[28px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                      <div className="text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>왼쪽 목록에서 출하묶음을 선택해 주세요.</div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* ── 모델 관리 ── */}
            {section === "models" ? (
              <div className="overflow-y-auto">
                <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
                  {/* 모델 추가 폼 */}
                  <div className="rounded-[28px] border p-5" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                    <div className="mb-4 flex items-center gap-2 text-base font-bold">
                      <Layers className="h-4 w-4" /> 새 모델 추가
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className="mb-1 block text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>모델명 *</label>
                        <input
                          value={modelAddName}
                          onChange={(e) => setModelAddName(e.target.value)}
                          placeholder="예: ADX8000"
                          className="w-full rounded-[14px] border px-3 py-2 text-base outline-none"
                          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>기호 (1자, 선택)</label>
                        <input
                          value={modelAddSymbol}
                          onChange={(e) => setModelAddSymbol(e.target.value.slice(0, 5))}
                          placeholder="자동 생성"
                          className="w-full rounded-[14px] border px-3 py-2 text-base outline-none"
                          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                        />
                      </div>
                      <button
                        disabled={!modelAddName.trim()}
                        onClick={() => {
                          if (!modelAddName.trim()) return;
                          void api.createModel({ model_name: modelAddName.trim(), symbol: modelAddSymbol.trim() || undefined })
                            .then((created) => {
                              setProductModels((prev) => [...prev, created]);
                              setModelAddName("");
                              setModelAddSymbol("");
                              onStatusChange(`'${created.model_name}' 모델을 추가했습니다.`);
                            })
                            .catch((err) => setMessage(err instanceof Error ? err.message : "모델 추가 실패"));
                        }}
                        className="w-full rounded-[14px] py-2.5 text-base font-bold text-white"
                        style={{ background: modelAddName.trim() ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2, opacity: modelAddName.trim() ? 1 : 0.5 }}
                      >
                        모델 추가
                      </button>
                    </div>
                  </div>

                  {/* 모델 목록 */}
                  <div className="rounded-[28px] border p-5" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-base font-bold">
                        <Layers className="h-4 w-4" /> 등록된 모델
                      </div>
                      <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{productModels.length}개</span>
                    </div>
                    {productModels.length === 0 ? (
                      <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>등록된 모델이 없습니다.</div>
                    ) : (
                      <div className="space-y-2">
                        {productModels.map((model) => (
                          <div
                            key={model.slot}
                            className="flex items-center justify-between rounded-[18px] border px-4 py-3"
                            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-black text-white"
                                style={{ background: LEGACY_COLORS.purple }}
                              >
                                {model.symbol ?? "?"}
                              </div>
                              <div>
                                <div className="text-base font-bold">{model.model_name}</div>
                                <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>슬롯 {model.slot} · 기호 {model.symbol}</div>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                if (!confirm(`'${model.model_name}' 모델을 삭제하시겠습니까?\n이 모델을 사용하는 품목이 있으면 삭제되지 않습니다.`)) return;
                                void api.deleteModel(model.slot)
                                  .then(() => {
                                    setProductModels((prev) => prev.filter((m) => m.slot !== model.slot));
                                    onStatusChange(`'${model.model_name}' 모델을 삭제했습니다.`);
                                  })
                                  .catch((err) => setMessage(err instanceof Error ? err.message : "삭제 실패"));
                              }}
                              className="flex items-center gap-1 rounded-full p-2 hover:bg-red-500/10"
                              style={{ color: LEGACY_COLORS.red }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {/* ── 내보내기 ── */}
            {section === "export" ? (
              <div className="overflow-y-auto">
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-[28px] border p-5" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                    <div className="mb-4 flex items-center gap-2 text-base font-bold">
                      <FileDown className="h-4 w-4" /> 품목 엑셀
                    </div>
                    <p className="mb-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>현재 등록된 전체 품목을 엑셀 파일로 내보냅니다.</p>
                    <a href={api.getItemsExportUrl()} download className="block w-full rounded-[18px] border px-4 py-3 text-center text-sm font-semibold" style={{ borderColor: LEGACY_COLORS.border }}>
                      품목 다운로드
                    </a>
                  </div>
                  <div className="rounded-[28px] border p-5" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                    <div className="mb-4 flex items-center gap-2 text-base font-bold">
                      <FileDown className="h-4 w-4" /> 거래 엑셀
                    </div>
                    <p className="mb-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>전체 입출고 거래 내역을 엑셀 파일로 내보냅니다.</p>
                    <a href={api.getTransactionsExportUrl()} download className="block w-full rounded-[18px] border px-4 py-3 text-center text-sm font-semibold" style={{ borderColor: LEGACY_COLORS.border }}>
                      거래 내역 다운로드
                    </a>
                  </div>
                </div>
              </div>
            ) : null}

            {/* ── 설정 ── */}
            {section === "settings" ? (
              <div className="overflow-y-auto">
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-[28px] border p-5" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                    <div className="mb-4 flex items-center gap-2 text-base font-bold">
                      <KeyRound className="h-4 w-4" /> 관리자 PIN 변경
                    </div>
                    {(Object.entries(pinForm) as [keyof typeof pinForm, string][]).map(([key, value]) => (
                      <input
                        key={key}
                        type="password"
                        value={value}
                        onChange={(event) => setPinForm((current) => ({ ...current, [key]: event.target.value }))}
                        placeholder={key === "current_pin" ? "현재 PIN" : key === "new_pin" ? "새 PIN" : "새 PIN 확인"}
                        className="mb-3 w-full rounded-[18px] border px-4 py-3 text-base outline-none"
                        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                      />
                    ))}
                    <button
                      onClick={() => void changePin()}
                      className="w-full rounded-[18px] px-4 py-3 text-base font-bold text-white"
                      style={{ background: LEGACY_COLORS.blue }}
                    >
                      PIN 저장
                    </button>
                  </div>

                  <div className="rounded-[28px] border p-5" style={{ background: "rgba(255,123,123,.08)", borderColor: "rgba(255,123,123,.24)" }}>
                    <div className="mb-4 flex items-center gap-2 text-base font-bold" style={{ color: LEGACY_COLORS.red }}>
                      <DatabaseBackup className="h-4 w-4" /> 안전 초기화
                    </div>
                    <input
                      type="password"
                      value={resetPin}
                      onChange={(event) => setResetPin(event.target.value)}
                      placeholder="관리자 PIN"
                      className="mb-3 w-full rounded-[18px] border px-4 py-3 text-base outline-none"
                      style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                    />
                    <button
                      onClick={() => void resetDatabase()}
                      className="w-full rounded-[18px] px-4 py-3 text-base font-bold text-white"
                      style={{ background: LEGACY_COLORS.red }}
                    >
                      시드 기준으로 다시 적재
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <DesktopRightPanel title="관리 요약" subtitle="현재 작업 중인 관리자 영역의 핵심 수치를 요약합니다.">
        <div className="space-y-4">
          <div className="rounded-[28px] border p-5 text-base leading-6" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            {section === "items" && "품목 섹션에서는 이름, 바코드, 공급처, 모델 정보를 바로 수정할 수 있습니다."}
            {section === "employees" && "직원 섹션에서는 직원의 운영 상태를 빠르게 전환할 수 있습니다."}
            {section === "bom" && "BOM 섹션에서는 상위 품목을 기준으로 하위 자재를 추가하거나 제거할 수 있습니다."}
            {section === "packages" && "출하묶음 섹션에서는 패키지를 만들고 구성 품목을 빠르게 추가할 수 있습니다."}
            {section === "export" && "엑셀 내보내기 섹션에서 품목·거래 데이터를 엑셀 파일로 다운로드할 수 있습니다."}
            {section === "settings" && "설정 섹션에서는 관리자 PIN 변경, 초기화를 관리합니다."}
          </div>
          <div className="rounded-[28px] border p-5" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            <div className="mb-3 text-sm font-bold uppercase tracking-[0.2em]" style={{ color: LEGACY_COLORS.muted2 }}>
              현재 상태
            </div>
            <div className="space-y-2 text-base">
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
