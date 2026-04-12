"use client";

import type { ElementType } from "react";
import { useEffect, useMemo, useState } from "react";
import { DatabaseBackup, FileDown, KeyRound, PackagePlus, Settings2, ShieldCheck, Users } from "lucide-react";
import { api, type BOMEntry, type Employee, type Item, type ShipPackage } from "@/lib/api";
import { DesktopRightPanel } from "./DesktopRightPanel";
import { PinLock } from "./PinLock";
import { DEPARTMENT_LABELS, LEGACY_COLORS, buildItemSearchLabel, formatNumber, normalizeDepartment } from "./legacyUi";

type AdminSection = "items" | "employees" | "bom" | "packages" | "settings";

const SECTIONS: { id: AdminSection; label: string; icon: ElementType }[] = [
  { id: "items", label: "상품", icon: PackagePlus },
  { id: "employees", label: "직원", icon: Users },
  { id: "bom", label: "BOM", icon: Settings2 },
  { id: "packages", label: "출하묶음", icon: ShieldCheck },
  { id: "settings", label: "설정", icon: KeyRound },
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
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<ShipPackage | null>(null);
  const [parentId, setParentId] = useState("");
  const [bomRows, setBomRows] = useState<BOMEntry[]>([]);
  const [message, setMessage] = useState("");
  const [pinForm, setPinForm] = useState({ current_pin: "", new_pin: "", confirm_pin: "" });
  const [resetPin, setResetPin] = useState("");

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
    if (!globalSearch.trim()) return items.slice(0, 140);
    const keyword = globalSearch.toLowerCase();
    return items.filter((item) => `${item.item_name} ${item.item_code}`.toLowerCase().includes(keyword)).slice(0, 140);
  }, [globalSearch, items]);

  const quickItems = useMemo(() => items.slice(0, 40), [items]);

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
    onStatusChange(`${updated.name}에 구성품을 추가했습니다.`);
  }

  async function addBomRow(childId: string) {
    if (!parentId) return;
    const created = await api.createBOM({ parent_item_id: parentId, child_item_id: childId, quantity: 1, unit: "EA" });
    setBomRows((current) => [...current, created]);
    onStatusChange("BOM 항목을 추가했습니다.");
  }

  async function changePin() {
    if (pinForm.new_pin !== pinForm.confirm_pin) {
      setMessage("새 PIN과 확인 PIN이 서로 다릅니다.");
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
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-6">
        <div className="w-full max-w-[420px] rounded-[32px] border p-6" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
          <PinLock onUnlocked={() => setUnlocked(true)} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)] gap-5 px-6 py-6">
        <section className="space-y-4 rounded-[28px] border p-5" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
          {SECTIONS.map((entry) => {
            const Icon = entry.icon;
            return (
              <button
                key={entry.id}
                onClick={() => setSection(entry.id)}
                className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left"
                style={{
                  background: section === entry.id ? "rgba(124,58,237,.16)" : LEGACY_COLORS.s2,
                  borderColor: section === entry.id ? LEGACY_COLORS.purple : LEGACY_COLORS.border,
                }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: section === entry.id ? LEGACY_COLORS.purple : LEGACY_COLORS.s1, color: section === entry.id ? "#fff" : LEGACY_COLORS.muted2 }}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-sm font-semibold">{entry.label}</span>
              </button>
            );
          })}
          <button onClick={() => setUnlocked(false)} className="w-full rounded-2xl border px-4 py-3 text-sm font-semibold" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
            관리자 잠금
          </button>
        </section>

        <section className="min-h-0 rounded-[28px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
          <div className="border-b px-5 py-4" style={{ borderColor: LEGACY_COLORS.border }}>
            <div className="text-lg font-black">관리자 작업대</div>
            <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              상품, 직원, BOM, 출하묶음, 설정을 한 화면에서 관리합니다.
            </div>
            {message ? <div className="mt-2 text-sm" style={{ color: LEGACY_COLORS.red }}>{message}</div> : null}
          </div>

          <div className="h-[calc(100vh-220px)] overflow-auto px-5 py-5">
            {section === "items" ? (
              <div className="grid grid-cols-[340px_minmax(0,1fr)] gap-4">
                <div className="overflow-hidden rounded-3xl border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  {visibleItems.map((item) => (
                    <button key={item.item_id} onClick={() => setSelectedItem(item)} className="block w-full border-b px-4 py-3 text-left last:border-b-0" style={{ borderColor: LEGACY_COLORS.border }}>
                      <div className="text-sm font-semibold">{item.item_name}</div>
                      <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{item.item_code}</div>
                    </button>
                  ))}
                </div>
                <div className="space-y-3 rounded-3xl border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  {selectedItem ? (
                    <>
                      {([
                        ["item_name", selectedItem.item_name, "품목명"],
                        ["spec", selectedItem.spec || "", "사양"],
                        ["barcode", selectedItem.barcode || "", "바코드"],
                        ["legacy_model", selectedItem.legacy_model || "", "모델"],
                        ["supplier", selectedItem.supplier || "", "공급처"],
                      ] as [keyof Pick<Item, "item_name" | "spec" | "barcode" | "legacy_model" | "supplier">, string, string][]).map(([field, value, label]) => (
                        <div key={field}>
                          <div className="mb-2 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>{label}</div>
                          <input
                            defaultValue={value}
                            onBlur={(event) => void saveItemField(field, event.target.value)}
                            className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                          />
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>왼쪽에서 상품을 선택해 주세요.</div>
                  )}
                </div>
              </div>
            ) : null}

            {section === "employees" ? (
              <div className="grid grid-cols-[minmax(0,1fr)_280px] gap-4">
                <div className="overflow-hidden rounded-3xl border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  {employees.map((employee) => (
                    <button key={employee.employee_id} onClick={() => setSelectedEmployee(employee)} className="flex w-full items-center justify-between border-b px-4 py-3 text-left last:border-b-0" style={{ borderColor: LEGACY_COLORS.border }}>
                      <div>
                        <div className="text-sm font-semibold">{employee.name}</div>
                        <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                          {employee.employee_code} / {normalizeDepartment(employee.department)}
                        </div>
                      </div>
                      <span style={{ color: employee.is_active ? LEGACY_COLORS.green : LEGACY_COLORS.red }}>{employee.is_active ? "활성" : "비활성"}</span>
                    </button>
                  ))}
                </div>
                <div className="rounded-3xl border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  {selectedEmployee ? (
                    <>
                      <div className="mb-2 text-sm font-bold">{selectedEmployee.name}</div>
                      <div className="mb-4 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                        {selectedEmployee.role} / {normalizeDepartment(selectedEmployee.department)}
                      </div>
                      <button onClick={() => void toggleEmployee(selectedEmployee)} className="w-full rounded-2xl px-4 py-3 text-sm font-bold" style={{ background: selectedEmployee.is_active ? LEGACY_COLORS.red : LEGACY_COLORS.green, color: "#fff" }}>
                        {selectedEmployee.is_active ? "비활성 전환" : "활성 전환"}
                      </button>
                    </>
                  ) : (
                    <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>직원을 선택하면 활성 상태를 바꿀 수 있습니다.</div>
                  )}
                </div>
              </div>
            ) : null}

            {section === "bom" ? (
              <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-4">
                <div className="space-y-3 rounded-3xl border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  <select value={parentId} onChange={(event) => setParentId(event.target.value)} className="w-full rounded-2xl border px-4 py-3 text-sm outline-none" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
                    {items.map((item) => <option key={item.item_id} value={item.item_id}>{item.item_code} / {item.item_name}</option>)}
                  </select>
                  {quickItems.map((item) => (
                    <button key={item.item_id} onClick={() => void addBomRow(item.item_id)} className="block w-full rounded-2xl border px-4 py-2 text-left text-sm" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                      {buildItemSearchLabel(item)}
                    </button>
                  ))}
                </div>
                <div className="overflow-hidden rounded-3xl border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  {bomRows.map((row) => (
                    <div key={row.bom_id} className="flex items-center justify-between border-b px-4 py-3 last:border-b-0" style={{ borderColor: LEGACY_COLORS.border }}>
                      <div>
                        <div className="text-sm font-semibold">{items.find((item) => item.item_id === row.child_item_id)?.item_name || row.child_item_id}</div>
                        <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{formatNumber(row.quantity)} {row.unit}</div>
                      </div>
                      <button onClick={() => void api.deleteBOM(row.bom_id).then(() => setBomRows((current) => current.filter((entry) => entry.bom_id !== row.bom_id)))} className="text-sm font-semibold" style={{ color: LEGACY_COLORS.red }}>
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {section === "packages" ? (
              <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-4">
                <div className="space-y-3">
                  <button onClick={() => void createSimplePackage()} className="w-full rounded-2xl px-4 py-3 text-sm font-bold" style={{ background: LEGACY_COLORS.blue, color: "#fff" }}>
                    새 출하묶음 생성
                  </button>
                  <div className="overflow-hidden rounded-3xl border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                    {packages.map((pkg) => (
                      <button key={pkg.package_id} onClick={() => setSelectedPackage(pkg)} className="block w-full border-b px-4 py-3 text-left last:border-b-0" style={{ borderColor: LEGACY_COLORS.border }}>
                        <div className="text-sm font-semibold">{pkg.name}</div>
                        <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{pkg.package_code} / {pkg.items.length}종</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-3xl border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  {selectedPackage ? (
                    <>
                      <div className="mb-3 text-sm font-bold">{selectedPackage.name}</div>
                      <div className="mb-4 space-y-2">
                        {selectedPackage.items.map((item) => (
                          <div key={item.package_item_id} className="rounded-2xl px-4 py-3" style={{ background: LEGACY_COLORS.s1 }}>
                            <div className="text-sm font-semibold">{item.item_name}</div>
                            <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{formatNumber(item.quantity)} {item.item_unit}</div>
                          </div>
                        ))}
                      </div>
                      {quickItems.map((item) => (
                        <button key={item.item_id} onClick={() => void addPackageItem(item.item_id)} className="mb-2 block w-full rounded-2xl border px-4 py-2 text-left text-sm" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                          {buildItemSearchLabel(item)}
                        </button>
                      ))}
                    </>
                  ) : (
                    <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>왼쪽에서 출하묶음을 선택해 주세요.</div>
                  )}
                </div>
              </div>
            ) : null}

            {section === "settings" ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-3xl border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  <div className="mb-3 flex items-center gap-2 text-sm font-bold"><KeyRound className="h-4 w-4" />관리자 PIN 변경</div>
                  {(Object.entries(pinForm) as [keyof typeof pinForm, string][]).map(([key, value]) => (
                    <input key={key} type="password" value={value} onChange={(event) => setPinForm((current) => ({ ...current, [key]: event.target.value }))} placeholder={key} className="mb-3 w-full rounded-2xl border px-4 py-3 text-sm outline-none" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} />
                  ))}
                  <button onClick={() => void changePin()} className="w-full rounded-2xl px-4 py-3 text-sm font-bold" style={{ background: LEGACY_COLORS.blue, color: "#fff" }}>
                    PIN 저장
                  </button>
                </div>
                <div className="space-y-4">
                  <div className="rounded-3xl border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                    <div className="mb-3 flex items-center gap-2 text-sm font-bold"><FileDown className="h-4 w-4" />CSV 내보내기</div>
                    <div className="grid grid-cols-2 gap-2">
                      <a href={api.getItemsExportUrl()} download className="rounded-2xl border px-4 py-3 text-center text-sm font-semibold" style={{ borderColor: LEGACY_COLORS.border }}>품목 CSV</a>
                      <a href={api.getTransactionsExportUrl()} download className="rounded-2xl border px-4 py-3 text-center text-sm font-semibold" style={{ borderColor: LEGACY_COLORS.border }}>거래 CSV</a>
                    </div>
                  </div>
                  <div className="rounded-3xl border p-4" style={{ background: "rgba(242,95,92,.08)", borderColor: "rgba(242,95,92,.25)" }}>
                    <div className="mb-3 flex items-center gap-2 text-sm font-bold" style={{ color: LEGACY_COLORS.red }}><DatabaseBackup className="h-4 w-4" />안전 초기화</div>
                    <input type="password" value={resetPin} onChange={(event) => setResetPin(event.target.value)} placeholder="관리자 PIN" className="mb-3 w-full rounded-2xl border px-4 py-3 text-sm outline-none" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} />
                    <button onClick={() => void resetDatabase()} className="w-full rounded-2xl px-4 py-3 text-sm font-bold" style={{ background: LEGACY_COLORS.red, color: "#fff" }}>
                      시드 기준으로 다시 적재
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <DesktopRightPanel title="관리자 메모" subtitle="현재 섹션에서 자주 하는 작업과 데이터 규모를 요약합니다.">
        <div className="space-y-4">
          <div className="rounded-3xl border p-4 text-sm leading-6" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            {section === "items" && "상품 섹션에서는 레거시 메타 필드를 포함한 품목 정보를 바로 수정할 수 있습니다."}
            {section === "employees" && "직원 섹션에서는 활성 상태를 바꾸고 부서별 운영 상태를 확인할 수 있습니다."}
            {section === "bom" && "BOM 섹션에서는 상위 품목을 선택한 뒤 하위 품목을 빠르게 추가하거나 삭제할 수 있습니다."}
            {section === "packages" && "출하묶음 섹션에서는 패키지 생성과 구성품 추가를 한 흐름으로 처리합니다."}
            {section === "settings" && "설정 섹션에서는 PIN 변경, CSV 내보내기, 데이터 재적재를 수행합니다."}
          </div>
          <div className="rounded-3xl border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
              현재 상태
            </div>
            <div className="space-y-2 text-sm">
              <div>품목 {formatNumber(items.length)}건</div>
              <div>직원 {formatNumber(employees.length)}명</div>
              <div>출하묶음 {formatNumber(packages.length)}건</div>
              <div>BOM {formatNumber(bomRows.length)}건</div>
              <div>부서 수 {formatNumber(Object.keys(DEPARTMENT_LABELS).length)}개</div>
            </div>
          </div>
        </div>
      </DesktopRightPanel>
    </div>
  );
}
